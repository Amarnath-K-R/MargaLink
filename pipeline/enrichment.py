"""Shared join logic: merges sources.jsonl + doaj.jsonl + nlm.jsonl into one
metadata dict per journal. Used by build_index.py.
"""

import re
from pathlib import Path

from openalex import safe_iter_jsonl

DATA_DIR = Path(__file__).parent / "data"

# OpenAlex's `type:journal` filter (see fetch_sources.py) still lets through
# one-off conference proceedings/abstracts volumes — e.g. "44th AIAA
# Aerospace Sciences Meeting" or "AGU Fall Meeting Abstracts" — which aren't
# journals a researcher could submit a paper to. Deliberately narrow:
# broader keywords like bare "congress"/"forum"/"assembly" also catch real
# journals ("Congress & the Presidency", "The Educational Forum", "Assembly
# Automation"), and hiding a real journal is far worse than leaving a rare
# proceedings volume in. A title starting with an edition ordinal ("44th
# ...") or containing the standalone word "abstracts" is never a real
# journal name — validated by hand against the full 18k-journal list.
#
# A third shape slipped through this filter: some conference proceedings
# get a display_name that's just the event's date/location, e.g. "2001
# Sacramento, CA July 29-August 1,2001" or "2009 ICCAS-SICE" (19 found by
# hand-scanning the full 18k list — every one starting with a 4-digit year,
# and every one missing issn_l, homepage_url, and host_organization_name,
# unlike real journals that happen to start with a number).
_ORDINAL_TITLE = re.compile(r"^\d+(st|nd|rd|th)\b", re.IGNORECASE)
_ABSTRACTS_WORD = re.compile(r"\babstracts\b", re.IGNORECASE)
_YEAR_START = re.compile(r"^(19|20)\d{2}\b")
# A fourth shape, seen in /match results: an event word plus a year anywhere
# ("World Environmental and Water Resources Congress 2009"). A real journal
# may be named "…Congress…" (Congress & the Presidency) but never carries a
# year in its name.
_EVENT_WITH_YEAR = re.compile(r"\b(congress|conference|symposium|workshop|meeting)\b.*\b(19|20)\d{2}\b|\b(19|20)\d{2}\b.*\b(congress|conference|symposium|workshop|meeting)\b", re.IGNORECASE)


def is_conference_proceedings_name(display_name: str) -> bool:
    return bool(
        _ORDINAL_TITLE.search(display_name)
        or _ABSTRACTS_WORD.search(display_name)
        or _YEAR_START.search(display_name)
        or _EVENT_WITH_YEAR.search(display_name)
    )


def _load_jsonl_by_id(path: Path) -> dict[str, dict]:
    return {j["id"]: j for j in safe_iter_jsonl(path)}


def load_sources() -> dict[str, dict]:
    return _load_jsonl_by_id(DATA_DIR / "sources.jsonl")


def load_doaj() -> dict[str, dict]:
    return _load_jsonl_by_id(DATA_DIR / "doaj.jsonl")


def load_nlm() -> dict[str, dict]:
    return _load_jsonl_by_id(DATA_DIR / "nlm.jsonl")


def top_field(topics: list[dict]) -> str | None:
    if not topics:
        return None
    return topics[0].get("field", {}).get("display_name")


