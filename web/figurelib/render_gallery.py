"""Writes web/public/figure-gallery/templates.json (the one source of truth for
templates — read by the studio and validated by the TypeScript selfcheck) and
renders a thumbnail per template on its sample dataset.
Run:  uv run render_gallery.py"""

import base64
import json
from pathlib import Path

from specs import DTYPES, fl, frame, layer, panel, spec

OUT = Path(__file__).parent.parent / "public" / "figure-gallery"


def tpl(id_: str, title: str, description: str, sample: str, s: dict) -> dict:
    return {"id": id_, "title": title, "description": description, "sample": sample, "spec": s}


def with_(p: dict, **changes) -> dict:
    for key, value in changes.items():
        if isinstance(value, dict) and isinstance(p.get(key), dict):
            p[key] = {**p[key], **value}
        else:
            p[key] = value
    return p


def templates() -> list[dict]:
    bar = with_(panel("bar", x="arm", y="change"), layers=[layer("points", alpha=0.6)])
    box = with_(panel("box", x="arm", y="change"), layers=[layer("points", alpha=0.5)])
    violin = with_(panel("violin", x="arm", y="change"), stats={"test": "welch", "pairs": "vs-first"})
    compound_bar = with_(panel("bar", x="arm", y="change"), layers=[layer("points", alpha=0.6)],
                         stats={"test": "welch", "pairs": "vs-first"})
    compound_scatter = with_(panel("scatter", x="dose", y="change"), layers=[layer("regression", ci=True)],
                             stats={"test": "pearson"})
    return [
        tpl("bar-error", "Bar with error bars", "Group means with SEM and the individual points.", "trial", spec([bar])),
        tpl("box", "Box plot", "Median, spread and every observation per group.", "trial", spec([box])),
        tpl("scatter", "Scatter with regression", "Relationship between two measures, with a 95% CI band.", "trial",
            spec([with_(panel("scatter", x="baseline", y="week12"), layers=[layer("regression", ci=True)])])),
        tpl("line", "Dose-response line", "Mean at each level of a numeric x, by group, with an SEM band.", "trial",
            spec([with_(panel("line", x="dose", y="change", group="sex"), errorType="sem")])),
        tpl("histogram", "Histogram", "Distribution of one measure, overlaid by group.", "trial",
            spec([panel("histogram", x="change", group="arm")])),
        tpl("grouped-bar", "Grouped bar", "Two factors side by side.", "trial",
            spec([panel("bar", x="arm", y="change", group="sex")])),
        tpl("stacked-bar", "Stacked bar", "Counts of one factor within another.", "trial",
            spec([with_(panel("bar", x="arm", y="dose", group="sex"), stat="count", stacked=True, errorType="none")])),
        tpl("violin", "Violin with brackets", "Distribution shapes with Welch tests against the first group.", "trial",
            spec([violin])),
        tpl("strip", "Strip plot", "Every observation, with the group mean.", "trial", spec([panel("strip", x="arm", y="change")])),
        tpl("heatmap", "Correlation matrix", "Pairwise correlations between every numeric column.", "trial",
            spec([panel("heatmap")])),
        tpl("forest", "Forest plot", "Effect sizes with confidence intervals, one row per study.", "meta",
            spec([with_(panel("forest", x="hr", y="study", lower="ci_low", upper="ci_high"), x={"log": True})])),
        tpl("km", "Kaplan-Meier survival", "Survival by group with censoring, numbers at risk and a log-rank test.", "survival",
            spec([with_(panel("km", time="time_months", event="event", group="arm"), stats={"test": "logrank"})])),
        tpl("compound-2", "Two-panel figure", "Group comparison with brackets beside a dose-response scatter.", "trial",
            spec([compound_bar, compound_scatter], cols=2, size="double")),
        tpl("grid-2x2", "Four-panel grid", "A 2x2 overview of one dataset.", "trial",
            spec([panel("bar", x="arm", y="change"), box, panel("scatter", x="dose", y="change", group="arm"),
                  panel("histogram", x="change", group="arm")], rows=2, cols=2, size="double")),
    ]


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    items = templates()
    samples = {name: [{"name": c, "dtype": t} for c, t in cols.items()] for name, cols in DTYPES.items()}
    (OUT / "templates.json").write_text(json.dumps({"samples": samples, "templates": items}, indent=1) + "\n")
    frames = {name: frame(name) for name in DTYPES}
    for t in items:
        fig, _ = fl.render(t["spec"], frames[t["sample"]])
        (OUT / f"{t['id']}.png").write_bytes(base64.b64decode(fl.export(fig, ["png"], 110)["png"]))
        fl.close(fig)
        print(f"rendered {t['id']}.png")


if __name__ == "__main__":
    main()
