"""figurelib — MargaLink's figure renderer.

Renders a FigureSpec (see web/src/lib/figureSpec.ts; this module reads the same
JSON, camelCase keys and all) against a pandas DataFrame, deterministically.
The browser runs this exact file inside Pyodide (public/figureWorker.mjs); the
CPython selfcheck in web/figurelib/ imports it unchanged. It never touches the
network and never sees anything but the spec and the user's own data.

Errors are FigureError(code, **detail). `detail` holds column names, roles,
enum values and indices only — never a cell value — so it's safe to show and
to log. The full Python traceback is attached as `.traceback` for local
display only; it can quote a value, so it must never leave the device.
"""

from __future__ import annotations

import base64
import io
import logging
import re
import traceback as _tb
from dataclasses import dataclass, field

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from matplotlib import font_manager
from matplotlib import ticker as mticker

__version__ = "1"

logging.getLogger("matplotlib.font_manager").setLevel(logging.ERROR)


class FigureError(Exception):
    def __init__(self, code: str, **detail):
        super().__init__(code)
        self.code = code
        self.detail = detail
        self.traceback: str | None = None


# --- Styles -------------------------------------------------------------------

# Liberation Sans is metric-compatible with Arial/Helvetica and is bundled with
# the app (public/fonts/), registered by the worker when a preset needs it.
SANS = ["Liberation Sans", "Arial", "Helvetica", "DejaVu Sans"]
SERIF = ["Liberation Serif", "Times New Roman", "DejaVu Serif"]

PRESETS: dict[str, dict] = {
    "nature": {"family": "sans-serif", "fonts": SANS, "size": 7, "title": 8, "letters": "lower", "lw": 0.6},
    "science": {"family": "sans-serif", "fonts": SANS, "size": 7, "title": 8, "letters": "upper", "lw": 0.6},
    "medical": {"family": "sans-serif", "fonts": SANS, "size": 8, "title": 9, "letters": "upper", "lw": 0.75},
    "ieee": {"family": "serif", "fonts": SERIF, "size": 8, "title": 8, "letters": "paren", "lw": 0.6},
    "minimal": {"family": "sans-serif", "fonts": SANS, "size": 9, "title": 10, "letters": "lower", "lw": 0.8},
}

PALETTES: dict[str, list[str]] = {
    "okabe-ito": ["#E69F00", "#56B4E9", "#009E73", "#F0E442", "#0072B2", "#D55E00", "#CC79A7", "#000000"],
    "tol-bright": ["#4477AA", "#EE6677", "#228833", "#CCBB44", "#66CCEE", "#AA3377", "#BBBBBB"],
    "tol-muted": ["#332288", "#88CCEE", "#44AA99", "#117733", "#999933", "#DDCC77", "#CC6677", "#882255", "#AA4499"],
    "grey": ["#252525", "#636363", "#969696", "#bdbdbd", "#d9d9d9"],
}

WIDTH_MM = {"single": 89.0, "double": 183.0}


def mm(v: float) -> float:
    return v / 25.4


def figure_size(spec: dict) -> tuple[float, float]:
    width_mm = spec.get("widthMm") if spec["size"] == "custom" and spec.get("widthMm") else WIDTH_MM.get(spec["size"], 89.0)
    rows, cols = spec["layout"]["rows"], spec["layout"]["cols"]
    height_mm = spec.get("heightMm") or width_mm * rows / cols * 0.8
    return mm(width_mm), mm(height_mm)


def rc_for(style: dict) -> dict:
    lw = style["lw"]
    return {
        "font.family": style["family"],
        f"font.{style['family']}": style["fonts"],
        "font.size": style["size"],
        "axes.titlesize": style["title"],
        "axes.labelsize": style["size"],
        "xtick.labelsize": style["size"],
        "ytick.labelsize": style["size"],
        "legend.fontsize": style["size"],
        "axes.linewidth": lw,
        "xtick.major.width": lw,
        "ytick.major.width": lw,
        "xtick.major.size": 3,
        "ytick.major.size": 3,
        "lines.linewidth": lw * 1.6,
        "patch.linewidth": lw,
        "axes.spines.top": False,
        "axes.spines.right": False,
        "legend.frameon": False,
        "svg.fonttype": "none",  # text stays text: the journal's own font applies downstream
        "pdf.fonttype": 42,
        "figure.dpi": 100,
    }


def resolved_font(style: dict) -> str:
    path = font_manager.findfont(font_manager.FontProperties(family=style["fonts"]), fallback_to_default=True)
    return font_manager.FontProperties(fname=path).get_name()


