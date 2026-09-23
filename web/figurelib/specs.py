"""Spec-building helpers shared by selfcheck.py and render_gallery.py. They
mirror web/src/lib/figureSpec.ts's defaultPanel()/DEFAULT_SPEC shape exactly,
so a spec built here validates on the TypeScript side too."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "public"))
import figurelib as fl

HERE = Path(__file__).parent
SAMPLES = HERE / "samples"
DTYPES = {
    "trial": {
        "subject_id": "categorical", "arm": "categorical", "sex": "categorical", "dose": "numeric",
        "baseline": "numeric", "week12": "numeric", "change": "numeric", "visit_date": "date",
    },
    "survival": {"id": "numeric", "arm": "categorical", "time_months": "numeric", "event": "numeric", "age": "numeric"},
    "meta": {"study": "categorical", "year": "numeric", "hr": "numeric", "ci_low": "numeric", "ci_high": "numeric", "weight": "numeric"},
}
ROLES = ["x", "y", "group", "error", "lower", "upper", "value", "time", "event"]


def frame(name: str):
    return fl.load_frame((SAMPLES / f"{name}.csv").read_text(), DTYPES[name])


def axis(**kw):
    return {"label": "", "unit": "", "min": None, "max": None, "log": False, "tickFormat": "auto", **kw}


def layer(kind: str, ci: bool = False, alpha=None, size=None, jitter=None):
    return {"kind": kind, "ci": ci, "alpha": alpha, "size": size, "jitter": jitter}


def panel(family: str, **roles):
    base = {r: None for r in ROLES}
    base.update(roles)
    return {
        "title": "", "family": family, "roles": base, "x": axis(), "y": axis(),
        "stat": "mean", "errorType": "sem" if family == "bar" else "none", "stacked": False, "horizontal": False,
        "bins": None, "order": {"mode": "as-is", "explicit": []}, "layers": [], "annotations": [],
        "stats": {"test": None, "pairs": "all", "explicit": [], "display": "stars", "reference": None},
        "atRiskTable": family == "km", "censorTicks": True, "colSpan": 1, "legend": True,
    }


def spec(panels, rows=1, cols=None, **kw):
    return {
        "version": 1, "style": "nature", "size": "single", "widthMm": None, "heightMm": None,
        "palette": "okabe-ito", "colors": [],
        "layout": {"rows": rows, "cols": cols or len(panels), "letters": True, "sharedLegend": False},
        "panels": panels, **kw,
    }
