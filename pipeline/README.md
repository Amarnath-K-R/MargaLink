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

```bash
cp .env.example .env   # every command below passes --env-file .env, so it must exist
```

`OPENALEX_API_KEY` (free, from [openalex.org](https://openalex.org)) raises
OpenAlex's rate limit; the fetchers work without it, just slower.
`OPENALEX_MAILTO` is your contact address for the APIs' polite pools.

## Run order

```bash
uv run --env-file .env fetch_sources.py [--fresh]  # ~20,000 journal shortlist (+ names, citation stats); --fresh keeps the old file
uv run --env-file .env fetch_topics.py    # all ~4,500 OpenAlex topics — a minute
uv run --env-file .env fetch_works.py     # the 200 newest papers/journal with topics — ~6 h, 4 paced workers; resumable
uv run --env-file .env enrich_doaj.py     # DOAJ: fee, licence, review process (only journals already in DOAJ)
uv run --env-file .env enrich_nlm.py      # NLM Catalog: MEDLINE indexing (only biomedical-adjacent fields)
uv run fetch_nlm_abbrevs.py               # NLM journal abbreviations ("J Am Coll Cardiol"), one ~9 MB file
uv run build_index.py                     # held-out split, centres, topics, quality pass → web/public/index/* (~7 h at ~110 papers/s; vectors cached)
cd ../web && node scripts/eval/eval_match.ts --fit --write-manifest   # measures, fits and publishes the ranking
cd ../pipeline && uv run backup.py push   # keeps this run's data and index in R2 (see Backups)
```

Model choice: `uv run bakeoff.py` compares the candidate models in
`embedding.py` on a 3,000-journal sample (~1 h each); switch `MODEL_NAME`
only for ≥ 5 points of top-10 accuracy, then rebuild.

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
fetched data, multi-GB at full scale (`works_v2.jsonl` alone is ~4.6GB),
regeneratable from the commands above, but only over hours. `web/public/index/*`
is gitignored too, for the same reason: it's pipeline output, not source.
Both are kept in R2 instead (Backups, below).

A fresh clone doesn't need to run the pipeline to work on the app:
`cd web && npm run fetch-index` downloads the deployed index. Run the
pipeline when the index itself has to change.

## Backups

`backup.py` keeps `pipeline/data` and the built index in the private R2
bucket `margalink-data`, so neither depends on one machine. Each snapshot is
complete (the data and the index it built); a file that hasn't changed since
the last snapshot isn't uploaded again, so a snapshot after a rebuild sends
only what the rebuild changed. Files go up gzipped in 16 MiB pieces, which
a slow link can manage, and an interrupted upload resumes.

```bash
uv run backup.py push                     # after a pipeline run (it refuses while one is running)
uv run backup.py list                     # the snapshots, newest last
uv run backup.py pull                     # a new machine: everything, from the newest
uv run backup.py pull <name> --only index # roll the index back to an earlier build, then deploy
```

Once per Cloudflare account: `cd ../web && npx wrangler r2 bucket create margalink-data`.
On a new machine: clone, `cd web && npm install && npx wrangler login`,
`cd ../pipeline && uv sync && uv run backup.py pull`. `pipeline/.env` (the
OpenAlex key) isn't backed up; it's in your OpenAlex account. Not kept: the
v1 data (`works.jsonl`, `sources_v1.jsonl`, `index_v1_backup/`, read only by
`build_index.py --v1`), logs and half-written caches.

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
| `fetch_nlm_abbrevs.py` | NLM's journal abbreviations, added to journal names (`names` in meta.json); unread since matching stopped reading references, so it can go at the next rebuild |
| `fetch_topics.py` | all OpenAlex topics (names and fields) |
| `embedding.py` | the one embedding model (name, prefix, batching), shared by the build and the bake-off |
| `kmeans.py` | the per-journal centres (k-means over a journal's papers) |
| `quality.py` | the quality pass: coherence floor, field fit, placeholder sources |
| `build_index.py` | joins everything, embeds, writes the production index |
| `bakeoff.py` | compares candidate embedding models |
| `backup.py` | keeps `data/` and the built index in R2, and restores them |
| `selfcheck.py` | runs all of the above's `_self_check()` in one pass |
