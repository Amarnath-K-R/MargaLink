# Journal matching v2 — hybrid on-device ranker — Design

> Brainstormed 2026-09-24 with the product owner. Sections are approved one at a time; the approved
> spec is copied to `docs/superpowers/specs/2026-09-24-matching-v2-design.md` as the first implementation
> task, then a task-by-task plan follows (writing-plans).

## Context

`/match` ranks 18,125 journals by one dot product: the paper's first 3,000 characters (title page,
authors, affiliations — often not the abstract) embedded with gte-small, against one averaged vector per
journal (the mean of up to 100 papers OpenAlex returned in default order, no date window). No accuracy
has ever been measured beyond the Phase 0 bake-off (562 journals). Results show a raw cosine and no
reason. Some index entries are mis-attributed (e.g. "Medical Entomology and Zoology" whose fetched
papers are Vygotsky and an SPSS textbook). The plan's §5 asked for a held-out test set, published
accuracy, and two extra signals (subject match, the paper's own reference list); none exist.

Goal: measurably better matches (true journal in the top 10 more often, right field more often) that a
researcher can trust because each result says why — while `/match: nothing leaves this tab` stays
literally true.

## Decisions (locked with the product owner)

1. Matching stays **fully on-device**. No Claude step, no third exception.
2. Pipeline may re-fetch: a quick sources re-fetch (minutes) and a long works re-fetch (hours,
   background, resumable).
3. The embedding model is chosen by the new accuracy harness **within a small-model cap** (≤ ~70 MB
   download, 384-dim); switch from gte-small only for a clear gain (≥ 5 points top-10).
4. Approach A: hybrid local ranker — harness + better query + recent multi-vector journals + topic and
   reference-list signals + calibrated fit score with explanations.

## Section 1 — Data and pipeline (approved)

**Works re-fetch** (`pipeline/fetch_works.py`, resumable, writes `data/works_v2.jsonl` so the current
index keeps working until the rebuild): per journal the 200 most recent papers
(`sort=publication_date:desc`, a 7-year window that widens automatically when a journal has < 30 papers
in it), `select=id,title,abstract_inverted_index,publication_year,topics`. Kept paper: title, abstract,
year, OpenAlex topic ids. ~20,000 calls.

**Sources re-fetch** (`pipeline/fetch_sources.py`): adds `abbreviated_title`, `alternate_titles`
(reference matching) and `summary_stats` (h-index, 2-year citedness — display + a small activity prior).
~100 calls.

**Topics fetch** (new `pipeline/fetch_topics.py`): all ~4,500 OpenAlex topics with name, description,
keywords, subfield/field/domain → `data/topics.jsonl`. 23 calls.

**Build** (`pipeline/build_index.py`), per journal:
- Split: the 20 most recent papers (or a quarter, whichever is smaller) are held out for evaluation
  only; the rest build the index. (Plan-stage refinement from 50: 20 keeps the index stronger and the
  held-out store ~115 MB int8 instead of ~1 GB; the harness scores a seeded 5,000-paper sample per
  run.) Held-out vectors/truth stay in `pipeline/data/`, never deployed.
- Centre labels: each centre's dominant topic name (from its member papers' topics), for the
  "closest to its papers on <topic>" explanation.
- Centres: k-means (own numpy implementation, no new dependency), k ∈ 1..4 by paper count, clusters
  with < 8 members merged. Centres stored flat in `index.bin`; per-journal `[start, count]` in
  `meta.json`. The browser scores a journal by its best centre.
- Topic profile: top 8 topics among the journal's index papers with shares (fallback: the source's
  own topic counts).
- Names: `display_name`, abbreviation, alternate titles per journal, for the reference-list matcher.
- Quality pass: drop a journal whose papers don't cohere (mean similarity of papers to their nearest
  centre in the bottom tail, threshold set by inspecting a sample) or whose source-level field
  disagrees with ≥ 80% of its papers' topics. Dropped names → `data/dropped.txt` for hand review. The
  proceedings-name filter stays.
