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
import urllib.error
from collections import Counter
from concurrent.futures import ThreadPoolExecutor, as_completed
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
    try:
        refs = get(f"{BASE}/works/{work_id}?select=referenced_works").get("referenced_works") or []
    except urllib.error.HTTPError as e:
        if e.code != 404:
            raise
        return {"work": work_id, "refs": 0, "counts": {}}  # deleted or merged since the build
    time.sleep(REQUEST_DELAY_S)
    counts: Counter = Counter()
    for batch in chunks([r.rsplit("/", 1)[-1] for r in refs], BATCH):
        data = get(f"{BASE}/works?filter=openalex_id:{'|'.join(batch)}&select=id,primary_location&per_page={BATCH}")
        counts += count_sources(data.get("results", []))
        time.sleep(REQUEST_DELAY_S)
    return {"work": work_id, "refs": len(refs), "counts": dict(counts)}


def resolve_all(todo: list[str], resolve_fn, write, workers: int = WORKERS) -> tuple[int, int]:
    """Resolves every work, writing each as it finishes (not in order), so a
    crash keeps everything already resolved. A work that fails is counted
    and left for the next run (it isn't written, so it's retried), without
    stopping or discarding the others."""
    written = failed = 0
    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = {pool.submit(resolve_fn, w): w for w in todo}
        for fut in as_completed(futures):
            try:
                write(fut.result())
                written += 1
            except (OSError, ValueError, RuntimeError) as e:  # network (URLError is an OSError), bad JSON, anything else a fetch raises
                failed += 1
                print(f"{futures[fut]} failed ({e!r}); retried next run", flush=True)
            if (written + failed) % 50 == 0:
                print(f"resolved {written}/{len(todo)}", flush=True)
    return written, failed


def main() -> None:
    sample = json.loads(SAMPLE.read_text())
    done = {r["work"] for r in safe_iter_jsonl(PARTIAL)}
    todo = [w for w in sample if w not in done]
    print(f"{len(done)} done, {len(todo)} to resolve", flush=True)
    with PARTIAL.open("a") as out:

        def write(row: dict) -> None:
            out.write(json.dumps(row) + "\n")
            out.flush()

        _, failed = resolve_all(todo, resolve, write)
    if failed:
        print(f"{failed} failed; run again to retry them", flush=True)
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
    # a held-out work OpenAlex has since deleted or merged (404) resolves to no references, not a crash
    global get
    real = get

    def gone(url: str) -> dict:
        raise urllib.error.HTTPError(url, 404, "Not Found", None, None)

    get = gone
    try:
        assert resolve("W1") == {"work": "W1", "refs": 0, "counts": {}}
    finally:
        get = real
    # one work failing doesn't lose the others, or keep the run waiting on them
    rows = []

    def flaky(w: str) -> dict:
        if w == "W3":
            raise RuntimeError("network down")
        return {"work": w, "refs": 0, "counts": {}}

    written, failed = resolve_all([f"W{i}" for i in range(1, 13)], flaky, rows.append, workers=4)
    assert (written, failed) == (11, 1) and sorted(r["work"] for r in rows) == sorted(f"W{i}" for i in range(1, 13) if i != 3)
    print("fetch_heldout_refs self-check: OK")


if __name__ == "__main__":
    main()