def palette_colors(spec: dict, n: int) -> list[str]:
    name = spec.get("palette", "okabe-ito")
    if name == "custom" and spec.get("colors"):
        base = list(spec["colors"])
    elif name == "viridis":
        cmap = matplotlib.colormaps["viridis"]
        return [matplotlib.colors.to_hex(cmap(i / max(1, n - 1) * 0.9)) for i in range(n)]
    else:
        base = PALETTES.get(name, PALETTES["okabe-ito"])
    return [base[i % len(base)] for i in range(n)]


# --- Data ---------------------------------------------------------------------


def load_frame(csv: str, dtypes: dict[str, str]) -> pd.DataFrame:
    """Types the frame the way the UI shows it. Only an empty cell is missing —
    NA tokens were already turned into empty cells by the client's data prep,
    and a category literally named "NA" must survive."""
    cat = [c for c, t in dtypes.items() if t == "categorical"]
    df = pd.read_csv(io.StringIO(csv), dtype={c: str for c in cat}, keep_default_na=False, na_values=[""])
    for col, kind in dtypes.items():
        if col not in df.columns:
            continue
        if kind == "numeric":
            df[col] = pd.to_numeric(df[col], errors="coerce")
        elif kind == "date":
            df[col] = pd.to_datetime(df[col], errors="coerce", format="mixed")
    return df


def _as_labels(series: pd.Series) -> pd.Series:
    if pd.api.types.is_datetime64_any_dtype(series):
        return series.dt.strftime("%Y-%m-%d")
    return series.astype(str)


def levels(df: pd.DataFrame, col: str) -> list[str]:
    """Category levels in first-appearance order — the same order the client
    uses, so a "#n" group reference means the same group on both sides."""
    return list(pd.unique(_as_labels(df[col].dropna())))


_REF = re.compile(r"^#(\d+)$")


def resolve_ref(ref: str, lv: list[str]) -> str:
    m = _REF.match(ref)
    if m:
        i = int(m.group(1))
        if i < len(lv):
            return lv[i]
        raise FigureError("unknown_group", ref=ref)
    if ref in lv:
        return ref
    raise FigureError("unknown_group", ref=ref)


_KINDS = {
    "numeric": lambda s: pd.api.types.is_numeric_dtype(s) and not pd.api.types.is_bool_dtype(s),
    "date": pd.api.types.is_datetime64_any_dtype,
    "categorical": lambda s: not pd.api.types.is_numeric_dtype(s) and not pd.api.types.is_datetime64_any_dtype(s),
}


def column(panel: dict, df: pd.DataFrame, role: str, kinds: list[str], required: bool = True) -> str | None:
    name = panel["roles"].get(role)
    if not name:
        if required:
            raise FigureError("missing_column", role=role, column=None)
        return None
    if name not in df.columns:
        raise FigureError("missing_column", role=role, column=name)
    if not any(_KINDS[k](df[name]) for k in kinds):
        raise FigureError("wrong_dtype", role=role, column=name, expected=kinds)
    return name


def usable(df: pd.DataFrame, cols: list[str | None]) -> pd.DataFrame:
    used = [c for c in cols if c]
    out = df.dropna(subset=used)
    if out.empty:
        raise FigureError("empty_after_na", columns=used)
    return out


def ordered_levels(df: pd.DataFrame, panel: dict, col: str, value_col: str | None = None) -> list[str]:
    lv = levels(df, col)
    order = panel.get("order") or {"mode": "as-is", "explicit": []}
    mode = order.get("mode", "as-is")
    if mode == "alpha":
        return sorted(lv)
    if mode in ("value-asc", "value-desc") and value_col:
        means = df.groupby(_as_labels(df[col]))[value_col].mean()
        return sorted(lv, key=lambda k: means.get(k, np.nan), reverse=mode == "value-desc")
    if mode == "explicit" and order.get("explicit"):
        first = [resolve_ref(r, lv) for r in order["explicit"]]
        return first + [k for k in lv if k not in first]
    return lv


def summarize(y: np.ndarray, stat: str, error_type: str) -> tuple[float, float | None]:
    y = np.asarray(y, dtype=float)
    y = y[~np.isnan(y)]
    n = len(y)
    center = {
        "mean": float(np.mean(y)) if n else np.nan,
        "median": float(np.median(y)) if n else np.nan,
        "sum": float(np.sum(y)),
        "count": float(n),
    }[stat]
    if error_type in ("none", "column") or n < 2:
        return center, None
    sd = float(np.std(y, ddof=1))
    if error_type == "sd":
        return center, sd
    sem = sd / np.sqrt(n)
    if error_type == "sem":
        return center, sem
    from scipy import stats as _st  # ci95 needs Student's t; the worker loads SciPy for it

    return center, float(_st.t.ppf(0.975, n - 1) * sem)


# --- Per-family renderers -----------------------------------------------------