- Topic table: each topic's "name. description. keywords" embedded once → `topics.bin` (int8) +
  `topics.json`.

**Outputs:** `manifest.json` (model, dim, counts, built date + fusion weights, calibration, measured
accuracy from Section 2), `index.bin` (~15 MB at ~2.2 centres/journal), `meta.json` (~13 MB with
profiles and names), `topics.bin` + `topics.json` (~2.5 MB). Each file < 25 MB (Cloudflare cap);
total ~31 MB, cached like today. The model is one constant in one place; the manifest carries the
model id and dimension the browser loads.

## Section 2 — Accuracy harness (approved)

**Principle:** the harness runs the exact ranker the browser runs. The ranker is a pure module
`web/src/lib/rank.ts` (candidates → signals → fusion → calibration; no DOM, no fetch), importable from
node. The harness is `web/scripts/eval_match.ts` (node), reading `web/public/index/` and
`pipeline/data/heldout.*`.

**Held-out data** (from `build_index.py`, never deployed): per held-out paper its embedding (same
model), true journal index, OpenAlex topic ids, year — ~15,000 journals × ≤ 50 papers. Reference-list
signal: a 500-paper sample gets `referenced_works` resolved to journals (~300 batched calls,
`pipeline/fetch_heldout_refs.py`) and is evaluated separately, stating the "perfect parsing" assumption.

**Metrics:** top-1/5/10 hit rate, MRR, field-correct@1, per-field table — for a ladder: single mean
vector (today) → multi-centre → + topic → + reference (sample) → full fusion, each showing its delta.
Plus topic-prediction accuracy (browser's local topic estimate vs the paper's real OpenAlex topics,
top-1/top-3).

**Fitting (offline, per build):** held-out split 50/50 at random by paper. Half 1: grid search over
fusion weights (embedding, topic, reference, activity prior) maximising top-10. Half 2: calibration of
the fused score to P(true journal) by binning → the "fit N% — strong/possible/weak" scale. Weights,
bins, thresholds, query mode and the accuracy table are written to `manifest.json` under `ranking`;
browser and harness read one config, code carries no magic numbers.

**Bake-off** (`pipeline/bakeoff.py`): gte-small vs bge-small-en-v1.5 vs e5-small-v2 (all 384-dim,
~33 MB Xenova builds; e5 needs the "query:"/"passage:" prefix convention, which the browser embed path
must carry if it wins) on a 3,000-journal sample with the mean-vector ranker, ~1 h per model. Switch
only for ≥ 5 points top-10. Winner's id set in `build_index.py`, flows through the manifest.

**Published numbers:** `/match` footer and `/privacy`: "top-10 accuracy N% on M recent papers held out
from the index, built <date>" from `manifest.ranking.accuracy`.

**Real uploads:** the two PDFs in the repo (`web/scripts/fixtures/test-paper.pdf`, the Foroutan 2023
heart-failure readmission PDF in the repo root) are a query-construction fixture: a selfcheck asserts
the extracted title + abstract; a manual gate checks their true journals land in the top 10.

## Section 3 — Browser ranker (approved)

All in `web/src/lib/`, pure, each with a `*.selfcheck.ts`.

**`matchQuery.ts`** (replaces "first 3,000 chars"): title (first substantial line, or the document's
own title heading when `extract.ts` has one), abstract via `formatCheck.extractAbstract` (extended to
"Summary" and structured abstracts), keywords line, and the references section via
`reviewSections.splitIntoSections`. Query text = title + abstract (+ keywords). No abstract → fallback
window with affiliation/email lines stripped, flagged to the page. `manifest.ranking.query` selects
plain vs title-weighted embedding (harness picks).

