"""Shared OpenAlex HTTP helper: retry/backoff, optional API key, User-Agent.

OpenAlex enforces a sustained-rate limit well under its documented daily
credit budget (observed: a handful of requests then 429s), independent of
whether an API key is used — so every caller needs patient, generous backoff.
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


def with_key(url: str, key: str | None = None) -> str:
    key = key if key is not None else API_KEY
    if not key:
        return url
    return url + ("&" if "?" in url else "?") + f"api_key={key}"


def get(url: str, attempts: int = 8) -> dict:
    url = with_key(url)
    for attempt in range(attempts):
        try:
            req = urllib.request.Request(url, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=30) as resp:
                return json.loads(resp.read())
        except urllib.error.HTTPError as e:
            if attempt == attempts - 1:
                raise
            if e.code == 429:
                # Retry-After is legally either delta-seconds or an HTTP-date
                # (RFC 7231) — float() on a date string raises ValueError,
                # which would otherwise kill an hours-long fetch over one
                # oddly-formatted header instead of just falling back.
                retry_after = e.headers.get("Retry-After")
                try:
                    wait = float(retry_after) if retry_after else 20 * (attempt + 1)
                except ValueError:
                    wait = 20 * (attempt + 1)
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


def safe_iter_jsonl(path):
    """Yields parsed dicts from a JSONL file, skipping (and warning about)
    any line that fails to parse instead of crashing. These files are
    resume checkpoints for hours-long background jobs, appended to line by
    line — an interrupted run (SIGTERM/SIGKILL/OOM/sleep) can leave a
    truncated last line, and the whole point of resuming is that it survives
    exactly that."""
    p = Path(path)
    if not p.exists():
        return
    with p.open() as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                yield json.loads(line)
            except json.JSONDecodeError:
                print(f"skipping malformed line in {p.name} (likely truncated): {line[:80]!r}", flush=True)


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


def _self_check() -> None:
    assert with_key("http://x?a=1", "k") == "http://x?a=1&api_key=k"
    assert with_key("http://x", "k") == "http://x?api_key=k"
    assert with_key("http://x", None) == "http://x"

    inv = {"the": [0, 4], "cat": [1], "sat": [2], "on": [3], "mat": [5]}
    assert reconstruct_abstract(inv) == "the cat sat on the mat"
    assert reconstruct_abstract(None) == ""
    assert reconstruct_abstract({}) == ""

    import tempfile

    with tempfile.TemporaryDirectory() as d:
        p = Path(d) / "test.jsonl"
        # a truncated last line, like an interrupted run would leave
        p.write_text('{"id": "a"}\n{"id": "b"}\n{"id": "c", "trunc')
        rows = list(safe_iter_jsonl(p))
        assert [r["id"] for r in rows] == ["a", "b"], "malformed line skipped, good ones kept"
        assert list(safe_iter_jsonl(Path(d) / "missing.jsonl")) == [], "missing file yields nothing, doesn't crash"

    print("openalex self-check: OK")


if __name__ == "__main__":
    _self_check()