@dataclass
class Ctx:
    """What overlays, statistics and annotations need after the base draw."""

    positions: dict[str, float] = field(default_factory=dict)  # category level -> axis position
    values: dict[str, np.ndarray] = field(default_factory=dict)  # category level -> samples
    colors: dict[str, str] = field(default_factory=dict)
    top: float = 0.0  # highest drawn data value, for stacking brackets above it
    categorical: bool = False  # categories on the x (or y, when horizontal) axis
    n: dict[str, int] = field(default_factory=dict)


def _dodge(k: int, width: float = 0.8) -> tuple[list[float], float]:
    w = width / max(1, k)
    return [-width / 2 + w * (i + 0.5) for i in range(k)], w


def draw_bar(ax, panel: dict, df: pd.DataFrame, spec: dict) -> Ctx:
    x = column(panel, df, "x", ["categorical", "date"])
    y = column(panel, df, "y", ["numeric"])
    g = column(panel, df, "group", ["categorical"], required=False)
    err_col = column(panel, df, "error", ["numeric"], required=False) if panel["errorType"] == "column" else None
    d = usable(df, [x, y, g, err_col])
    lv = ordered_levels(d, panel, x, y)
    labels = _as_labels(d[x])
    ctx = Ctx(categorical=True)
    horizontal = panel.get("horizontal", False)
    bar = ax.barh if horizontal else ax.bar

    def err_for(rows: pd.DataFrame) -> float | None:
        if err_col:
            return float(rows[err_col].mean())
        return summarize(rows[y].to_numpy(), panel["stat"], panel["errorType"])[1]

    groups = levels(d, g) if g else [None]
    offsets, width = _dodge(len(groups)) if g and not panel.get("stacked") else ([0.0] * len(groups), 0.8)
    colors = palette_colors(spec, len(groups) if g else len(lv))
    bottoms = np.zeros(len(lv))
    for gi, gname in enumerate(groups):
        sub = d if gname is None else d[_as_labels(d[g]) == gname]
        sub_labels = _as_labels(sub[x])
        centers, errs = [], []
        for level in lv:
            rows = sub[sub_labels == level]
            c, e = summarize(rows[y].to_numpy(), panel["stat"], panel["errorType"]) if len(rows) else (np.nan, None)
            if err_col and len(rows):
                e = err_for(rows)
            centers.append(c)
            errs.append(e if e is not None else 0.0)
        pos = np.arange(len(lv)) + offsets[gi]
        color = colors[gi] if g else [colors[i] for i in range(len(lv))]
        kw = {"left" if horizontal else "bottom": bottoms} if panel.get("stacked") and g else {}
        show_err = panel["errorType"] != "none" and not (panel.get("stacked") and g)
        err_kw = {"xerr" if horizontal else "yerr": errs} if show_err else {}
        bar(pos, centers, width * 0.9, color=color, label=gname, edgecolor="black", linewidth=0.4,
            error_kw={"elinewidth": 0.8, "capsize": 2}, **err_kw, **kw)
        if panel.get("stacked") and g:
            bottoms = bottoms + np.nan_to_num(np.array(centers))
        tops = np.nan_to_num(np.array(centers)) + np.array(errs)
        ctx.top = max(ctx.top, float(np.nanmax(tops + (bottoms if panel.get("stacked") and g else 0))) if len(tops) else 0.0)
    for i, level in enumerate(lv):
        ctx.positions[level] = float(i)
        ctx.values[level] = d.loc[labels == level, y].to_numpy(dtype=float)
        ctx.n[level] = int((labels == level).sum())
        if not g:
            ctx.colors[level] = colors[i]
    if g:
        ctx.colors.update({k: colors[i] for i, k in enumerate(groups)})
    _category_ticks(ax, lv, horizontal)
    return ctx


def _category_ticks(ax, lv: list[str], horizontal: bool = False) -> None:
    if horizontal:
        ax.set_yticks(range(len(lv)), lv)
    else:
        ax.set_xticks(range(len(lv)), lv)


