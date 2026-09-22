"""Phase 1: for each journal in sources.jsonl, fetch up to 200 recent papers
(title + abstract only) to build its centroid from.

This is the expensive step — one API call per journal, ~20,000 total, and
per-journal calls are the ones that triggered sustained rate-limiting
earlier even with an API key. Paced conservatively; expect this to run for
hours, resumable if interrupted.

Abstract coverage on OpenAlex is publisher-dependent, not uniform — verified
by direct sampling: Elsevier ~24%, Wiley ~32%, Springer ~20% of recent works
have a reconstructable abstract, vs. ~100% for SAGE and Taylor & Francis.
A journal with poor coverage can fail MIN_PAPERS_TO_KEEP even though it has
thousands of works — that's real data sparsity, not a bug (confirmed by
manually inspecting "skipped" journals: e.g. Food Research International,
Elsevier, 19,641 works, only 1/25 sampled had an abstract). PAPERS_PER_JOURNAL
is set to 200 (OpenAlex's actual per_page max) rather than some lower number
specifically to give low-coverage journals the widest net a single API call
(no added cost) can provide.

Usage: uv run --env-file .env fetch_works.py
Output: pipeline/data/works.jsonl (gitignored), one line per journal:
    {"id": ..., "papers": [{"title": ..., "abstract": ...}, ...]}
"""

import json
import time
from pathlib import Path

from openalex import BASE, get, reconstruct_abstract, safe_iter_jsonl

SOURCES_PATH = Path(__file__).parent / "data" / "sources.jsonl"
OUT_PATH = Path(__file__).parent / "data" / "works.jsonl"
PAPERS_PER_JOURNAL = 200  # OpenAlex's per_page max — still one API call, no added cost
MIN_PAPERS_TO_KEEP = 10  # need at least a few for a meaningful centroid
REQUEST_DELAY_S = 1.0


def load_source_ids() -> list[str]:
    return [j["id"] for j in safe_iter_jsonl(SOURCES_PATH)]


def already_fetched_ids() -> set[str]:
    return {j["id"] for j in safe_iter_jsonl(OUT_PATH)}


def fetch_papers(source_id: str, n: int) -> list[dict]:
    short_id = source_id.rsplit("/", 1)[-1]
    url = (
        f"{BASE}/works?filter=primary_location.source.id:{short_id}"
        f"&select=title,abstract_inverted_index&per_page={min(n, 200)}"
    )
    data = get(url)
    papers = []
    for work in data.get("results", []):
        title = work.get("title") or ""
        abstract = reconstruct_abstract(work.get("abstract_inverted_index"))
        if title and abstract:
            papers.append({"title": title, "abstract": abstract})
    return papers


def main() -> None:
    source_ids = load_source_ids()
    done = already_fetched_ids()
    todo = [sid for sid in source_ids if sid not in done]
    print(f"{len(done)} already fetched, {len(todo)} remaining of {len(source_ids)}", flush=True)

    skipped_too_few = 0
    with OUT_PATH.open("a") as out:
        for i, source_id in enumerate(todo):
            papers = fetch_papers(source_id, PAPERS_PER_JOURNAL)
            if len(papers) >= MIN_PAPERS_TO_KEEP:
                out.write(json.dumps({"id": source_id, "papers": papers}) + "\n")
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

    print("fetch_works self-check: OK")


if __name__ == "__main__":
    main()