**`rank.ts`** signals per candidate journal:
1. Embedding: max cosine over the journal's centres (int8 dot / 127²).
2. Topic: paper topic estimate = softmax over cosines to the 4,500 topic vectors (top 10, manifest
   temperature); score = Σ paper-share × journal-share over the profile, subfield backoff at half
   weight.
3. Reference: `log1p(cites of the journal)` / `log1p(max cites of any journal in the paper)`; 0 when
   no references found.
4. Activity prior: small, from works count and published-in-last-2-years.

Candidates = top 200 by embedding among journals passing the filters ∪ every cited journal passing the
filters. Fused = weighted sum (manifest weights) → calibrated fit % (manifest bins) → band
strong/possible/weak (manifest thresholds). Result carries signals + why: shared topics (both shares),
citation count, nearest-centre similarity and that centre's label (build side: each centre's dominant
topic name stored in meta — small addition to Section 1).

**`references.ts`:** split the references section into entries (numbered, bracketed, blank-line);
normalise (case, diacritics, periods, "&"); dictionary from every journal's display name, abbreviation,
alternate titles (names < 4 chars and dictionary words dropped; a shared name splits credit). Strict
context guard (decision): a name counts only where a journal name sits in a reference — after the
title's full stop and directly followed by a year or volume/page pattern. The harness's reference sample
reports the false-match rate.

**Loading:** `match.ts` fetches manifest, meta, `index.bin`, `topics.bin/json` once (~31 MB, cached).
40,000 centres × 384 ≈ 20 ms; topics negligible.

**Drift guard:** `build_index.py` writes the Python-side top-10 for ten held-out papers; the harness
asserts `rank.ts` reproduces them exactly.
## Section 4 — Page, privacy, testing (approved)

**`/match` page**
- Entry: two tabs beside each other — the dropzone, and "Paste title and abstract" (decision: paste
  with no file is a first-class entry; no reference signal in that mode, and the page says so).
- After a run, a "What we read" card: title, abstract's first lines (expandable), keywords found,
  "N references found, M journals recognised". Under it "Not right? Paste your title and abstract" —
  re-embeds from the pasted text, all local. Processing-trace lines updated ("Read title + abstract
  (1,834 chars)", "Estimated topics", "Ranked 18,000 journals locally").
- "Your paper's topics": top three estimated topics with shares.
- Results: raw cosine → badge "Fit 78 · strong". Row expands to "Why this journal": shared-topic bars
  (paper vs journal), "you cite it 4 times", "closest to its papers on <centre label>". Filters and
  local re-ranking as today.
- Footer: the measured accuracy line from the manifest. `/journal/[id]` and `/journals` show the
  journal's top topics from `meta.json`.
- Deferred (noted in docs): click-a-topic-to-remove-and-re-rank; a topic browser.

**Privacy:** invariant unchanged — every request on `/match` is a bodyless GET for public files (model,
index, topics); network-panel copy names the topics files. `/privacy`'s matching section: topics and
the reference list are computed on the device; published accuracy and what "held out" means.

**Testing:** selfchecks (`npm run check`) for `matchQuery`, `references` (Vancouver/APA/Nature entries
+ traps: "Science" in a title, "Cell" as a word, a shared name), `rank` (synthetic index: fusion,
calibration, candidate union, filters), manifest `ranking` validation. Pipeline selfchecks: k-means,
split, quality pass, topic profiles, name normalisation, `fetch_topics` parsing. Harness
`node scripts/eval_match.ts` runs locally as a gate (CI has no index). Smoke: `check_filters.mjs`
unchanged; new `check_match.mjs` (upload fixture → "What we read" → fit badges → why panel → paste
path re-ranks → zero body requests → accuracy footer). Manual gates: pipeline run, bake-off table, the
two real PDFs in the top 10, DevTools shows only GETs.

**Sequencing:** the long works re-fetch starts first (background); query fix, `rank.ts`,
`references.ts`, harness and page are built against the current single-centre index meanwhile; the
rebuild, fitting and bake-off come when the fetch finishes.