def draw_box(ax, panel: dict, df: pd.DataFrame, spec: dict) -> Ctx:
    x = column(panel, df, "x", ["categorical", "date"])
    y = column(panel, df, "y", ["numeric"])
    g = column(panel, df, "group", ["categorical"], required=False)
    d = usable(df, [x, y, g])
    lv = ordered_levels(d, panel, x, y)
    labels = _as_labels(d[x])
    groups = levels(d, g) if g else [None]
    offsets, width = _dodge(len(groups)) if g else ([0.0], 0.6)
    colors = palette_colors(spec, len(groups) if g else len(lv))
    ctx = Ctx(categorical=True)
    for gi, gname in enumerate(groups):
        sub = d if gname is None else d[_as_labels(d[g]) == gname]
        sub_labels = _as_labels(sub[x])
        data = [sub.loc[sub_labels == level, y].to_numpy(dtype=float) for level in lv]
        pos = [i + offsets[gi] for i in range(len(lv))]
        keep = [i for i, v in enumerate(data) if len(v)]
        parts = ax.boxplot([data[i] for i in keep], positions=[pos[i] for i in keep], widths=width * 0.8,
                           patch_artist=True, showfliers=not panel["layers"], vert=not panel.get("horizontal", False),
                           medianprops={"color": "black", "linewidth": 1.0}, manage_ticks=False)
        for j, box in enumerate(parts["boxes"]):
            box.set_facecolor(colors[gi] if g else colors[keep[j]])
            box.set_alpha(0.75)
        if g:
            ax.plot([], [], "s", color=colors[gi], label=gname)
    for i, level in enumerate(lv):
        vals = d.loc[labels == level, y].to_numpy(dtype=float)
        ctx.positions[level] = float(i)
        ctx.values[level] = vals
        ctx.n[level] = len(vals)
        if not g:
            ctx.colors[level] = colors[i]
    ctx.top = float(d[y].max())
    _category_ticks(ax, lv, panel.get("horizontal", False))
    return ctx


def _by_group(d: pd.DataFrame, g: str | None) -> list[tuple[str | None, pd.DataFrame]]:
    if not g:
        return [(None, d)]
    labels = _as_labels(d[g])
    return [(k, d[labels == k]) for k in levels(d, g)]


def draw_scatter(ax, panel: dict, df: pd.DataFrame, spec: dict) -> Ctx:
    x = column(panel, df, "x", ["numeric", "date"])
    y = column(panel, df, "y", ["numeric"])
    g = column(panel, df, "group", ["categorical"], required=False)
    d = usable(df, [x, y, g])
    parts = _by_group(d, g)
    colors = palette_colors(spec, len(parts))
    ctx = Ctx()
    for i, (name, sub) in enumerate(parts):
        ax.scatter(sub[x], sub[y], s=12, color=colors[i], alpha=0.85, linewidths=0, label=name)
        key = name or "all"
        ctx.colors[key] = colors[i]
        ctx.n[key] = len(sub)
    ctx.top = float(d[y].max())
    return ctx


def draw_line(ax, panel: dict, df: pd.DataFrame, spec: dict) -> Ctx:
    x = column(panel, df, "x", ["numeric", "date"])
    y = column(panel, df, "y", ["numeric"])
    g = column(panel, df, "group", ["categorical"], required=False)
    d = usable(df, [x, y, g])
    parts = _by_group(d, g)
    colors = palette_colors(spec, len(parts))
    ctx = Ctx()
    for i, (name, sub) in enumerate(parts):
        rows = []
        for xv, cell in sub.groupby(x, sort=True):
            c, e = summarize(cell[y].to_numpy(), panel["stat"], panel["errorType"])
            rows.append((xv, c, e or 0.0))
        xs = [r[0] for r in rows]
        cs = np.array([r[1] for r in rows])
        es = np.array([r[2] for r in rows])
        ax.plot(xs, cs, marker="o", markersize=2.5, color=colors[i], label=name)
        if panel["errorType"] not in ("none", "column"):
            ax.fill_between(xs, cs - es, cs + es, color=colors[i], alpha=0.2, linewidth=0)
        key = name or "all"
        ctx.colors[key] = colors[i]
        ctx.n[key] = len(sub)
        ctx.top = max(ctx.top, float(np.nanmax(cs + es)))
    if pd.api.types.is_datetime64_any_dtype(d[x]):
        ax.xaxis.set_major_locator(matplotlib.dates.AutoDateLocator(maxticks=6))
        ax.xaxis.set_major_formatter(matplotlib.dates.ConciseDateFormatter(ax.xaxis.get_major_locator()))
    return ctx


def draw_histogram(ax, panel: dict, df: pd.DataFrame, spec: dict) -> Ctx:
    x = column(panel, df, "x", ["numeric"])
    g = column(panel, df, "group", ["categorical"], required=False)
    d = usable(df, [x, g])
    parts = _by_group(d, g)
    colors = palette_colors(spec, len(parts))
    bins = panel.get("bins") or "auto"
    edges = np.histogram_bin_edges(d[x].to_numpy(dtype=float), bins=bins)
    ctx = Ctx()
    for i, (name, sub) in enumerate(parts):
        counts, _, _ = ax.hist(sub[x], bins=edges, color=colors[i], alpha=0.55 if len(parts) > 1 else 0.85,
                               edgecolor="white", linewidth=0.4, label=name)
        key = name or "all"
        ctx.colors[key] = colors[i]
        ctx.n[key] = len(sub)
        ctx.top = max(ctx.top, float(np.max(counts)) if len(counts) else 0.0)
    return ctx