def build_meta_entry(
    journal_id: str,
    display_name: str,
    sources: dict[str, dict],
    doaj: dict[str, dict],
    nlm: dict[str, dict],
) -> dict:
    s = sources.get(journal_id)
    d = doaj.get(journal_id)
    n = nlm.get(journal_id)
    return {
        "id": journal_id,
        "display_name": display_name,
        "field": top_field(s.get("topics", [])) if s else None,
        "is_in_doaj": s.get("is_in_doaj") if s else None,
        # OpenAlex normalizes to USD — this is the one used for the fee
        # *filter* (a threshold comparison needs one consistent currency).
        # DOAJ's own (possibly non-USD) figure is a separate display-only
        # field below — don't mix them into one number.
        "apc_usd": s.get("apc_usd") if s else None,
        "country_code": s.get("country_code") if s else None,
        "medline_indexed": n.get("medline_indexed") if n else None,
        "publication_time_weeks": d.get("publication_time_weeks") if d else None,
        # detail-page-only fields, not used for matching/filtering
        "issn_l": s.get("issn_l") if s else None,
        "works_count": s.get("works_count") if s else None,
        "last_publication_year": s.get("last_publication_year") if s else None,
        "homepage_url": s.get("homepage_url") if s else None,
        "host_organization_name": s.get("host_organization_name") if s else None,
        "license_type": d.get("license_type") if d else None,
        "review_url": d.get("review_url") if d else None,
        "doaj_apc_amount": d.get("apc_amount") if d else None,
        "doaj_apc_currency": d.get("apc_currency") if d else None,
        # Matching v2 (sources v2 fields; absent on a v1 sources file)
        "names": journal_names(display_name, s) if s else [],
        "h_index": ((s.get("summary_stats") or {}).get("h_index")) if s else None,
        "cited_2yr": ((s.get("summary_stats") or {}).get("2yr_mean_citedness")) if s else None,
        "is_oa": s.get("is_oa") if s else None,
    }


def journal_names(display_name: str, source: dict) -> list[str]:
    """Other names a reference list might use: the abbreviation and alternate
    titles, de-duplicated case-insensitively, never the display name itself."""
    seen = {display_name.strip().lower()}
    out = []
    for n in [source.get("abbreviated_title"), *(source.get("alternate_titles") or [])]:
        if n and n.strip().lower() not in seen:
            seen.add(n.strip().lower())
            out.append(n.strip())
    return out


def _self_check() -> None:
    names = journal_names("Nature", {"abbreviated_title": "Nature", "alternate_titles": ["Nat.", "nat.", "Nature (London)"]})
    assert names == ["Nat.", "Nature (London)"], names
    assert journal_names("X", {}) == []
    assert is_conference_proceedings_name("44th AIAA Aerospace Sciences Meeting and Exhibit")
    assert is_conference_proceedings_name("AGU Fall Meeting Abstracts")
    assert is_conference_proceedings_name("2001 Sacramento, CA July 29-August 1,2001")
    assert is_conference_proceedings_name("2009 ICCAS-SICE")
    assert is_conference_proceedings_name("World Environmental and Water Resources Congress 2009")
    assert is_conference_proceedings_name("Proceedings of the 2015 Winter Simulation Conference")
    assert not is_conference_proceedings_name("Congress & the Presidency")
    assert not is_conference_proceedings_name("Journal of Conference Interpreting")
    assert not is_conference_proceedings_name("Proceedings of the National Academy of Sciences")
    assert not is_conference_proceedings_name("Proceedings of the IEEE")
    assert not is_conference_proceedings_name("Congress & the Presidency")
    assert not is_conference_proceedings_name("The Educational Forum")
    assert not is_conference_proceedings_name("Colloquium Mathematicum")
    assert not is_conference_proceedings_name("Assembly Automation")
    assert not is_conference_proceedings_name("Journal of the 2020s")  # year isn't at the start

    sources = {"j1": {"topics": [{"field": {"display_name": "Medicine"}}], "is_in_doaj": True, "apc_usd": 2000, "country_code": "US"}}
    doaj = {"j1": {"publication_time_weeks": 12, "license_type": "CC BY", "apc_amount": 1800, "apc_currency": "EUR"}}
    nlm = {"j1": {"medline_indexed": True}}

    entry = build_meta_entry("j1", "Journal One", sources, doaj, nlm)
    assert entry["field"] == "Medicine"
    assert entry["apc_usd"] == 2000  # OpenAlex USD figure, not DOAJ's EUR one
    assert entry["doaj_apc_amount"] == 1800
    assert entry["doaj_apc_currency"] == "EUR"
    assert entry["medline_indexed"] is True
    assert entry["publication_time_weeks"] == 12

    missing = build_meta_entry("unknown", "Unknown Journal", sources, doaj, nlm)
    assert missing["field"] is None
    assert missing["medline_indexed"] is None

    print("enrichment self-check: OK")

