"""Phase 1: pull the ~20,000-journal target list from OpenAlex.

Filter: type:journal AND is_core:true — OpenAlex's own curated flag meaning
the journal is listed in at least one respected cross-index list (this is
the plan's "at least one index signal" criterion, native to the API, no
need to cross-reference DOAJ/Scopus/NLM separately just to build this list —
that's enrich.py's job, adding badges/metrics to what's already here).

OpenAlex enforces a sustained-rate limit well under its documented daily
credit budget (observed: a handful of requests, then 429s, regardless of an
API key) — this run paces very conservatively and expects to take hours.

Usage: uv run --env-file .env fetch_sources.py
Output: pipeline/data/sources.jsonl (gitignored), one line per journal.
"""

import json
import os
import time
import urllib.error
import urllib.request
from pathlib import Path

BASE = "https://api.openalex.org"
HEADERS = {"User-Agent": "MargaLink-Pipeline (mailto:amarnathcseamrita@gmail.com)"}
API_KEY = os.environ.get("OPENALEX_API_KEY")
OUT_PATH = Path(__file__).parent / "data" / "sources.jsonl"
TARGET = 20_000
REQUEST_DELAY_S = 2.5  # conservative — see module docstring
FIELDS = "id,display_name,issn_l,issn,works_count,last_publication_year,is_in_doaj,is_core,apc_usd,country_code,host_organization_name,homepage_url,topics"


def _with_key(url: str, key: str | None) -> str:
    if not key:
        return url
    return url + ("&" if "?" in url else "?") + f"api_key={key}"


def _get(url: str, attempts: int = 8) -> dict:
    url = _with_key(url, API_KEY)
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
                wait = float(retry_after) if retry_after else 20 * (attempt + 1)
                print(f"429, waiting {wait:.0f}s (attempt {attempt + 1}/{attempts})", flush=True)
                time.sleep(wait)
            else:
                time.sleep(5 * (attempt + 1))
        except Exception as e:
            if attempt == attempts - 1:
                raise
            print(f"error {e!r}, retrying", flush=True)
            time.sleep(5 * (attempt + 1))
    raise RuntimeError("unreachable")


def already_fetched_ids() -> set[str]:
    if not OUT_PATH.exists():
        return set()
    ids = set()
    with OUT_PATH.open() as f:
        for line in f:
            ids.add(json.loads(line)["id"])
    return ids


def main() -> None:
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
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
            data = _get(url)
            results = data.get("results", [])
            if not results:
                print("no more results from OpenAlex", flush=True)
                break
            for source in results:
                if source["id"] in done:
                    continue
                out.write(json.dumps(source) + "\n")
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
    assert _with_key("http://x?a=1", "k") == "http://x?a=1&api_key=k"
    assert _with_key("http://x", "k") == "http://x?api_key=k"
    assert _with_key("http://x", None) == "http://x"

    import tempfile

    global OUT_PATH
    real_out = OUT_PATH
    with tempfile.TemporaryDirectory() as d:
        OUT_PATH = Path(d) / "sources.jsonl"
        OUT_PATH.write_text('{"id": "a"}\n{"id": "b"}\n')
        assert already_fetched_ids() == {"a", "b"}
    OUT_PATH = real_out

    print("fetch_sources self-check: OK")


if __name__ == "__main__":
    import sys

    if len(sys.argv) > 1 and sys.argv[1] == "--self-check":
        _self_check()
    else:
        main()