def draw_violin(ax, panel: dict, df: pd.DataFrame, spec: dict) -> Ctx:
    x = column(panel, df, "x", ["categorical", "date"])
    y = column(panel, df, "y", ["numeric"])
    d = usable(df, [x, y])
    lv = ordered_levels(d, panel, x, y)
    labels = _as_labels(d[x])
    colors = palette_colors(spec, len(lv))
    ctx = Ctx(categorical=True)
    data = [d.loc[labels == level, y].to_numpy(dtype=float) for level in lv]
    keep = [i for i, v in enumerate(data) if len(v) > 1]
    parts = ax.violinplot([data[i] for i in keep], positions=keep, widths=0.75, showextrema=False, showmedians=True,
                          vert=not panel.get("horizontal", False))
    for j, body in enumerate(parts["bodies"]):
        body.set_facecolor(colors[keep[j]])
        body.set_edgecolor("black")
        body.set_linewidth(0.4)
        body.set_alpha(0.75)
    parts["cmedians"].set_color("black")
    for i, level in enumerate(lv):
        ctx.positions[level] = float(i)
        ctx.values[level] = data[i]
        ctx.colors[level] = colors[i]
        ctx.n[level] = len(data[i])
    ctx.top = float(d[y].max())
    _category_ticks(ax, lv, panel.get("horizontal", False))
    return ctx


def _jitter(n: int, width: float, seed: int = 0) -> np.ndarray:
    # ponytail: jittered strip, not a true beeswarm; deterministic so a re-render is pixel-identical
    return np.random.default_rng(seed).uniform(-width, width, n)


def draw_strip(ax, panel: dict, df: pd.DataFrame, spec: dict) -> Ctx:
    x = column(panel, df, "x", ["categorical", "date"])
    y = column(panel, df, "y", ["numeric"])
    d = usable(df, [x, y])
    lv = ordered_levels(d, panel, x, y)
    labels = _as_labels(d[x])
    colors = palette_colors(spec, len(lv))
    ctx = Ctx(categorical=True)
    for i, level in enumerate(lv):
        vals = d.loc[labels == level, y].to_numpy(dtype=float)
        ax.scatter(i + _jitter(len(vals), 0.15, seed=i), vals, s=10, color=colors[i], alpha=0.85, linewidths=0)
        ax.hlines(np.mean(vals), i - 0.25, i + 0.25, color="black", linewidth=1.0)
        ctx.positions[level], ctx.values[level], ctx.colors[level], ctx.n[level] = float(i), vals, colors[i], len(vals)
    ctx.top = float(d[y].max())
    _category_ticks(ax, lv)
    return ctx


def draw_heatmap(ax, panel: dict, df: pd.DataFrame, spec: dict) -> Ctx:
    """No roles: correlation matrix of every numeric column (Pearson, or
    Spearman when the panel's test says so). x/y/value roles: a pivot of the
    value's mean by x (columns) and y (rows)."""
    ctx = Ctx()
    xr, yr, vr = panel["roles"].get("x"), panel["roles"].get("y"), panel["roles"].get("value")
    if xr or yr or vr:
        x = column(panel, df, "x", ["categorical", "date"])
        y = column(panel, df, "y", ["categorical", "date"])
        v = column(panel, df, "value", ["numeric"])
        d = usable(df, [x, y, v])
        cols, rows = levels(d, x), levels(d, y)
        table = d.assign(_x=_as_labels(d[x]), _y=_as_labels(d[y])).pivot_table(index="_y", columns="_x", values=v, aggfunc="mean")
        matrix = table.reindex(index=rows, columns=cols).to_numpy(dtype=float)
        cmap, vmin, vmax, xlabels, ylabels = "viridis", None, None, cols, rows
    else:
        numeric = [c for c in df.columns if _KINDS["numeric"](df[c])]
        if len(numeric) < 2:
            raise FigureError("too_few_groups", reason="a correlation matrix needs at least two numeric columns")
        method = "spearman" if (panel.get("stats") or {}).get("test") == "spearman" else "pearson"
        matrix = df[numeric].corr(method=method).to_numpy(dtype=float)
        cmap, vmin, vmax, xlabels, ylabels = "RdBu_r", -1, 1, numeric, numeric
    im = ax.imshow(matrix, cmap=cmap, vmin=vmin, vmax=vmax, aspect="auto")
    ax.set_xticks(range(len(xlabels)), xlabels, rotation=45, ha="right")
    ax.set_yticks(range(len(ylabels)), ylabels)
    ax.spines[:].set_visible(False)
    ax.tick_params(length=0)
    bar = ax.figure.colorbar(im, ax=ax, shrink=0.8)
    bar.outline.set_linewidth(0.4)
    if matrix.shape[0] <= 12 and matrix.shape[1] <= 12:
        span = (vmax - vmin) if vmax is not None else (np.nanmax(matrix) - np.nanmin(matrix) or 1)
        mid = 0 if vmax is not None else np.nanmin(matrix) + span / 2
        for (r, c), val in np.ndenumerate(matrix):
            if np.isnan(val):
                continue
            dark = abs(val - mid) > span * 0.3
            ax.text(c, r, f"{val:.2f}", ha="center", va="center", fontsize=matplotlib.rcParams["font.size"] - 1,
                    color="white" if dark else "black", gid="cell")
    return ctx


