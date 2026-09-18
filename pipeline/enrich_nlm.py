"""Phase 1 (enrich): MEDLINE indexing status via NLM Catalog (NCBI E-utilities).

Fills the plan's "MEDLINE" indexing badge (spec §4.3's positive trust
signals — DOAJ, major index coverage, ...).

Only queries journals in biomedical-adjacent fields — MEDLINE indexing is
essentially never true outside them (verified: Proceedings of SPIE,
optical engineering, returns count:0; Science, count:1), and querying all
20,000 would burn most of the rate-limit budget on guaranteed empties.

NCBI's documented limit: 3 req/s without a key. Paced under that.

Usage: uv run enrich_nlm.py
Output: pipeline/data/nlm.jsonl (gitignored), one line per journal checked
    (not just matches — {"id": ..., "medline_indexed": true|false}, so a
    checked-but-not-indexed journal is distinguishable from unchecked).
"""

import json
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

SOURCES_PATH = Path(__file__).parent / "data" / "sources.jsonl"
OUT_PATH = Path(__file__).parent / "data" / "nlm.jsonl"
REQUEST_DELAY_S = 0.4  # ~2.5 req/s, safely under NCBI's 3 req/s (no key)
HEADERS = {"User-Agent": "MargaLink-Pipeline (mailto:amarnathcseamrita@gmail.com)"}

# Fields where MEDLINE indexing is plausible — everything else is essentially
# always count:0, not worth the request. ponytail: a field-name allowlist is
# an approximation, not a guarantee — a biomedical paper in an odd field
# would be missed. Upgrade: query all 20k if/when the rate-limit budget for
# a full sweep is worth spending.
BIOMEDICAL_FIELDS = {
    "Medicine",
    "Biochemistry, Genetics and Molecular Biology",
    "Health Professions",
    "Neuroscience",
    "Immunology and Microbiology",
    "Nursing",
    "Dentistry",
    "Pharmacology, Toxicology and Pharmaceutics",
    "Veterinary",
    "Agricultural and Biological Sciences",
}


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


def top_field(topics: list[dict]) -> str | None:
    if not topics:
        return None
    return topics[0].get("field", {}).get("display_name")


def candidates() -> list[dict]:
    out = []
    with SOURCES_PATH.open() as f:
        for line in f:
            j = json.loads(line)
            if j.get("issn_l") and top_field(j.get("topics", [])) in BIOMEDICAL_FIELDS:
                out.append(j)
    return out


def already_done() -> set[str]:
    if not OUT_PATH.exists():
        return set()
    ids = set()
    with OUT_PATH.open() as f:
        for line in f:
            ids.add(json.loads(line)["id"])
    return ids


def is_medline_indexed(issn: str) -> bool:
    term = urllib.parse.quote(f"{issn}[ISSN] AND currentlyindexed[All]")
    data = _get(f"https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=nlmcatalog&term={term}&retmode=json")
    return int(data.get("esearchresult", {}).get("count", "0")) > 0


def main() -> None:
    todo_all = candidates()
    done = already_done()
    todo = [c for c in todo_all if c["id"] not in done]
    print(f"{len(done)} already checked, {len(todo)} remaining of {len(todo_all)} biomedical-field candidates", flush=True)

    indexed_count = 0
    with OUT_PATH.open("a") as out:
        for i, source in enumerate(todo):
            indexed = is_medline_indexed(source["issn_l"])
            out.write(json.dumps({"id": source["id"], "medline_indexed": indexed}) + "\n")
            out.flush()
            if indexed:
                indexed_count += 1
            if (i + 1) % 100 == 0:
                print(f"processed {i + 1}/{len(todo)}, {indexed_count} MEDLINE-indexed so far", flush=True)
            time.sleep(REQUEST_DELAY_S)

    print(f"done. total checked in {OUT_PATH}: {len(already_done())}", flush=True)


def _self_check() -> None:
    assert top_field([{"field": {"display_name": "Medicine"}}]) == "Medicine"
    assert top_field([]) is None
    assert "Medicine" in BIOMEDICAL_FIELDS
    assert "Engineering" not in BIOMEDICAL_FIELDS
    print("enrich_nlm self-check: OK")


if __name__ == "__main__":
    import sys

    if len(sys.argv) > 1 and sys.argv[1] == "--self-check":
        _self_check()
    else:
        main()
