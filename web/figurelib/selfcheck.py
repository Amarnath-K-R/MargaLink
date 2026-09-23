"""Runnable check for web/public/figurelib.py — the same module the browser runs
in Pyodide, exercised here in CPython with the same library versions.
Run:  uv run selfcheck.py"""

import base64
import io
import sys
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).parent.parent / "public"))
import figurelib as fl

SAMPLES = Path(__file__).parent / "samples"
DTYPES = {
    "trial": {
        "subject_id": "categorical", "arm": "categorical", "sex": "categorical", "dose": "numeric",
        "baseline": "numeric", "week12": "numeric", "change": "numeric", "visit_date": "date",
    },
    "survival": {"id": "numeric", "arm": "categorical", "time_months": "numeric", "event": "numeric", "age": "numeric"},
    "meta": {"study": "categorical", "year": "numeric", "hr": "numeric", "ci_low": "numeric", "ci_high": "numeric", "weight": "numeric"},
}


def frame(name: str):
    return fl.load_frame((SAMPLES / f"{name}.csv").read_text(), DTYPES[name])


def axis(**kw):
    return {"label": "", "unit": "", "min": None, "max": None, "log": False, "tickFormat": "auto", **kw}


def panel(family: str, **roles):
    base = {r: None for r in ["x", "y", "group", "error", "lower", "upper", "value", "time", "event"]}
    base.update(roles)
    return {
        "title": "", "family": family, "roles": base, "x": axis(), "y": axis(),
        "stat": "mean", "errorType": "none", "stacked": False, "horizontal": False, "bins": None,
        "order": {"mode": "as-is", "explicit": []}, "layers": [], "annotations": [],
        "stats": {"test": None, "pairs": "all", "explicit": [], "display": "stars", "reference": None},
        "atRiskTable": False, "censorTicks": True, "colSpan": 1, "legend": True,
    }


def spec(panels, rows=1, cols=None, **kw):
    return {
        "version": 1, "style": "nature", "size": "single", "widthMm": None, "heightMm": None,
        "palette": "okabe-ito", "colors": [],
        "layout": {"rows": rows, "cols": cols or len(panels), "letters": False, "sharedLegend": False},
        "panels": panels, **kw,
    }


def png_size(b64: str):
    return Image.open(io.BytesIO(base64.b64decode(b64))).size


trial = frame("trial")

# 1. typing honours the client's dtypes
assert str(trial["dose"].dtype).startswith("float") or str(trial["dose"].dtype).startswith("int"), trial.dtypes
assert trial["arm"].dtype == object or str(trial["arm"].dtype) == "str", trial["arm"].dtype
assert str(trial["visit_date"].dtype).startswith("datetime64"), trial["visit_date"].dtype
assert fl.levels(trial, "arm") == ["Placebo", "Low", "High"], "levels keep first-appearance order"

# 2. the five core families render on real data
for fam, roles in {
    "bar": {"x": "arm", "y": "change", "group": "sex"},
    "box": {"x": "arm", "y": "change"},
    "scatter": {"x": "dose", "y": "change", "group": "arm"},
    "line": {"x": "visit_date", "y": "change", "group": "sex"},
    "histogram": {"x": "change", "group": "arm"},
}.items():
    fig, meta = fl.render(spec([panel(fam, **roles)]), trial)
    assert len(meta["panels"]) == 1, fam
    fl.close(fig)

# 3. exports: four formats, exact journal width in pixels
p = panel("bar", x="arm", y="change")
p["errorType"] = "sem"
fig, _ = fl.render(spec([p]), trial)
out = fl.export(fig, ["png", "svg", "pdf", "tiff"], 300)
assert set(out) == {"png", "svg", "pdf", "tiff"}
w, _h = png_size(out["png"])
assert abs(w - round(89 / 25.4 * 300)) <= 1, f"single-column PNG must be 89 mm wide at 300 dpi, got {w}px"
tw, _th = png_size(out["tiff"])
assert tw == w, "TIFF matches the PNG size"
assert base64.b64decode(out["svg"]).lstrip().startswith(b"<?xml"), "SVG export"
assert base64.b64decode(out["pdf"]).startswith(b"%PDF"), "PDF export"
fl.close(fig)

# 4. a missing column is a structured error that never quotes a cell value
try:
    fl.render(spec([panel("bar", x="arm", y="nope")]), trial)
    raise AssertionError("expected FigureError")
except fl.FigureError as e:
    assert e.code == "missing_column" and e.detail["column"] == "nope", (e.code, e.detail)
    for value in trial["subject_id"].astype(str).tolist() + trial["change"].astype(str).tolist():
        assert value not in str(e.detail), "error detail must never contain a cell value"

# 5. a 2x2 compound figure with panel letters
four = spec([panel("bar", x="arm", y="change"), panel("box", x="arm", y="change"), panel("scatter", x="dose", y="change"),
             panel("histogram", x="change")], rows=2, cols=2)
four["layout"]["letters"] = True
fig, meta = fl.render(four, trial)
data_axes = [a for a in fig.axes if a.get_label() == "panel"]
assert len(data_axes) == 4, len(data_axes)
letters = [t.get_text() for a in data_axes for t in a.texts if t.get_gid() == "panel-letter"]
assert letters == ["a", "b", "c", "d"], letters
assert all(t.get_fontweight() == "bold" for a in data_axes for t in a.texts if t.get_gid() == "panel-letter")
fl.close(fig)

# 6. a shared legend replaces per-panel legends
two = spec([panel("bar", x="arm", y="change", group="sex"), panel("box", x="arm", y="baseline", group="sex")], cols=2)
two["layout"]["sharedLegend"] = True
fig, _ = fl.render(two, trial)
assert len(fig.legends) == 1 and all(a.get_legend() is None for a in fig.axes), "exactly one figure legend"
fl.close(fig)

