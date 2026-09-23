"""Runnable check for web/public/figurelib.py — the same module the browser runs
in Pyodide, exercised here in CPython with the same library versions.
Run:  uv run selfcheck.py"""

import base64
import io
from pathlib import Path

import numpy as np
import pandas as pd
from PIL import Image

import specs
from specs import DTYPES, SAMPLES, fl, frame  # noqa: F401 - re-exported for readability below


def axis(**kw):
    return specs.axis(**kw)


def panel(family: str, **roles):
    # The tests were written against errorType "none" / no at-risk table defaults.
    p = specs.panel(family, **roles)
    p["errorType"] = "none"
    p["atRiskTable"] = False
    return p


def spec(panels, rows=1, cols=None, **kw):
    s = specs.spec(panels, rows=rows, cols=cols, **kw)
    s["layout"]["letters"] = False
    return s


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

# --- Task 3: overlays, statistics, brackets, annotations ---
import itertools

from scipy import stats as st

a_arr = np.array([5.1, 4.9, 6.2, 5.8, 6.0, 5.5, 5.2])
b_arr = np.array([6.4, 6.8, 7.1, 6.0, 7.4, 6.9, 7.0])

# 14. pairwise tests agree with scipy; "auto" = Welch for two groups
assert abs(fl.pairwise_p(a_arr, b_arr, "t")[0] - st.ttest_ind(a_arr, b_arr).pvalue) < 1e-12
assert abs(fl.pairwise_p(a_arr, b_arr, "welch")[0] - st.ttest_ind(a_arr, b_arr, equal_var=False).pvalue) < 1e-12
assert abs(fl.pairwise_p(a_arr, b_arr, "mannwhitney")[0] - st.mannwhitneyu(a_arr, b_arr, alternative="two-sided").pvalue) < 1e-12
assert abs(fl.pairwise_p(a_arr, b_arr, "wilcoxon")[0] - st.wilcoxon(a_arr, b_arr).pvalue) < 1e-12
assert fl.pairwise_p(a_arr, b_arr, "auto")[1] == "welch"

# 15. omnibus tests agree with scipy
three = [a_arr, b_arr, a_arr + 2]
assert abs(fl.omnibus_p(three, "anova") - st.f_oneway(*three).pvalue) < 1e-12
assert abs(fl.omnibus_p(three, "kruskal") - st.kruskal(*three).pvalue) < 1e-12
r, p_r = fl.correlation(a_arr, b_arr, "spearman")
assert abs(r - st.spearmanr(a_arr, b_arr).statistic) < 1e-12

# 16. log-rank: Freireich 6-MP vs placebo (R survdiff: chi-square 16.8 on 1 df), and the k-group
#     implementation equals the independent two-group scalar formula
mp_t = [6, 6, 6, 6, 7, 9, 10, 10, 11, 13, 16, 17, 19, 20, 22, 23, 25, 32, 32, 34, 35]
mp_e = [1, 1, 1, 0, 1, 0, 1, 0, 0, 1, 1, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0]
pl_t = [1, 1, 2, 2, 3, 4, 4, 5, 5, 8, 8, 8, 8, 11, 11, 12, 12, 15, 17, 22, 23]
times = np.array(mp_t + pl_t, dtype=float)
events = np.array(mp_e + [1] * len(pl_t))
labels = np.array(["6-MP"] * len(mp_t) + ["placebo"] * len(pl_t))
chi2, p_lr = fl.logrank(times, events, labels)
assert abs(chi2 - 16.79) < 0.01, chi2
o_minus_e, var = 0.0, 0.0
for t_ in np.unique(times[events == 1]):
    n = (times >= t_).sum()
    n1 = ((times >= t_) & (labels == "6-MP")).sum()
    d = ((times == t_) & (events == 1)).sum()
    d1 = ((times == t_) & (events == 1) & (labels == "6-MP")).sum()
    o_minus_e += d1 - d * n1 / n
    var += d * (n1 / n) * (1 - n1 / n) * (n - d) / max(n - 1, 1)
assert abs(chi2 - o_minus_e**2 / var) < 1e-9, "k-group log-rank equals the 2-group formula"

# 17. brackets: all pairs on 4 groups = 6, stacked upward; vs-first = 3; explicit = exactly those; stars thresholds
four_arm = trial.copy()
extra = trial[trial["arm"] == "High"].assign(arm="Max", change=lambda d: d["change"] - 3)
four_arm = __import__("pandas").concat([four_arm, extra], ignore_index=True)


