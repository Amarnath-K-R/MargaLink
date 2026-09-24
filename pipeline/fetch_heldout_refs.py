"""Matching v2: resolves the reference lists of 500 held-out papers
(data/heldout_sample.json, written by build_index.py) to the journals they
cite, so the harness can measure the reference-list signal. OpenAlex's
abstracts don't carry reference lists, so this is the only way to evaluate
it — with the stated assumption that parsing a real PDF's references would
have been perfect.

Usage: uv run --env-file .env fetch_heldout_refs.py   (~1,000 calls, ~10 min)
Output: data/heldout_refs.json  {"W123": {"https://openalex.org/S456": 3, …}, …}
(checkpointed line by line in data/heldout_refs.jsonl, so it resumes).
"""

import json
import time
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from openalex import BASE, get, safe_iter_jsonl

DATA = Path(__file__).parent / "data"
SAMPLE = DATA / "heldout_sample.json"
PARTIAL = DATA / "heldout_refs.jsonl"
OUT = DATA / "heldout_refs.json"
BATCH = 50
WORKERS = 4
REQUEST_DELAY_S = 1.0


def chunks(xs: list, n: int) -> list[list]:
    return [xs[i : i + n] for i in range(0, len(xs), n)]


def count_sources(works: list[dict]) -> Counter:
    counts: Counter = Counter()
    for w in works:
        source = ((w.get("primary_location") or {}).get("source") or {}).get("id")
        if source:
            counts[source] += 1
    return counts


def resolve(work_id: str) -> dict:
    refs = get(f"{BASE}/works/{work_id}?select=referenced_works").get("referenced_works") or []
    time.sleep(REQUEST_DELAY_S)
    counts: Counter = Counter()
    for batch in chunks([r.rsplit("/", 1)[-1] for r in refs], BATCH):
        data = get(f"{BASE}/works?filter=openalex_id:{'|'.join(batch)}&select=id,primary_location&per_page={BATCH}")
        counts += count_sources(data.get("results", []))
        time.sleep(REQUEST_DELAY_S)
    return {"work": work_id, "refs": len(refs), "counts": dict(counts)}


def main() -> None:
    sample = json.loads(SAMPLE.read_text())
    done = {r["work"] for r in safe_iter_jsonl(PARTIAL)}
    todo = [w for w in sample if w not in done]
    print(f"{len(done)} done, {len(todo)} to resolve", flush=True)
    with PARTIAL.open("a") as out, ThreadPoolExecutor(max_workers=WORKERS) as pool:
        for i, row in enumerate(pool.map(resolve, todo)):
            out.write(json.dumps(row) + "\n")
            out.flush()
            if (i + 1) % 50 == 0:
                print(f"resolved {i + 1}/{len(todo)}", flush=True)
    rows = list(safe_iter_jsonl(PARTIAL))
    OUT.write_text(json.dumps({r["work"]: r["counts"] for r in rows if r["counts"]}))
    with_refs = sum(1 for r in rows if r["counts"])
    print(f"done. {with_refs}/{len(rows)} papers have resolvable references → {OUT}", flush=True)


def _self_check() -> None:
    assert chunks([1, 2, 3, 4, 5], 2) == [[1, 2], [3, 4], [5]]
    works = [
        {"primary_location": {"source": {"id": "S1"}}},
        {"primary_location": {"source": {"id": "S1"}}},
        {"primary_location": {"source": None}},
        {"primary_location": None},
        {"primary_location": {"source": {"id": "S2"}}},
    ]
    assert count_sources(works) == Counter({"S1": 2, "S2": 1})
    print("fetch_heldout_refs self-check: OK")


if __name__ == "__main__":
    main()
