"""Matching v2: for each journal in sources.jsonl, fetch its most recent
papers (title, abstract, year, OpenAlex topics) to build its centres, topic
profile and held-out evaluation set from.

Recent, not OpenAlex's default order: a journal's scope drifts, and the
default order surfaces old, highly-cited items (textbooks, reviews) that
don't say what the journal publishes now. The window is WINDOW_YEARS; a
journal with fewer than WIDEN_BELOW usable papers in it gets a second call
without the year filter (window_years: null) so small journals still build.

Abstract coverage on OpenAlex is publisher-dependent, not uniform — verified
by direct sampling: Elsevier ~24%, Wiley ~32%, Springer ~20% of recent works
have a reconstructable abstract, vs. ~100% for SAGE and Taylor & Francis.
A journal with poor coverage can fail MIN_PAPERS_TO_KEEP even though it has
thousands of works — that's real data sparsity, not a bug. PAPERS_PER_JOURNAL
is 200 (OpenAlex's per_page max) to give low-coverage journals the widest net
one call can provide.

Usage: uv run --env-file .env fetch_works.py   (hours; resumable)
Output: pipeline/data/works_v2.jsonl (gitignored), one line per journal:
    {"id": ..., "window_years": 7 | null,
     "papers": [{"id": "W…", "title": …, "abstract": …, "year": 2024, "topics": ["T…", …]}]}
newest first. The v1 file (works.jsonl) is left untouched so the current
index keeps building until the switch.
"""

import json
import time
from datetime import UTC, datetime
from pathlib import Path

from openalex import BASE, get, reconstruct_abstract, safe_iter_jsonl

SOURCES_PATH = Path(__file__).parent / "data" / "sources.jsonl"
OUT_PATH = Path(__file__).parent / "data" / "works_v2.jsonl"
PAPERS_PER_JOURNAL = 200  # OpenAlex's per_page max — still one API call, no added cost
MIN_PAPERS_TO_KEEP = 10  # need at least a few for a meaningful centre
WINDOW_YEARS = 7
WIDEN_BELOW = 30
REQUEST_DELAY_S = 1.0
SELECT = "id,title,abstract_inverted_index,publication_year,topics"


def short_id(openalex_id: str) -> str:
    return openalex_id.rsplit("/", 1)[-1]


def load_source_ids() -> list[str]:
    return [j["id"] for j in safe_iter_jsonl(SOURCES_PATH)]


def already_fetched_ids() -> set[str]:
    return {j["id"] for j in safe_iter_jsonl(OUT_PATH)}


def shape_paper(work: dict) -> dict | None:
    """One OpenAlex work → the stored paper, or None without title + abstract."""
    title = work.get("title") or ""
    abstract = reconstruct_abstract(work.get("abstract_inverted_index"))
    if not (title and abstract):
        return None
    topics = [short_id(t["id"]) for t in (work.get("topics") or [])[:3] if t.get("id")]
    return {"id": short_id(work.get("id") or ""), "title": title, "abstract": abstract, "year": work.get("publication_year"), "topics": topics}


def needs_wider_window(kept: int) -> bool:
    return kept < WIDEN_BELOW


def fetch_papers(source_id: str, n: int, from_year: int | None) -> list[dict]:
    year = f",publication_year:>{from_year - 1}" if from_year else ""
    url = (
        f"{BASE}/works?filter=primary_location.source.id:{short_id(source_id)}{year}"
        f"&sort=publication_date:desc&select={SELECT}&per_page={min(n, 200)}"
    )
    papers = [shape_paper(w) for w in get(url).get("results", [])]
    return [p for p in papers if p]


def fetch_journal(source_id: str) -> tuple[list[dict], int | None]:
    from_year = datetime.now(UTC).year - WINDOW_YEARS
    papers = fetch_papers(source_id, PAPERS_PER_JOURNAL, from_year)
    if not needs_wider_window(len(papers)):
        return papers, WINDOW_YEARS
    time.sleep(REQUEST_DELAY_S)
    return fetch_papers(source_id, PAPERS_PER_JOURNAL, None), None


def main() -> None:
    source_ids = load_source_ids()
    done = already_fetched_ids()
    todo = [sid for sid in source_ids if sid not in done]
    print(f"{len(done)} already fetched, {len(todo)} remaining of {len(source_ids)}", flush=True)

    skipped_too_few = 0
    with OUT_PATH.open("a") as out:
        for i, source_id in enumerate(todo):
            papers, window = fetch_journal(source_id)
            if len(papers) >= MIN_PAPERS_TO_KEEP:
                out.write(json.dumps({"id": source_id, "window_years": window, "papers": papers}) + "\n")
                out.flush()
            else:
                skipped_too_few += 1
            if (i + 1) % 100 == 0:
                print(
                    f"processed {i + 1}/{len(todo)} (skipped {skipped_too_few} with <{MIN_PAPERS_TO_KEEP} papers)",
                    flush=True,
                )
            time.sleep(REQUEST_DELAY_S)

    print(f"done. total in {OUT_PATH}: {len(already_fetched_ids())}", flush=True)


def _self_check() -> None:
    import tempfile

    global SOURCES_PATH, OUT_PATH
    real_sources, real_out = SOURCES_PATH, OUT_PATH
    with tempfile.TemporaryDirectory() as d:
        SOURCES_PATH = Path(d) / "sources.jsonl"
        OUT_PATH = Path(d) / "works.jsonl"
        SOURCES_PATH.write_text('{"id": "a"}\n{"id": "b"}\n{"id": "c"}\n')
        # a truncated last line — like an interrupted run would leave — must
        # not crash the resume; "a" is still recovered.
        OUT_PATH.write_text('{"id": "a", "papers": []}\n{"id": "b", "pape')
        assert load_source_ids() == ["a", "b", "c"]
        assert already_fetched_ids() == {"a"}
    SOURCES_PATH, OUT_PATH = real_sources, real_out

    work = {
        "id": "https://openalex.org/W1",
        "title": "A trial",
        "abstract_inverted_index": {"We": [0], "tested": [1]},
        "publication_year": 2024,
        "topics": [{"id": "https://openalex.org/T2"}, {"id": "https://openalex.org/T1"}, {"id": "https://openalex.org/T3"}, {"id": "https://openalex.org/T4"}],
    }
    assert shape_paper(work) == {"id": "W1", "title": "A trial", "abstract": "We tested", "year": 2024, "topics": ["T2", "T1", "T3"]}
    assert shape_paper({**work, "abstract_inverted_index": None}) is None, "no abstract → not kept"
    assert shape_paper({**work, "topics": None})["topics"] == []
    assert needs_wider_window(29) and not needs_wider_window(30)

    print("fetch_works self-check: OK")


if __name__ == "__main__":
    main()
