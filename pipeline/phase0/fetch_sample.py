"""Phase 0 spike: pull a ~2,000-journal sample from OpenAlex for the model bake-off.

Throwaway code — deleted once Phase 0's accuracy numbers are recorded. No API key
needed at this volume (~4,000 calls total, well under the free daily budget).

Usage: uv run phase0/fetch_sample.py
Output: pipeline/data/phase0_raw.jsonl (gitignored), one line per journal:
    {"id": ..., "display_name": ..., "papers": [{"title": ..., "abstract": ...}, ...]}
"""

import json
import time
import urllib.error
import urllib.request
from pathlib import Path

BASE = "https://api.openalex.org"
HEADERS = {"User-Agent": "MargaLink-Phase0-Spike (mailto:amarnathcseamrita@gmail.com)"}
OUT_PATH = Path(__file__).parent.parent / "data" / "phase0_raw.jsonl"
TARGET_JOURNALS = 2000
PAPERS_PER_JOURNAL = 150  # gives 100 for centroid build + spare for held-out
REQUEST_DELAY_S = 0.4  # unauthenticated traffic throttles well under the documented 100 req/s


def _get(url: str, attempts: int = 6) -> dict:
    for attempt in range(attempts):
        try:
            req = urllib.request.Request(url, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=30) as resp:
                return json.loads(resp.read())
        except urllib.error.HTTPError as e:
            if attempt == attempts - 1:
                raise
            if e.code == 429:
                retry_after = e.headers.get("Retry-After")
                wait = float(retry_after) if retry_after else 30 * (attempt + 1)
                print(f"429 rate-limited, waiting {wait:.0f}s")
                time.sleep(wait)
            else:
                time.sleep(2 * (attempt + 1))
        except Exception:
            if attempt == attempts - 1:
                raise
            time.sleep(2 * (attempt + 1))
    raise RuntimeError("unreachable")


def reconstruct_abstract(inverted_index: dict | None) -> str:
    """OpenAlex stores abstracts as {word: [positions]}; rebuild plain text."""
    if not inverted_index:
        return ""
    positions: list[tuple[int, str]] = []
    for word, idxs in inverted_index.items():
        for i in idxs:
            positions.append((i, word))
    positions.sort()
    return " ".join(word for _, word in positions)


def iter_active_journals(limit: int):
    """Journals with enough recent output to supply a centroid + held-out split."""
    cursor = "*"
    seen = 0
    while seen < limit:
        url = (
            f"{BASE}/sources?filter=type:journal,works_count:%3E{PAPERS_PER_JOURNAL}"
            f"&per_page=200&cursor={cursor}"
        )
        data = _get(url)
        results = data.get("results", [])
        if not results:
            return
        for source in results:
            yield source
            seen += 1
            if seen >= limit:
                return
        cursor = data.get("meta", {}).get("next_cursor")
        if not cursor:
            return
        time.sleep(REQUEST_DELAY_S)


def fetch_papers(source_id: str, n: int) -> list[dict]:
    short_id = source_id.rsplit("/", 1)[-1]
    url = (
        f"{BASE}/works?filter=primary_location.source.id:{short_id}"
        f"&select=title,abstract_inverted_index&per_page={min(n, 200)}"
    )
    data = _get(url)
    papers = []
    for work in data.get("results", []):
        title = work.get("title") or ""
        abstract = reconstruct_abstract(work.get("abstract_inverted_index"))
        if title and abstract:
            papers.append({"title": title, "abstract": abstract})
    return papers


def already_fetched() -> set[str]:
    if not OUT_PATH.exists():
        return set()
    ids = set()
    with OUT_PATH.open() as f:
        for line in f:
            ids.add(json.loads(line)["id"])
    return ids


def main() -> None:
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    done = already_fetched()
    print(f"resuming: {len(done)} journals already fetched")

    with OUT_PATH.open("a") as out:
        fetched_this_run = 0
        for source in iter_active_journals(TARGET_JOURNALS + len(done)):
            if source["id"] in done:
                continue
            papers = fetch_papers(source["id"], PAPERS_PER_JOURNAL)
            if len(papers) < 105:  # need 100 build + a few held-out
                continue
            out.write(
                json.dumps(
                    {
                        "id": source["id"],
                        "display_name": source["display_name"],
                        "papers": papers,
                    }
                )
                + "\n"
            )
            out.flush()
            fetched_this_run += 1
            if fetched_this_run % 50 == 0:
                print(f"fetched {fetched_this_run} journals this run")
            time.sleep(REQUEST_DELAY_S)

    print(f"done. total journals in {OUT_PATH}: {len(already_fetched())}")


def _self_check() -> None:
    """Smallest possible check that the abstract reconstruction is order-correct."""
    inv = {"the": [0, 4], "cat": [1], "sat": [2], "on": [3], "mat": [5]}
    assert reconstruct_abstract(inv) == "the cat sat on the mat"
    assert reconstruct_abstract(None) == ""
    assert reconstruct_abstract({}) == ""
    print("fetch_sample self-check: OK")


if __name__ == "__main__":
    import sys

    if len(sys.argv) > 1 and sys.argv[1] == "--self-check":
        _self_check()
    else:
        main()