def brackets(pairs, explicit=(), test="welch"):
    p = panel("box", x="arm", y="change")
    p["stats"] = {"test": test, "pairs": pairs, "explicit": [{"a": a, "b": b} for a, b in explicit], "display": "stars", "reference": None}
    fig, meta = fl.render(spec([p]), four_arm)
    ax = next(a for a in fig.axes if a.get_label() == "panel")
    lines = [ln for ln in ax.lines if ln.get_gid() == "bracket"]
    ys = [max(ln.get_ydata()) for ln in lines]
    fl.close(fig)
    return lines, ys, meta["panels"][0]["tests"]


lines, ys, tests = brackets("all")
assert len(lines) == 6 and all(b > a for a, b in itertools.pairwise(ys)), ys
assert len(tests) == 6 and all(0 <= t["p"] <= 1 and t["test"] == "welch" for t in tests)
assert len(brackets("vs-first")[0]) == 3
lines, _, tests = brackets("explicit", explicit=[("#0", "#3"), ("Low", "High")])
assert len(lines) == 2 and [t["pair"] for t in tests] == ["Placebo vs Max", "Low vs High"], tests
assert [fl.p_label(p, "stars") for p in (0.2, 0.04, 0.009, 0.0004)] == ["ns", "*", "**", "***"]
assert fl.p_label(0.0004, "p") == "p < 0.001" and fl.p_label(0.0123, "p") == "p = 0.012"
_, _, tests = brackets("all", test="anova")
assert len(tests) == 1 and tests[0]["test"] == "anova", "an omnibus test is one result, not brackets"

# 18. overlays: points (one collection per group), regression slope = polyfit, n labels
p = panel("bar", x="arm", y="change")
p["layers"] = [{"kind": "points", "ci": False, "alpha": 0.5, "size": None, "jitter": None},
               {"kind": "n", "ci": False, "alpha": None, "size": None, "jitter": None}]
fig, _ = fl.render(spec([p]), trial)
ax = next(a for a in fig.axes if a.get_label() == "panel")
pts = [c for c in ax.collections if c.get_gid() == "points"]
assert len(pts) == 3 and all(abs(c.get_alpha() - 0.5) < 1e-9 for c in pts)
assert sorted(t.get_text() for t in ax.texts if t.get_gid() == "n-label") == ["n = 20"] * 3
fl.close(fig)
p = panel("scatter", x="dose", y="change")
p["layers"] = [{"kind": "regression", "ci": True, "alpha": None, "size": None, "jitter": None}]
fig, _ = fl.render(spec([p]), trial)
ax = next(a for a in fig.axes if a.get_label() == "panel")
line = next(ln for ln in ax.lines if ln.get_gid() == "regression")
xd, yd = np.asarray(line.get_xdata(), float), np.asarray(line.get_ydata(), float)
slope = (yd[-1] - yd[0]) / (xd[-1] - xd[0])
assert abs(slope - np.polyfit(trial["dose"], trial["change"], 1)[0]) < 1e-9
assert any(c.get_gid() == "regression-ci" for c in ax.collections), "CI band"
fl.close(fig)

# 19. annotations, including one placed by group reference
p = panel("bar", x="arm", y="change")
p["annotations"] = [
    {"kind": "hline", "text": "", "x": None, "y": -5.0, "x2": None, "y2": None, "xGroup": None},
    {"kind": "text", "text": "target", "x": None, "y": -9.5, "x2": None, "y2": None, "xGroup": "#1"},
    {"kind": "hspan", "text": "", "x": None, "y": -2.0, "x2": None, "y2": -1.0, "xGroup": None},
    {"kind": "arrow", "text": "biggest drop", "x": 0.0, "y": -12.0, "x2": 2.0, "y2": -9.0, "xGroup": None},
]
fig, _ = fl.render(spec([p]), trial)
ax = next(a for a in fig.axes if a.get_label() == "panel")
gids = sorted(a.get_gid() for a in [*ax.lines, *ax.patches, *ax.texts] if (a.get_gid() or "").startswith("annotation-"))
assert gids == ["annotation-arrow", "annotation-hline", "annotation-hspan", "annotation-text"], gids
txt = next(t for t in ax.texts if t.get_gid() == "annotation-text")
assert txt.get_position()[0] == 1.0, "xGroup '#1' is the second category's position"
fl.close(fig)

# 20. needs_scipy: only tests, a CI regression, or a ci95 error bar
assert not fl.needs_scipy(spec([panel("bar", x="arm", y="change")]))
tested = panel("box", x="arm", y="change")
tested["stats"]["test"] = "auto"
assert fl.needs_scipy(spec([tested]))
ci_bar = panel("bar", x="arm", y="change")
ci_bar["errorType"] = "ci95"
assert fl.needs_scipy(spec([ci_bar]))

