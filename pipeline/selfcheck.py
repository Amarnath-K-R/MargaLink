"""Runs every pipeline module's `_self_check()` in one pass.

Usage: uv run selfcheck.py

Import order follows the real dependency graph (leaves first) — not load-
bearing for correctness (each `_self_check()` is independent), just easier
to read when one fails.
"""

import build_index
import embedding
import enrich_doaj
import enrich_nlm
import enrichment
import fetch_sources
import fetch_topics
import fetch_works
import kmeans
import openalex
import quality

MODULES = [openalex, embedding, kmeans, quality, enrichment, fetch_sources, fetch_topics, fetch_works, enrich_doaj, enrich_nlm, build_index]

if __name__ == "__main__":
    for module in MODULES:
        module._self_check()