def draw_forest(ax, panel: dict, df: pd.DataFrame, spec: dict) -> Ctx:
    x = column(panel, df, "x", ["numeric"])
    y = column(panel, df, "y", ["categorical", "date"])
    lo = column(panel, df, "lower", ["numeric"])
    hi = column(panel, df, "upper", ["numeric"])
    g = column(panel, df, "group", ["categorical"], required=False)
    d = usable(df, [x, y, lo, hi, g])
    colors = palette_colors(spec, len(levels(d, g)) if g else 1)
    color_of = {k: colors[i] for i, k in enumerate(levels(d, g))} if g else {}
    labels = _as_labels(d[y]).tolist()
    for i, (_, row) in enumerate(d.iterrows()):
        color = color_of.get(str(row[g]), "black") if g else "black"
        ax.hlines(i, row[lo], row[hi], color=color, linewidth=1.0)
        ax.plot(row[x], i, "s", color=color, markersize=4)
    ratios = bool((d[[x, lo, hi]] > 0).all().all())
    ref = 1 if ratios else 0
    ax.axvline(ref, color="0.4", linestyle="--", linewidth=0.8, gid="reference")
    ax.set_yticks(range(len(labels)), labels)
    ax.invert_yaxis()
    ax.spines["left"].set_visible(False)
    ax.tick_params(axis="y", length=0)
    if g:
        for k, c in color_of.items():
            ax.plot([], [], "s", color=c, label=k)
    return Ctx(n={"rows": len(d)}, colors=color_of)