# 21. every gallery template renders on its sample (the "all families work on real specs" proof)
import json

gallery = json.loads((Path(__file__).parent.parent / "public" / "figure-gallery" / "templates.json").read_text())
sample_frames = {name: frame(name) for name in gallery["samples"]}
for t in gallery["templates"]:
    fig, meta = fl.render(t["spec"], sample_frames[t["sample"]])
    assert len(meta["panels"]) == len(t["spec"]["panels"]), t["id"]
    fl.close(fig)
stacked = next(t for t in gallery["templates"] if t["id"] == "stacked-bar")
fig, _ = fl.render(stacked["spec"], sample_frames["trial"])
assert fig.axes[0].get_ylabel() == "Count", "a count aggregate labels its axis Count"
fl.close(fig)

# 22. the worker's entry point: fonts, hooks, and errors that never raise
df = frame("trial")
fonts_dir = Path(__file__).parent.parent / "public" / "fonts"
fl.register_fonts([str(fonts_dir / f) for f in fl.fonts_for(spec([panel("bar", x="arm", y="change")]))])
fl.register_fonts([str(fonts_dir / f) for f in fl.fonts_for(spec([panel("bar", x="arm", y="change")], style="ieee"))])
bar_spec = spec([panel("bar", x="arm", y="change")])
out = fl.run_request(bar_spec, df, ["png"], 72)
assert out["meta"]["font"] == "Liberation Sans", out["meta"]["font"]
assert fl.run_request(spec([panel("bar", x="arm", y="change")], style="ieee"), df, ["png"], 72)["meta"]["font"] == "Liberation Serif"
titled = fl.run_request(bar_spec, df, ["svg"], 72, "def customize(fig, axes, df):\n    axes[0].set_title('HOOKED')\n")
assert titled["hookWarning"] is None and "HOOKED" in base64.b64decode(titled["images"]["svg"]).decode()
broken = fl.run_request(bar_spec, df, ["svg"], 72, "def customize(fig, axes, df):\n    axes[0].set_title('HALF')\n    df['nope']\n")
assert "KeyError" in broken["hookWarning"] and "nope" not in broken["hookWarning"]
assert "HALF" not in base64.b64decode(broken["images"]["svg"]).decode(), "a failed hook's partial edits are discarded"
assert "customize" in fl.run_request(bar_spec, df, ["png"], 72, "x = 1")["hookWarning"]
err = fl.run_request(spec([panel("bar", x="nope", y="change")]), df, ["png"], 72)["error"]
assert err["code"] == "missing_column" and err["detail"] == {"role": "x", "column": "nope"} and err["traceback"], err
json.dumps(out), json.dumps(err)  # both cross the worker boundary as JSON
assert not fl.plt.get_fignums(), "run_request leaves no open figures"

# 23. "#n" counts in first-appearance order even when groups are drawn in another order
reordered = panel("box", x="arm", y="change")
reordered["order"] = {"mode": "alpha", "explicit": []}  # draws High, Low, Placebo
reordered["stats"] = {"test": "welch", "pairs": "explicit", "explicit": [{"a": "#0", "b": "#2"}], "display": "p", "reference": None}
reordered["annotations"] = [{"kind": "vline", "text": "", "x": None, "y": None, "x2": None, "y2": None, "xGroup": "#0"}]
fig, meta = fl.render(spec([reordered]), df)
assert [t["pair"] for t in meta["panels"][0]["tests"]] == ["Placebo vs High"], meta["panels"][0]["tests"]
vline = next(ln for ln in fig.axes[0].lines if ln.get_gid() == "annotation-vline")
assert vline.get_xdata()[0] == 2.0, "#0 = Placebo, drawn third under alpha order"
fl.close(fig)

# 24. a group left with one value can't be tested: a named error, not NaN
try:
    fl.pairwise_p(np.array([1.0, np.nan]), np.array([2.0, 3.0]), "welch")
    raise AssertionError("expected too_few_groups")
except fl.FigureError as e:
    assert e.code == "too_few_groups"
flat = pd.DataFrame({"g": ["a", "a", "b", "b"], "y": [1.0, 1.0, 1.0, 1.0]})
anova = panel("box", x="g", y="y")
anova["stats"] = {"test": "anova", "pairs": "all", "explicit": [], "display": "p", "reference": None}
out = fl.run_request(spec([anova]), flat, ["png"], 72)
assert out["meta"]["panels"][0]["tests"][0]["p"] is None, "NaN p crosses as null"
json.dumps(out, allow_nan=False)

print("figurelib.selfcheck: OK")
