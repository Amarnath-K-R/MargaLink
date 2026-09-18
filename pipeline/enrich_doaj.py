"""Phase 1 (enrich): real DOAJ data for journals OpenAlex flags as DOAJ-listed.

Fills the plan's "speed" (time to decision) filter and refines fee/licence
data with DOAJ's own numbers, rather than the enrich.py-lite approach of
just reusing OpenAlex's apc_usd/is_in_doaj fields.

Only queries journals OpenAlex already flags is_in_doaj:true (4,168 of the
20,000) — DOAJ only covers open-access journals, so querying the rest would
just burn the rate-limit budget for a guaranteed empty result (verified:
Electronics/MDPI, not DOAJ-listed, returns total:0).

DOAJ's rate limit (documented, unlike OpenAlex's): 2 req/s, bursts of 5.
Paced well under that.

Usage: uv run enrich_doaj.py
Output: pipeline/data/doaj.jsonl (gitignored), one line per matched journal.
"""

import json
import time
import urllib.error
import urllib.request
from pathlib import Path

from openalex import safe_iter_jsonl

SOURCES_PATH = Path(__file__).parent / "data" / "sources.jsonl"
OUT_PATH = Path(__file__).parent / "data" / "doaj.jsonl"
REQUEST_DELAY_S = 0.55  # ~1.8 req/s, safely under DOAJ's 2 req/s
HEADERS = {"User-Agent": "MargaLink-Pipeline (mailto:amarnathcseamrita@gmail.com)"}


def _get(url: str, attempts: int = 5) -> dict:
    for attempt in range(attempts):
        try:
            req = urllib.request.Request(url, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=20) as resp:
                return json.loads(resp.read())
        except urllib.error.HTTPError as e:
            if attempt == attempts - 1:
                raise
            wait = 5 * (attempt + 1) if e.code != 429 else 10 * (attempt + 1)
            print(f"HTTP {e.code}, waiting {wait}s", flush=True)
            time.sleep(wait)
        except Exception as e:
            if attempt == attempts - 1:
                raise
            print(f"error {e!r}, retrying", flush=True)
            time.sleep(5 * (attempt + 1))
    raise RuntimeError("unreachable")


def doaj_candidates() -> list[dict]:
    return [j for j in safe_iter_jsonl(SOURCES_PATH) if j.get("is_in_doaj") and j.get("issn_l")]


def already_done() -> set[str]:
    return {j["id"] for j in safe_iter_jsonl(OUT_PATH)}


def extract_fields(bibjson: dict) -> dict:
    # `.get(key, {})` only supplies the default when the key is *absent* —
    # a sparse/legacy DOAJ record with "apc": null (present, but null) makes
    # this None instead, and the next .get() call on it crashes. `or {}`
    # catches both cases.
    apc = bibjson.get("apc") or {}
    apc_max = apc.get("max") or [{}]
    license_list = bibjson.get("license") or [{}]
    editorial = bibjson.get("editorial") or {}
    return {
        "publication_time_weeks": bibjson.get("publication_time_weeks"),
        # DOAJ reports fees in the journal's own currency, not always USD —
        # named apc_amount (not apc_usd) to avoid mislabeling a EUR/GBP/etc.
        # figure as dollars. Pair with apc_currency, don't assume one currency.
        "apc_amount": apc_max[0].get("price") if apc.get("has_apc") and apc_max else None,
        "apc_currency": apc_max[0].get("currency") if apc.get("has_apc") and apc_max else None,
        "license_type": license_list[0].get("type") if license_list else None,
        "review_process": editorial.get("review_process"),
        "review_url": editorial.get("review_url"),
    }


def main() -> None:
    candidates = doaj_candidates()
    done = already_done()
    todo = [c for c in candidates if c["id"] not in done]
    print(f"{len(done)} already fetched, {len(todo)} remaining of {len(candidates)} DOAJ candidates", flush=True)

    matched = 0
    with OUT_PATH.open("a") as out:
        for i, source in enumerate(todo):
            issn = source["issn_l"]
            data = _get(f"https://doaj.org/api/search/journals/issn:{issn}")
            results = data.get("results", [])
            if results:
                fields = extract_fields(results[0].get("bibjson", {}))
                out.write(json.dumps({"id": source["id"], "issn_l": issn, **fields}) + "\n")
                out.flush()
                matched += 1
            if (i + 1) % 100 == 0:
                print(f"processed {i + 1}/{len(todo)}, matched {matched}", flush=True)
            time.sleep(REQUEST_DELAY_S)

    print(f"done. total matched in {OUT_PATH}: {len(already_done())}", flush=True)


def _self_check() -> None:
    bibjson = {
        "publication_time_weeks": 29,
        "apc": {"has_apc": True, "max": [{"price": 2477, "currency": "USD"}]},
        "license": [{"type": "CC BY"}],
        "editorial": {"review_process": ["Single anonymous peer review"], "review_url": "https://x"},
    }
    fields = extract_fields(bibjson)
    assert fields["publication_time_weeks"] == 29
    assert fields["apc_amount"] == 2477
    assert fields["apc_currency"] == "USD"
    assert fields["license_type"] == "CC BY"

    no_apc = extract_fields({"apc": {"has_apc": False}, "license": []})
    assert no_apc["apc_amount"] is None
    assert no_apc["license_type"] is None

    # A sparse/legacy DOAJ record can have these keys present but null,
    # not absent — must not crash (previously did: bibjson.get("apc", {})
    # returns None here, not the default, since the key exists).
    null_fields = extract_fields({"apc": None, "license": None, "editorial": None})
    assert null_fields["apc_amount"] is None
    assert null_fields["license_type"] is None
    assert null_fields["review_process"] is None

    print("enrich_doaj self-check: OK")


if __name__ == "__main__":
    import sys

    if len(sys.argv) > 1 and sys.argv[1] == "--self-check":
        _self_check()
    else:
        main()
