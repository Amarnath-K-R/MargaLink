"""Matching v2: NLM's list of MEDLINE journals with their standard
abbreviations ("J Am Coll Cardiol"), which medical reference lists use in
place of full titles. One request, ~9 MB, no key; build_index.py adds each
journal's abbreviations (matched by ISSN) to its names, so the browser can
credit citations written that way.

Usage: uv run fetch_nlm_abbrevs.py
Output: data/J_Medline.txt
"""

import urllib.request
from pathlib import Path

URL = "https://ftp.ncbi.nlm.nih.gov/pubmed/J_Medline.txt"
OUT = Path(__file__).parent / "data" / "J_Medline.txt"


def main() -> None:
    part = OUT.with_suffix(".part")
    urllib.request.urlretrieve(URL, part)
    part.rename(OUT)
    print(f"wrote {OUT} ({OUT.stat().st_size / 1e6:.1f} MB)")


if __name__ == "__main__":
    main()