# 7. presets
fig, meta = fl.render(spec([panel("bar", x="arm", y="change")]), trial)
assert abs(fig.get_figwidth() - 89 / 25.4) < 1e-6 and fl.PRESETS["nature"]["size"] == 7
fl.close(fig)
ieee = spec([panel("bar", x="arm", y="change")], style="ieee")
fig, meta = fl.render(ieee, trial)
assert fl.PRESETS["ieee"]["family"] == "serif" and meta["font"] in fl.PRESETS["ieee"]["fonts"], meta["font"]
fl.close(fig)

# 8. summaries
c, e = fl.summarize(np.array([1.0, 2, 3, 4]), "mean", "sd")
assert abs(c - 2.5) < 1e-9 and abs(e - 1.2909944) < 1e-6
_, e = fl.summarize(np.array([1.0, 2, 3, 4]), "mean", "sem")
assert abs(e - 0.6454972) < 1e-6
_, e = fl.summarize(np.array([1.0, 2, 3, 4]), "mean", "ci95")
assert abs(e - 2.0542) < 1e-3, e

# --- Task 2: violin, strip, heatmap, forest, Kaplan-Meier ---

# 9. KM estimator against a hand-computed table (one row per distinct time)
t, s, at_risk = fl.km_estimate(np.array([1, 2, 2, 3, 5, 6.0]), np.array([1, 1, 0, 1, 0, 1]))
assert list(t) == [1, 2, 3, 5, 6], t
assert np.allclose(s, [5 / 6, 2 / 3, 4 / 9, 4 / 9, 0.0]), s
assert list(at_risk) == [6, 5, 3, 2, 1], at_risk

survival = frame("survival")
meta_df = frame("meta")

# 10. KM curves by arm with censor ticks and an at-risk table under the axes
p = panel("km", time="time_months", event="event", group="arm")
p["atRiskTable"] = True
fig, meta = fl.render(spec([p]), survival)
ax = next(a for a in fig.axes if a.get_label() == "panel")
tables = [a for a in fig.axes if a.get_label() == "at-risk"]
assert len(tables) == 1, "one at-risk table"
assert [t.get_text() for t in tables[0].get_yticklabels()] == ["Control", "Treatment"], "one row per arm"
assert any(line.get_gid() == "censor" for line in ax.lines), "censor ticks drawn"
assert [t.get_text() for t in ax.get_xticklabels() if t.get_text()], "the curves keep their time-axis tick labels"
assert tables[0].get_xlim() == ax.get_xlim(), "the table's columns line up with the time axis"
columns = sorted({round(t.get_position()[0], 6) for t in tables[0].texts})
assert columns == [round(v, 6) for v in ax.get_xticks()], (columns, list(ax.get_xticks()))
assert meta["panels"][0]["n"] == {"Control": 40, "Treatment": 40}
fl.close(fig)

# 11. forest: reference line at 1 for ratios, at 0 when estimates go negative
fig, _ = fl.render(spec([panel("forest", x="hr", y="study", lower="ci_low", upper="ci_high")]), meta_df)
ax = fig.axes[0]
ref = [ln for ln in ax.lines if ln.get_gid() == "reference"]
assert len(ref) == 1 and list(ref[0].get_xdata()) == [1, 1], "ratio reference at 1"
labels = [t.get_text() for t in ax.get_yticklabels()]
assert labels[0] == "Adams 2015" and labels[-1] == "Hughes 2022" and ax.yaxis_inverted(), "rows read top-down in data order"
fl.close(fig)
diff = meta_df.assign(hr=meta_df["hr"] - 1, ci_low=meta_df["ci_low"] - 1, ci_high=meta_df["ci_high"] - 1)
fig, _ = fl.render(spec([panel("forest", x="hr", y="study", lower="ci_low", upper="ci_high")]), diff)
ref = [ln for ln in fig.axes[0].lines if ln.get_gid() == "reference"]
assert list(ref[0].get_xdata()) == [0, 0], "difference reference at 0"
fl.close(fig)

# 12. heatmap: correlation matrix of the numeric columns (symmetric, colorbar, cell labels); pivot with roles
fig, _ = fl.render(spec([panel("heatmap")]), trial)
ax = next(a for a in fig.axes if a.get_label() == "panel")
m = np.asarray(ax.images[0].get_array())
assert m.shape == (4, 4) and np.allclose(m, m.T) and np.allclose(np.diag(m), 1), m.shape
assert any(a.get_label() == "<colorbar>" for a in fig.axes), "colorbar"
assert sum(1 for t in ax.texts if t.get_gid() == "cell") == 16, "cell labels on a small matrix (4 numeric columns)"
fl.close(fig)
fig, _ = fl.render(spec([panel("heatmap", x="arm", y="sex", value="change")]), trial)
m = np.asarray(next(a for a in fig.axes if a.get_label() == "panel").images[0].get_array())
assert m.shape == (2, 3), "pivot: sex rows x arm columns"
fl.close(fig)

# 13. violin and strip render; strip jitter is deterministic
fig, _ = fl.render(spec([panel("violin", x="arm", y="change")]), trial)
fl.close(fig)
strip = spec([panel("strip", x="arm", y="change")])
a = fl.export(fl.render(strip, trial)[0], ["png"], 150)["png"]
fl.close()
b = fl.export(fl.render(strip, trial)[0], ["png"], 150)["png"]
fl.close()
assert a == b, "strip jitter must be deterministic (identical renders)"

print("figurelib.selfcheck: OK")
