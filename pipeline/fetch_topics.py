"""Matching v2: every OpenAlex topic (~4,500) with its description and
keywords — the vocabulary the browser estimates a paper's topics in, and the
labels for journal topic profiles.

Usage: uv run --env-file .env fetch_topics.py   (~25 calls, a minute)
Output: pipeline/data/topics.jsonl (gitignored), one line per topic:
    {"id": "T10001", "name": …, "description": …, "keywords": […],
     "subfield": …, "field": …, "domain": …}
"""

import json
import time
from pathlib import Path

from openalex import BASE, get

OUT_PATH = Path(__file__).parent / "data" / "topics.jsonl"
SELECT = "id,display_name,description,keywords,subfield,field,domain"
REQUEST_DELAY_S = 1.0


def shape_topic(raw: dict) -> dict:
    name = lambda k: (raw.get(k) or {}).get("display_name")
    return {
        "id": raw["id"].rsplit("/", 1)[-1],
        "name": raw.get("display_name") or "",
        "description": raw.get("description") or "",
        "keywords": raw.get("keywords") or [],
        "subfield": name("subfield"),
        "field": name("field"),
        "domain": name("domain"),
    }


def main() -> None:
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    cursor, rows = "*", []
    while cursor:
        data = get(f"{BASE}/topics?select={SELECT}&per_page=200&cursor={cursor}")
        rows += [shape_topic(t) for t in data.get("results", [])]
        cursor = data.get("meta", {}).get("next_cursor")
        print(f"{len(rows)} topics", flush=True)
        time.sleep(REQUEST_DELAY_S)
    # Written at the end, not appended: 25 calls, nothing worth resuming.
    OUT_PATH.write_text("".join(json.dumps(r) + "\n" for r in rows))
    print(f"done. {len(rows)} topics in {OUT_PATH}", flush=True)


def _self_check() -> None:
    raw = {
        "id": "https://openalex.org/T10001",
        "display_name": "Heart Failure Management",
        "description": "Readmission and outcomes.",
        "keywords": ["heart failure", "readmission"],
        "subfield": {"id": "x", "display_name": "Cardiology and Cardiovascular Medicine"},
        "field": {"display_name": "Medicine"},
        "domain": {"display_name": "Health Sciences"},
    }
    t = shape_topic(raw)
    assert t["id"] == "T10001" and t["subfield"] == "Cardiology and Cardiovascular Medicine" and t["domain"] == "Health Sciences"
    assert shape_topic({"id": "T2"})["keywords"] == [] and shape_topic({"id": "T2"})["field"] is None
    print("fetch_topics self-check: OK")


if __name__ == "__main__":
    main()
