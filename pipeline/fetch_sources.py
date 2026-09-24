"""Phase 1: pull the ~20,000-journal target list from OpenAlex.

Filter: type:journal AND is_core:true — OpenAlex's own curated flag meaning
the journal is listed in at least one respected cross-index list (this is
the plan's "at least one index signal" criterion, native to the API, no
need to cross-reference DOAJ/Scopus/NLM separately just to build this list —
that's enrich_doaj.py's and enrich_nlm.py's job, adding badges/metrics to
what's already here).

Usage: uv run --env-file .env fetch_sources.py
Output: pipeline/data/sources.jsonl (gitignored), one line per journal.
"""

import json
import sys
import time
from pathlib import Path

from openalex import BASE, get, safe_iter_jsonl

OUT_PATH = Path(__file__).parent / "data" / "sources.jsonl"
TARGET = 20_000
REQUEST_DELAY_S = 2.5  # conservative — see openalex.py docstring
FIELDS = (
    "id,display_name,issn_l,issn,works_count,last_publication_year,is_in_doaj,is_core,apc_usd,"
    "country_code,host_organization_name,homepage_url,topics,"
    # Matching v2: names for the reference-list matcher, citation stats for display and a prior
    "abbreviated_title,alternate_titles,summary_stats,is_oa"
)
FIELD_NAMES = FIELDS.split(",")


def shape_source(raw: dict) -> dict:
    """Keeps only FIELDS (OpenAlex omits absent ones — abbreviated_title often is) and
    reduces summary_stats to the two numbers used."""
    out = {k: raw.get(k) for k in FIELD_NAMES}
    stats = raw.get("summary_stats") or {}
    out["summary_stats"] = {"h_index": stats.get("h_index"), "2yr_mean_citedness": stats.get("2yr_mean_citedness")}
    out["alternate_titles"] = raw.get("alternate_titles") or []
    return out


def already_fetched_ids() -> set[str]:
    return {j["id"] for j in safe_iter_jsonl(OUT_PATH)}


def main() -> None:
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    # --fresh: re-fetch every source with the v2 fields, keeping the old file.
    if "--fresh" in sys.argv and OUT_PATH.exists():
        OUT_PATH.rename(OUT_PATH.with_name("sources_v1.jsonl"))
        print("moved the existing sources.jsonl to sources_v1.jsonl", flush=True)
    done = already_fetched_ids()
    print(f"resuming: {len(done)} journals already saved", flush=True)
    if len(done) >= TARGET:
        print("already at target", flush=True)
        return

    cursor = "*"
    saved = len(done)
    with OUT_PATH.open("a") as out:
        while saved < TARGET:
            url = f"{BASE}/sources?filter=type:journal,is_core:true&select={FIELDS}&per_page=200&cursor={cursor}"
            data = get(url)
            results = data.get("results", [])
            if not results:
                print("no more results from OpenAlex", flush=True)
                break
            for source in results:
                if source["id"] in done:
                    continue
                out.write(json.dumps(shape_source(source)) + "\n")
                done.add(source["id"])
                saved += 1
                if saved % 500 == 0:
                    out.flush()
                    print(f"saved {saved} journals", flush=True)
                if saved >= TARGET:
                    break
            out.flush()
            cursor = data.get("meta", {}).get("next_cursor")
            if not cursor:
                break
            time.sleep(REQUEST_DELAY_S)

    print(f"done. total: {saved} journals in {OUT_PATH}", flush=True)


def _self_check() -> None:
    import tempfile

    global OUT_PATH
    real_out = OUT_PATH
    with tempfile.TemporaryDirectory() as d:
        OUT_PATH = Path(d) / "sources.jsonl"
        OUT_PATH.write_text('{"id": "a"}\n{"id": "b"}\n{"id": "c", "trunc')
        assert already_fetched_ids() == {"a", "b"}
    OUT_PATH = real_out

    raw = {"id": "S1", "display_name": "Nature", "alternate_titles": ["Nat"], "summary_stats": {"h_index": 9, "2yr_mean_citedness": 1.5, "i10_index": 3}, "extra": 1}
    shaped = shape_source(raw)
    assert "extra" not in shaped and shaped["abbreviated_title"] is None, "unknown keys dropped, absent ones None"
    assert shaped["summary_stats"] == {"h_index": 9, "2yr_mean_citedness": 1.5}
    assert shape_source({"id": "S2"})["alternate_titles"] == []

    print("fetch_sources self-check: OK")


if __name__ == "__main__":
    main()