def km_estimate(time: np.ndarray, event: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Kaplan-Meier: (distinct times, S(t) after each, number at risk just before each)."""
    time = np.asarray(time, dtype=float)
    event = np.asarray(event).astype(bool)
    times = np.unique(time)
    at_risk = np.array([(time >= t).sum() for t in times])
    deaths = np.array([((time == t) & event).sum() for t in times])
    surv = np.cumprod(1 - deaths / at_risk)
    return times, surv, at_risk


def draw_km(ax, panel: dict, df: pd.DataFrame, spec: dict) -> Ctx:
    t = column(panel, df, "time", ["numeric"])
    e = column(panel, df, "event", ["numeric"])
    g = column(panel, df, "group", ["categorical"], required=False)
    d = usable(df, [t, e, g])
    if not set(np.unique(d[e])).issubset({0, 1}):
        raise FigureError("wrong_dtype", role="event", column=e, expected=["0/1"])
    parts = _by_group(d, g)
    colors = palette_colors(spec, len(parts))
    ctx = Ctx()
    for i, (name, sub) in enumerate(parts):
        times, surv, _ = km_estimate(sub[t].to_numpy(), sub[e].to_numpy())
        xs = np.concatenate([[0.0], times])
        ys = np.concatenate([[1.0], surv])
        ax.step(xs, ys, where="post", color=colors[i], label=name)
        if panel.get("censorTicks", True):
            cens = sub.loc[sub[e] == 0, t].to_numpy(dtype=float)
            if len(cens):
                s_at = ys[np.searchsorted(xs, cens, side="right") - 1]
                (line,) = ax.plot(cens, s_at, "|", color=colors[i], markersize=5, markeredgewidth=0.8)
                line.set_gid("censor")
        key = name or "all"
        ctx.colors[key], ctx.n[key] = colors[i], len(sub)
    ax.set_ylim(0, 1.02)
    ax.set_xlim(left=0)
    table = getattr(ax, "at_risk_axes", None)
    if table is not None:
        _at_risk_table(ax, table, parts, t)
    return ctx


def _at_risk_table(ax, table, parts: list, tcol: str) -> None:
    # Fix the tick positions now so the axis and the table columns can't diverge
    # when matplotlib re-picks ticks at draw time.
    lo, hi = ax.get_xlim()
    ticks = [v for v in mticker.MaxNLocator(nbins=6, steps=[1, 2, 2.5, 5, 10]).tick_values(lo, hi) if lo <= v <= hi]
    ax.set_xticks(ticks)
    k = len(parts)
    table.set_xlim(ax.get_xlim())
    table.set_ylim(-0.5, k - 0.5)
    table.invert_yaxis()
    for row, (_name, sub) in enumerate(parts):
        times = sub[tcol].to_numpy(dtype=float)
        for v in ticks:
            table.text(v, row, str(int((times >= v).sum())), ha="center", va="center")
    table.set_yticks(range(k), [n or "All" for n, _ in parts])
    table.set_xticks([])
    table.tick_params(length=0, axis="both")
    table.tick_params(axis="y", pad=10)  # keep row labels clear of the first column's counts
    table.spines[:].set_visible(False)
    table.set_title("Number at risk", fontsize=matplotlib.rcParams["font.size"], loc="left")


RENDERERS = {
    "bar": draw_bar,
    "box": draw_box,
    "violin": draw_violin,
    "strip": draw_strip,
    "scatter": draw_scatter,
    "line": draw_line,
    "histogram": draw_histogram,
    "heatmap": draw_heatmap,
    "forest": draw_forest,
    "km": draw_km,
}


# --- Axes, layout, letters, legends ------------------------------------------


def _axis_text(ax_spec: dict, fallback: str | None) -> str:
    label = ax_spec.get("label") or fallback or ""
    unit = ax_spec.get("unit")
    return f"{label} ({unit})" if unit else label


_FORMATTERS = {
    "plain": lambda: mticker.ScalarFormatter(useOffset=False),
    "percent": lambda: mticker.PercentFormatter(xmax=1.0, decimals=0),
    "sci": lambda: mticker.LogFormatterSciNotation(),
    "thousands": lambda: mticker.FuncFormatter(lambda v, _p: f"{v:,.0f}"),
}


def _apply_axis(axis_obj, setter_label, setter_lim, setter_scale, ax_spec: dict, fallback: str | None, value_axis: bool):
    setter_label(_axis_text(ax_spec, fallback))
    if ax_spec.get("log") and value_axis:
        setter_scale("log")
        if ax_spec.get("tickFormat", "auto") == "auto":  # 0.5, 1, 2 — not 5x10^-1
            axis_obj.set_major_locator(mticker.LogLocator(subs=(1.0, 2.0, 5.0)))
            axis_obj.set_major_formatter(mticker.FormatStrFormatter("%g"))
            axis_obj.set_minor_formatter(mticker.NullFormatter())
    lo, hi = ax_spec.get("min"), ax_spec.get("max")
    if lo is not None or hi is not None:
        setter_lim(lo, hi)
    fmt = ax_spec.get("tickFormat", "auto")
    if fmt != "auto" and value_axis:
        axis_obj.set_major_formatter(_FORMATTERS[fmt]())


def apply_axes(ax, panel: dict, ctx: Ctx) -> None:
    roles = panel["roles"]
    family = panel["family"]
    if panel.get("title"):
        ax.set_title(panel["title"])
    if family == "heatmap":  # labelled by its own row/column ticks
        return
    if family == "forest":  # one value axis (x); rows are labelled by ticks
        _apply_axis(ax.xaxis, ax.set_xlabel, ax.set_xlim, ax.set_xscale, panel["x"], roles.get("x"), value_axis=True)
        return
    x_fallback = roles.get("time") if family == "km" else roles.get("x")
    y_fallback = {"histogram": "Count", "km": "Survival probability"}.get(family, roles.get("y"))
    horizontal = ctx.categorical and panel.get("horizontal", False)
    cat_spec, val_spec = panel["x"], panel["y"]
    if horizontal:
        _apply_axis(ax.yaxis, ax.set_ylabel, ax.set_ylim, ax.set_yscale, cat_spec, x_fallback, value_axis=False)
        _apply_axis(ax.xaxis, ax.set_xlabel, ax.set_xlim, ax.set_xscale, val_spec, y_fallback, value_axis=True)
    else:
        _apply_axis(ax.xaxis, ax.set_xlabel, ax.set_xlim, ax.set_xscale, cat_spec, x_fallback, value_axis=not ctx.categorical)
        _apply_axis(ax.yaxis, ax.set_ylabel, ax.set_ylim, ax.set_yscale, val_spec, y_fallback, value_axis=True)


def build_axes(fig, spec: dict, df: pd.DataFrame | None = None) -> list:
    rows, cols = spec["layout"]["rows"], spec["layout"]["cols"]
    grid = fig.add_gridspec(rows, cols)
    axes, r, c = [], 0, 0
    for panel in spec["panels"]:
        span = max(1, min(int(panel.get("colSpan") or 1), cols))
        if c + span > cols:
            r, c = r + 1, 0
        if r >= rows:
            raise FigureError("unsupported_combo", reason="more panels than the layout has cells")
        cell = grid[r, c : c + span]
        if panel.get("family") == "km" and panel.get("atRiskTable"):
            # A real grid row under the curves (not an inset), so the layout
            # engine reserves room for it; _at_risk_table matches its x limits.
            g = panel["roles"].get("group")
            k = len(levels(df, g)) if df is not None and g and g in df.columns else 1
            inner = cell.subgridspec(2, 1, height_ratios=[4, 0.45 * k + 0.5], hspace=0.05)
            ax = fig.add_subplot(inner[0])
            table = fig.add_subplot(inner[1])  # not sharex: hiding its ticks would hide the curves' too
            table.set_label("at-risk")
            ax.at_risk_axes = table
        else:
            ax = fig.add_subplot(cell)
        ax.set_label("panel")
        axes.append(ax)
        c += span
        if c >= cols:
            r, c = r + 1, 0
    return axes


def _letter(i: int, style: str) -> str:
    ch = "abcdefghijklmnopqrstuvwxyz"[i]
    return {"lower": ch, "upper": ch.upper(), "paren": f"({ch})"}[style]


def letter_panels(axes: list, style: dict) -> None:
    for i, ax in enumerate(axes):
        ax.text(-0.02, 1.02, _letter(i, style["letters"]), transform=ax.transAxes, ha="right", va="bottom",
                fontweight="bold", fontsize=style["size"] + 1, gid="panel-letter")


def shared_legend(fig, axes: list) -> None:
    handles, labels = [], []
    for ax in axes:
        for h, lab in zip(*ax.get_legend_handles_labels()):
            if lab not in labels and not lab.startswith("_"):
                handles.append(h)
                labels.append(lab)
        if ax.get_legend():
            ax.get_legend().remove()
    if handles:
        fig.legend(handles, labels, loc="outside lower center", ncols=min(len(labels), 6), frameon=False)


# --- Entry points -------------------------------------------------------------


def render(spec: dict, df: pd.DataFrame):
    """spec + frame -> (matplotlib Figure, meta). meta = {"font", "panels": [{"n", "tests"}]}."""
    where = {"stage": "setup", "family": None}
    try:
        return _render(spec, df, where)
    except FigureError as err:
        err.traceback = err.traceback or _tb.format_exc()
        raise
    except Exception as exc:
        err = FigureError("render_failed", stage=where["stage"], family=where["family"])
        err.traceback = _tb.format_exc()
        raise err from exc


def _render(spec: dict, df: pd.DataFrame, where: dict):
    if not spec.get("panels"):
        raise FigureError("unsupported_combo", reason="no panels")
    style = PRESETS.get(spec.get("style", "nature"), PRESETS["nature"])
    with matplotlib.rc_context(rc_for(style)):
        fig = plt.figure(figsize=figure_size(spec), layout="constrained")
        axes = build_axes(fig, spec, df)
        meta = {"font": resolved_font(style), "panels": []}
        for ax, panel in zip(axes, spec["panels"]):
            where.update(stage="draw", family=panel["family"])
            renderer = RENDERERS.get(panel["family"])
            if renderer is None:
                raise FigureError("unsupported_combo", family=panel["family"])
            ctx = renderer(ax, panel, df, spec)
            where.update(stage="axes")
            apply_axes(ax, panel, ctx)
            if panel.get("legend") and panel["roles"].get("group") and not spec["layout"].get("sharedLegend"):
                ax.legend(loc="best")
            meta["panels"].append({"n": dict(ctx.n), "tests": []})
        where.update(stage="layout", family=None)
        if spec["layout"].get("letters") and len(axes) > 1:
            letter_panels(axes, style)
        if spec["layout"].get("sharedLegend"):
            shared_legend(fig, axes)
    return fig, meta


def _probe_tiff_lzw() -> str | None:
    from PIL import Image

    try:
        Image.new("RGB", (1, 1)).save(io.BytesIO(), format="TIFF", compression="tiff_lzw")
        return "tiff_lzw"
    except (OSError, KeyError, ValueError):  # Pillow built without libtiff's LZW encoder
        return None


_TIFF_COMPRESSION = _probe_tiff_lzw()


def export(fig, formats: list[str], dpi: int) -> dict[str, str]:
    """Figure -> {format: base64}. No bbox cropping: the figure keeps its exact
    journal width (constrained layout already fits the labels inside it)."""
    out: dict[str, str] = {}
    with matplotlib.rc_context({"svg.fonttype": "none", "pdf.fonttype": 42}):
        for fmt in formats:
            buf = io.BytesIO()
            if fmt == "tiff":
                from PIL import Image

                png = io.BytesIO()
                fig.savefig(png, format="png", dpi=dpi, facecolor="white")
                png.seek(0)
                img = Image.open(png).convert("RGB")
                kw = {"compression": _TIFF_COMPRESSION} if _TIFF_COMPRESSION else {}
                img.save(buf, format="TIFF", dpi=(dpi, dpi), **kw)
            else:
                fig.savefig(buf, format=fmt, dpi=dpi, facecolor="white")
            out[fmt] = base64.b64encode(buf.getvalue()).decode()
    return out


def close(fig=None) -> None:
    plt.close(fig if fig is not None else "all")
