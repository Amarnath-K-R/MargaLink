# pipeline/

Offline data pipeline (Python, [uv](https://docs.astral.sh/uv/)) that builds
the static journal index the web app matches against. Never runs in
production — its only output the app cares about is
`web/public/index/{manifest.json,index.bin,meta.json,topics.bin,topics.json}`, which you produce
locally (or in CI/a scheduled job) and the static site just serves.

See [`../docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md) for why the app is
built this way at all.

## Setup

```bash
cd pipeline
uv sync
```

Create `.env` with:

```
OPENALEX_API_KEY=...
```

Free, from [openalex.org](https://openalex.org) — raises OpenAlex's rate
limit. `fetch_sources.py`/`fetch_works.py` work without one, just slower.

## Run order

```bash
uv run --env-file .env fetch_sources.py [--fresh]  # ~20,000 journal shortlist (+ names, citation stats); --fresh keeps the old file
uv run --env-file .env fetch_topics.py    # all ~4,500 OpenAlex topics — a minute
uv run --env-file .env fetch_works.py     # the 200 newest papers/journal with topics — ~6 h, 4 paced workers; resumable
uv run --env-file .env enrich_doaj.py     # DOAJ: fee, licence, review process (only journals already in DOAJ)
uv run --env-file .env enrich_nlm.py      # NLM Catalog: MEDLINE indexing (only biomedical-adjacent fields)
uv run build_index.py                     # held-out split, centres, topics, quality pass → web/public/index/* (~7 h at ~110 papers/s; vectors cached)
uv run --env-file .env fetch_heldout_refs.py  # resolves 500 held-out papers' references, for the reference signal's evaluation
cd ../web && node scripts/eval_match.ts --refs --fit --write-manifest   # measures, fits and publishes the ranking
```

Model choice: `uv run bakeoff.py` compares the candidate models in
`embedding.py` on a 3,000-journal sample (~1 h each); switch `MODEL_NAME`
only for ≥ 5 points of top-10 accuracy, then rebuild.

```
```

`build_index.py` is safe to re-run at any point while `fetch_works.py` is
still filling in `works.jsonl` — it just builds from whatever's there so
far (`fetch_sources.py`'s docstring calls out the same "resume from
whatever's already fetched" pattern used by every fetcher here).

## Rate limits (why this takes hours, not minutes)

- **OpenAlex**: a sustained-rate limit well under its documented daily
  credit budget, independent of whether an API key is used (see
  `openalex.py`'s docstring) — every request in `fetch_sources.py`/
  `fetch_works.py` uses patient, generous backoff for exactly this reason.
- **DOAJ**: paced at ~1.8 req/s, under its documented 2 req/s cap.
- **NCBI/NLM**: paced under its documented 3 req/s cap.

## Outputs — what's gitignored and why

Everything in `pipeline/data/` is gitignored (root `.gitignore`) — it's
fetched data, multi-GB at full scale (`works.jsonl` alone is ~4GB),
regeneratable from the commands above. `web/public/index/*` is gitignored
too, for the same reason: it's pipeline output, not source.

This means **a fresh clone of this repo cannot run `npm run build`, `/match`,
`/journals`, or `/journal/[id]` until the pipeline has been run at least
once** — see the root README's quickstart.

## Verification

```bash
uv run selfcheck.py    # runs every module's _self_check()
uv run ruff check .
```

## Layout

| File | Role |
|---|---|
| `openalex.py` | shared HTTP helper (retry/backoff, `reconstruct_abstract`) — no local deps |
| `enrichment.py` | shared join logic + the conference-proceedings name filter |
| `fetch_sources.py` | the ~20,000-journal shortlist |
| `fetch_works.py` | up to 200 papers/journal (the expensive step) |
| `enrich_doaj.py` | DOAJ enrichment |
| `enrich_nlm.py` | MEDLINE/NLM enrichment |
| `build_index.py` | joins everything, embeds, writes the production index |
| `selfcheck.py` | runs all of the above's `_self_check()` in one pass |
