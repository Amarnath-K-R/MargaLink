# Architecture

Why MargaLink is built the way it is — not a tour of the code (the code and
its own comments are the tour), but the decisions that aren't obvious just
from reading a single file.

## The core decision: no server for matching

The original plan (`docs/product-plan.md`) called for a server that
compares an uploaded paper's embedding against journal vectors stored in
Postgres/pgvector. That was never built. What exists instead:

1. The pipeline (`pipeline/`) builds one static, versioned index offline:
   1–4 centre embeddings per journal (from its recent papers), quantized to
   int8, plus metadata, a recent-topic profile and alternate names per
   journal, and the OpenAlex topic table. Shipped as `web/public/index/
   {manifest.json, index.bin, meta.json, topics.bin, topics.json}`
   (gitignored in source control — see [pipeline/README.md](../pipeline/README.md)).
2. The browser downloads that index once (it's public data, same trust
   category as the page's own JS) and does the entire match — extract
   text, embed, estimate topics, rank — locally.
   `src/lib/match/rank.ts` is the whole ranker: no network round-trip carries
   anything from the user's paper.

This isn't an optimization on top of a server design — it's the direct
consequence of the project's privacy rules (`CLAUDE.md`). A server that
ranks journals necessarily sees the paper's embedding at minimum; keeping
rule 1 (the paper never leaves the device) absolute meant removing the
server from that path entirely, not trusting it to behave. The two places
where something *does* leave the device (the AI review, the figure
generator) are deliberately built as disclosed exceptions, not the
default — see below.

**Current numbers** are in `web/public/index/manifest.json` (journal,
centre and topic counts, the model, the fitted ranking and its measured
accuracy). Embeddings are 384-dimensional (the model is whichever the
pipeline's bake-off chose within the small-model cap, named once in
`pipeline/embedding.py` and carried to the browser by the manifest), shipped
as int8 rather than fp32 (~1pp accuracy loss for a ~4x smaller download).
Every index file stays under Cloudflare's 25 MB per-file cap.

### How a paper is matched (matching v2)

Design and plan: `docs/specs/2026-09-24-matching-v2-design.md`,
`docs/plans/2026-09-24-matching-v2.md`.

- **What is read** (`matchQuery.ts`): the title, the real abstract
  (`formatCheck.extractAbstract`) and keywords; never the main text or the
  reference list. Without an abstract, the first 3,000 characters with the
  author, affiliation and contact lines removed.
  The page shows it ("What we read") with a paste box to correct it, and
  pasted text is a first-class entry for phones.
- **Journals** are 1–4 centres each (k-means over their recent papers,
  `pipeline/kmeans.py`), so a broad journal is several clusters rather than
  one average that matches none; a journal scores by its closest centre.
- **Three signals** (`rank.ts`): embedding similarity; overlap between the
  paper's estimated OpenAlex topics (`topics.ts`) and the journal's recent
  topic profile; a small activity prior. The top 200 by embedding are
  scored. The paper's reference list was a fourth signal until 2026-10-04:
  it rewarded the journals a paper cites rather than the ones it fits.
- **Weights and the fit scale are measured, not chosen.** `build_index.py`
  holds back each journal's newest papers (never indexed);
  `web/scripts/eval/eval_match.ts` runs `rank.ts` itself over them, reports a
  ladder (today → multi-centre → + topics), fits the weights
  on one half and the fit scale on the other, and writes both with the
  accuracy into the manifest. "Fit 78" means the match is as close as 78% of
  real paper→journal pairings; an unfitted build shows raw similarity, no
  percentages. A drift guard checks that `rank.ts` reproduces the pipeline's
  own integer ranking exactly.
- **Hygiene** (`pipeline/quality.py`, reasons in `pipeline/data/dropped.txt`):
  a journal is dropped when its papers both miss its own count-weighted
  topic mix and share no single field (junk such as an astronomy
  colloquium full of social-science papers), not merely when they disagree
  with OpenAlex's top label, which is wrong for many old or broad journals
  (it files The Lancet under Engineering). A record with neither an ISSN
  nor a publisher goes too, but only when its name says it isn't a journal
  (`enrichment.is_placeholder_source`: conference abstract codes such as
  AGUFM, encyclopedias, meetings and forums, book series, repository pages,
  "PMC"): 108 records. Real journals without an ISSN in OpenAlex
  (Proceedings of the CSEE, TAIWANIA, Chinese Annals of Mathematics) stay.
  The coherence floor (0.85) sits under the lowest real journal (Cureus,
  0.858; `data/coherence.tsv` lists all), so in practice it drops nothing.
**Measured (2026-10-04, 18,965 journals, 54,369 centres).** The held-out
set is each journal's newest papers, never indexed (347,619); the harness
scores a seeded sample of 5,000 of them (title and abstract). The real
journal's rank:

| Configuration | top 1 | top 5 | top 10 |
|---|---|---|---|
| One averaged vector per journal (v1), whole sample | 12.7% | 30.0% | 40.2% |
| Multi-centre, whole sample | 12.8% | 29.7% | 40.1% |
| Fitted (emb 1, topic 0.02, prior 0), unseen half (2,500) | 12.8% | 30.2% | 40.2% |

On 18,965 journals, the title and abstract find the real one in the top 10
for about 4 papers in 10, and the top result's field is right about 65% of
the time. Multi-centre and the topic signal don't beat one averaged vector
on this measure (the differences are within noise); they're kept for what
they explain (a result's closest cluster and shared topics).

**Tried and not shipped: the methods and results** (branch `matching-v3`,
2026-10-04). On 369 open-access full texts from Europe PMC (biomedical
only), re-ranking with the methods (and results) added nothing over the
abstract (top 10: 30.8% with them, 35.1% without), and for a paper without
an abstract, its methods matched worse than its opening (29.2% against
35.7%). The journal centres are built from abstracts, so text that reads
like an abstract is what they recognise.

## Why only some journals get a real URL

Cloudflare Pages caps a single deployment at 20,000 files. A dedicated
static `/journal/[id]` page per journal, at 18,000+ journals, would
consume most of that budget on its own — and the project also needs
room for whatever else ships later. So `build_index.py`'s
`mark_prerendered()` flags only the top `PRERENDER_LIMIT` (2,000) journals
by `works_count` as `prerendered: true`; every other journal is still
fully browsable and matchable, just without its own crawlable URL.

The UI carries this distinction in one place, `journalUrl.ts`'s
`isPrerendered()`, and both `/journals` and `/match` branch on it the same
way: a prerendered journal renders as a real `<Link>` to `/journal/[id]`;
everything else renders as an inline expand button showing the same
detail view (`JournalDetail.tsx`) without a dedicated page. If you're
looking at either page and wondering why some results are links and
others are buttons, this is why — not a bug, and not arbitrary per-item
behavior, just a hard platform limit translated into an explicit field.

## Deployment

Static export (`next.config.ts`: `output: "export"`) deployed to
Cloudflare Pages. `npm run deploy` runs `next build`, then deletes
`out/_next/static/media/ort-wasm-simd-threaded.asyncify*.wasm` before
calling `wrangler pages deploy` — that file is the WASM runtime for
in-browser embedding and is 25.6MB, over Cloudflare Pages' 25MB per-file
limit. `src/lib/match/embed.ts` already points `onnxruntime-web` at a CDN copy
instead of a local one for exactly this reason (see its comment); the
`rm -f` in the deploy script is a defensive second layer in case Next's
bundler still copies a local copy into the export regardless.

The exceptions to "no backend": Cloudflare Pages Functions in
`web/functions/api/`. Three, `review.ts`, `figure.ts` and `rewrite.ts`,
exist because their feature needs somewhere to hold the Anthropic API key
that the browser must never see — see `CLAUDE.md`'s "three disclosed
exceptions."
The rest run accounts, M coins and payments (see "Accounts, M coins and
payments" below) on a D1 database; none of them ever receives anything
from a paper. Everything else in `web/` is static files served from
Cloudflare's edge.

Deploying needs, beyond `ANTHROPIC_API_KEY`:
the D1 databases created and their ids in `wrangler.toml` (production and
`[env.preview]`), `wrangler d1 migrations apply margalink --remote` after
every new migration, and the account secrets listed in `CLAUDE.md`.

### The AI review: what it defends against, and why

Design: `docs/superpowers/specs/2026-10-03-review-v2-design.md`.

**Shape.** The browser (`reviewOrchestrator.ts`) plans the paper (every
included chunk, never references), pays once (`/api/review/start`: ids,
lengths and which are reviewed), then sends one **section pass** per
reviewed section, a **checklist pass** at thorough, and one **editor pass**
last. Every pass carries the whole paper as one block marked
`cache_control`, after one shared system prompt and all three tools in a
fixed order (`reviewPasses.ts` `upstreamBody`), so Anthropic caches that
prefix once per review and later passes read it at a tenth of the price.
The first section pass runs alone so the cache is written once; the rest
run 4 at a time.

**The review's context.** After the paper comes one more block, the same for
every pass of a review and carrying the cache mark (`contextBlock` in
`reviewPrompt.ts`): the target journal and its scope, or "none chosen", and
the authors' notes for the review, if any, inside `<authors_notes>` tags
(any such tags in the notes are removed first). The system prompt says the
notes steer what to check and which guidelines to hold the paper to, but
never change the job, the tool, how a finding is written, or the rules:
quotes still come only from the paper. The notes are at most 20,000
characters (`MAX_GUIDANCE_CHARS`), sent with every pass, and paid for like
the paper: `/api/review/start` adds `guidanceChars` to the price, and each
pass's paper plus notes must fit it (`sentChars`). Without a journal the
editor gives a fit only when the notes describe one; the report shows none
otherwise.

**What each pass defends against.**
- Fabricated quotes: every quote is looked up in the paper the request
  carried (`reviewGrounding.ts` `locate`); one that isn't there is removed,
  and a finding left with nothing to point at is dropped unless it's about
  something missing.
- Fabricated cross-references: the editor can only name finding ids it was
  shown, and only from sections this ticket delivered
  (`editorOutsideDelivered`); its own across-paper findings are grounded
  like any other, and a disagreement between places needs a quote from each.
- Overconfidence: the system prompt asks for a legitimate explanation
  before an error, and a question when one is plausible; at standard and
  thorough, the editor keeps, softens or drops every major finding.
- Repetition: each section pass reports only problems whose fix belongs in
  its section; the editor groups duplicates; the report is assembled from
  ids (`reviewReport.ts`), so a finding has one place.
- Our own redaction marker: the prompt says "[redacted]" lines are ours, a
  quote that is only the marker never grounds, and a finding about it is
  dropped.
- Prompt injection: the paper is untrusted data, said so in the system
  prompt; tools are strict and every field is re-checked.

**Money.** The ticket weighs each reviewed section by its billed length and
the checklist and the editor as an average section; refunds are shared that
way. Each pass checks that its paper is no longer than the price paid for
(`maxPaidChars`). Cache writes and reads are counted at their rates (1.25x
and 0.1x input) as input-equivalent tokens, so /admin's cost is right.

**Kept on the device.** The finished report is kept only in the browser:
the last one on /review (`reviewKeep.ts`, `localStorage`), and each paper's
in the writing workspace beside its last PDF (`.margalink/review.json`,
never in a backup). Download (Markdown), Print or save as PDF, and Copy
work from the same report.

**Depths:** `TIER_PLAN` in `reviewPrompt.ts`. The live check
`scripts/eval/review_live.ts` measures cost, time and quality per depth
against the ceilings ($0.22, $0.32 and $0.54 per 50,000 characters).

### The figure generator: what leaves the device, and what doesn't

`/figures` is a figure *studio*, and almost all of it is local. A
researcher's raw spreadsheet is individual-level data, more sensitive than
a manuscript draft, so the design splits **language** from **drawing**:

- A declarative **`FigureSpec`** (`src/lib/figures/figureSpec.ts`) — panels ×
  roles × overlays × statistics × annotations × journal style — is the
  single artifact. Templates produce one (`figureTemplates.ts`,
  `public/figure-gallery/templates.json`), the panel editor edits one,
  Claude returns one, and a recipe file saves one.
- **`public/figurelib.py`** draws any valid spec deterministically, in a
  Web Worker running Pyodide (`public/figureWorker.mjs`, driven by
  `figureRunner.ts`). The same file is imported unchanged by the CPython
  selfcheck in `web/figurelib/` (a `uv` project pinned to Pyodide's
  library versions; also renders the gallery thumbnails), and CI runs it.
  Every control change re-renders locally (debounced, stale results
  dropped); exports are PNG/TIFF at 300/600 dpi, SVG and PDF at the
  journal width, with Liberation Sans/Serif (metric-compatible with
  Arial/Times) served from `public/fonts/`. SciPy (+14 MB) loads only when
  a figure asks for a test or a CI; tests run on the device.
- **Claude's job is language only** — turn "two panels: change by arm with
  Welch brackets; dose against change with a regression line" into a spec,
  or, for what the spec can't express, a small `customize(fig, axes, df)`
  hook. Two strict tools (`submit_figure_spec`, `submit_figure_hook`,
  `figurePrompt.ts`), called through `callAnthropicTool`.

**What leaves the device**, only when the user asks Claude and confirms
the notice (`FigureConsent.tsx`): column names and inferred types, the row
count, the user's request text, and the current spec with every typed text
field blanked (titles, axis labels and units, annotation text) and every
group reference as `"#n"` (the n-th group in first-appearance order). With
the separate labels checkbox ticked — asked afresh each time, and listed
verbatim in the notice — the labels of categorical columns with at most 30
distinct values (at most 12 columns) are added. Nothing else: never a
cell value, never sample rows, never a Python traceback.

`src/lib/figures/figureSchema.ts` is this feature's `reviewGrounding.ts`:
`buildFigurePayload()` is the *only* function permitted to construct the
outbound payload; it builds a fresh literal, and the spec passes through
`scrubSpec()`, which walks the schema so a stray local field can't ride
along. `figureSchema.selfcheck.ts` plants sentinels in cells, titles,
annotation text and a 40-level column and proves none leave by default,
and that opting in adds only the small columns' labels. The Function
re-validates the exact shape (`isValidFigurePayload`) and gates Claude's
output before returning it: the spec must validate, fit the columns, and
pass `checkLabels()` — a literal group label is accepted only if it was
among the labels sent; a hook must define `customize()` and pass `isCodeSafeToRun`.

**Custom-code tweaks have three layers**, because a hook runs next to the
user's data and one can arrive in a shared recipe, not only from Claude:
(1) `isCodeSafeToRun` (`figurePrompt.ts`) is an allowlist — imports only
from matplotlib/numpy/pandas/math, no double-underscore names, no names that
reach JavaScript (`js`, `pyodide*`), no file reads/writes — checked on the
server and again in the browser; (2) a tweak never runs until the user has
seen the code and clicked **Run this tweak**; (3) before running any tweak
the worker preloads everything it could still need and then permanently
replaces every network API (`fetch`, XHR, WebSocket, EventSource,
`importScripts`, nested workers, `caches`…) and everything that turns a
string into code (`eval`, the function constructors, string timers — so
dynamic `import()` can't be built) with non-configurable throwing stubs
(`lockNetwork`). `scripts/smoke/check_figure_sandbox.mjs` posts tweaks straight
to the worker, bypassing layer 1, and asserts every escape fails with zero
requests leaving. The upgrade path, if these JS-level locks ever prove
thin, is a CSP header on `figureWorker.mjs`. `figureEndpoint.selfcheck.ts` drives the
real handler with a stubbed upstream.

**Why labels are opt-in, and why tracebacks never leave.** A category
label is itself a value — a site name, a patient ID. Tracebacks can quote
a cell verbatim (`KeyError: 'ZZQQ-SENTINEL-0042'`), so there is no
auto-repair path: render errors are shown as prose built from an error
code and column names (`FigureRenderError`), with the traceback behind a
"stays on this device" disclosure.

**Data prep** (`spreadsheet.ts`) is part of the same local path:
`readWorkbook` reads every XLSX sheet and decodes CSV as UTF-8 or
Windows-1252; `suggestPrepOptions` finds the header row past metadata lines
and the decimal/thousands marks; `prepareDataset` applies missing-value
markers, strict number parsing, type overrides and a wide→long stack, and
emits a canonical CSV plus first-appearance `levels` — the order `"#n"`
means on both sides.

Costs: a spec call is roughly $0.02–0.04 (effort low); previews and
exports are free and unlimited; each Claude call costs the user 1 M coin
(refunded when the answer isn't usable), with 200 calls a day in all and 50
per account (`src/lib/accounts/dailyCaps.ts`, counted atomically in D1's
`rate_limits`: the per-account limit is what bounds an account that makes
its requests fail on purpose to be refunded).

The worker's own fetches (Pyodide from jsDelivr, `figurelib.py`, fonts) happen
off the main thread. They are bodyless GETs for public, versioned assets —
never anything from the dataset.

### Rewrite: a selected passage, and nothing around it

Rewrite (`/write`, in both editors) applies one editing tool to the
passage the person selects: Paraphrase, Change tone (academic, concise,
confident, plain), Shorten, Expand (develops what's there) or Clarity and
flow (a clearer version plus up to 3 notes). It's the third rule-3
exception (`functions/api/rewrite.ts`, `claude-sonnet-5`), and the
narrowest in what it may change: it rewrites, it never adds.

- **Placeholders.** The selection is read as a passage in the browser:
  `toPassage` (`latexText.ts`) for LaTeX, `docPassage` (`docText.ts`) for
  Word. Everything that isn't prose (a citation, a reference or label,
  maths, a picture, a footnote mark, a LaTeX comment) becomes a numbered
  placeholder `⟦n⟧` and stays on the device; the answer goes back in with
  each placeholder's source restored (`fromPassage`, `applyDocRewrite`).
- **What's sent.** `parseRewriteRequest` (`src/lib/writing/rewrite.ts`)
  accepts exactly `{ tool, tone, format, dialect, passage, coins }`: the
  passage, the tool and tone, LaTeX or Word text, and the paper's English
  (US, UK, Australian, Canadian or Indian). At most 2,000 words (1,000 to
  expand, which writes about twice what it reads), and
  `coins` must equal `rewritePrice(words)`. The browser runs it before
  sending; the Function runs it again before reserving or charging.
- **Checks.** `checkRewrite` holds every answer to the rules the prompt
  states (`rewritePrompt.ts`): each placeholder once, in order, in its
  paragraph, with its spacing; the same number of paragraphs; no number
  the passage didn't have; in LaTeX, the same commands and `{ } $ % &`;
  Shorten shorter and Expand longer. A refused answer gets one more try
  with the reason, charged once. The browser checks the answer again
  before it offers Replace.
- **Coins.** 1 M coin per 500 words, rounded up, at least 1
  (`rewritePrice`, shown on the menu before a tool is chosen). The
  Function reserves the daily limits (`DAILY.rewrite`: 1,000 a day in
  all, 400 of them for accounts that never bought coins, 100 per
  account), debits, calls Claude, and refunds (`rewrite_refund`) whenever
  no checked answer goes out. Try again is a new rewrite, charged again.
  If the text changed before Replace, the rewrite isn't put in (the card
  offers Copy) and isn't refunded: it was delivered.
- **Consent and the card.** `RewriteConsent.tsx`, once per paper, after
  an unticked box: kept as `rewriteConsent` in the project's
  `project.json` (OPFS), never in a backup zip, and withdrawn with the
  command "Turn off Rewrite for this paper". The answer shows as a word
  diff (`RewriteCard.tsx`) with Replace (one undo step), Try again and
  Discard.

`rewriteEndpoint.selfcheck.ts` drives the real handler with a stubbed
upstream (refusals before any charge, every failure refunded once, no
passage in the logs); `scripts/smoke/check_rewrite.mjs` covers both
editors against a stubbed Function; `scripts/eval/rewrite_live.ts` is the
manual check against the real Claude, before a merge.

### The writing workspace: LaTeX or Word in the browser

`/write` is a single-author LaTeX workspace: start from a journal's
template (or import a zip), edit in CodeMirror, compile to PDF, back up
as a zip. A Word document is the other kind of project (see **Word
documents** below). No server; the only AI in the editor is Rewrite,
opt-in per paper (above). It is also the hub:
the other tools open as windows over it (see **Windows** below).

- **Engine.** TeX Live 2023 compiled to WebAssembly by the BusyTeX
  project — its MIT-licensed core build (`busytex.js`/`.wasm`, the
  pipeline and worker scripts, and the Ubuntu TeX Live data packs), used
  unmodified. The AGPL-licensed wrappers around it are not used; our
  glue (`public/texWorker.js`, `texRunner.ts`) is our own. Two drivers:
  pdfLaTeX and XeLaTeX.
- **Hosting.** The engine is ~30 MB of WASM plus ~110 MB for the basic
  pack and more for the optional packs — too big for Pages' 25 MB file
  cap, so it lives on the public R2 bucket `margalink-assets` under a
  release-dated prefix, every object `immutable`. The data packs are
  kept by the engine's own loader in IndexedDB (`EM_PRELOAD_CACHE`,
  keyed by pack version), so the 104 MB basic pack isn't subject to
  HTTP-cache entry limits (Firefox's is 50 MB); the 30 MB `.wasm` and the
  small scripts come from the HTTP cache. `scripts/ops/publish_busytex.sh` uploads only an allowlist of
  files with pinned sizes and a 500 MB total cap, so a mistake can't
  grow the bill; the bucket's CORS allows only our origins.
- **Packs.** `texEngine.ts`'s `packsFor()` reads a paper's `\usepackage`
  lines to pick data packs. BusyTeX only resolves packages named in the
  main `.tex`, so a template whose class needs more (IEEEtran's Times
  fonts, acmart) declares `packs: ["all"]`, and a compile that fails on a
  missing file is retried once, on a fresh worker, with every pack.
- **Compile.** `texRunner.ts` owns the worker: newer compiles supersede
  older ones, a 90 s deadline applies only once TeX runs (a slow first
  download is not a hang), and `texLog.ts` turns the log into
  file/line diagnostics for the editor gutter.
- **Storage.** `projectStore.ts` keeps each project as a folder in the
  browser's Origin Private File System (`margalink-write/<id>/`), with
  `project.json` and the last compiled PDF in a hidden `.margalink/`
  folder. Saves are debounced; the page asks for persistent storage and
  says plainly that clearing site data deletes drafts. `zip.ts` (fflate)
  does backup and import.
- **Templates.** `public/templates/` bundles four that compile here
  (plain article, elsarticle, IEEEtran, acmart) with their licences in
  `SOURCES.md`; eight more publishers are links to their own template
  pages. `templateCatalog.ts` maps a journal's publisher to one, so
  `/write?journal=<id>` preselects it.

- **Layout.** An open project is the whole viewport (`fixed inset-0`, no
  page header): a clay tray (home, back, name, journal chip, tools, the
  files toggle and the view — source, both, or PDF — Compile, ⌘K), the
  files and outline on a clay slab, the source and the PDF on paper
  sheets, a status line. The view, the files panel and auto-compile are
  remembered in `localStorage`; the editor stays mounted in the PDF view
  so undo survives.
- **Windows.** The toolbar's Match, Review, Figures and Checks (and the
  journal chip's Journal) open in a native `<dialog>` (`components/ui/Dialog.tsx`: focus trap,
  Escape, focus back to the editor). Each body is a `next/dynamic`
  import, so pdf.js, the matching model and the figure studio load only
  when asked for. Tool state lives in hooks mounted by `useHub`
  (`Hub.tsx`: `useMatch`, `useReview`, `useFigures` — the same hooks the
  standalone pages render — plus `useChecks`), which either workspace
  calls, so closing a window keeps its results and a running review
  carries on (the status bar shows it). `HubWindows` renders the windows
  for both. Each workspace is keyed by project id so nothing leaks
  between projects; the per-project lock, unsaved-edit tracking and
  save-on-leave are `useProjectSession.ts`, also shared.
- **Paper text.** Match, Review and Checks read the last compiled PDF
  (`store.lastPdf` or the latest `CompileResult.pdf`) through the same
  `extractFromFile` pipeline as an upload — headings from fonts,
  references from the compiled bibliography — so they say "Compile
  first" until there is one. `extract.ts` destroys its pdf.js task after
  reading (the workspace extracts once per compile). No LaTeX→text
  detex: `texSource.ts` only has a rough word count for the status bar.
- **Writing aids.** `texSource.ts` (pure, selfchecked) is the source of
  all of them: `bibEntries` (keys and titles from the project's `.bib`
  files) and `texLabels` feed the formatting bar's Cite/Ref lists
  (`EditorFormatBar.tsx`) and the suggestions (`latexCompletions.ts`, a
  CodeMirror completion source created once per editor — autocompletion
  tells sources apart by identity); `texOutline` + `paperFiles` (the main
  file and what it `\input`s, depth first) build the Outline tab and the
  whole-paper word count, shown against a pilot journal's word limit;
  `tableSnippet`/`figureSnippet` are what the bar inserts; and
  `findQuoteInTex` turns a review citation into a line for "Jump to
  source" (best effort: first six words of three letters or more, then
  the last six). Auto-compile (off by default) compiles 2 s after the
  last keystroke unless a compile is running. File names are edited in
  place (`FileTree.tsx`); dropping files on the list uploads them.
- **Spelling and grammar.** Harper (`harper.js`, Apache-2.0), a
  rule-based checker compiled to WebAssembly, runs in a Web Worker
  (`grammar.ts`); the engine is downloaded once from our own site and
  nothing is sent. LaTeX is read as prose by `proseMask` (`latexText.ts`:
  citations, references, labels, maths, code and comments blanked); a Word
  document by `docProse` (`docText.ts`), its marks painted with Folio's
  suggestion layer, a transaction that's never saved (`useDocSpelling.tsx`).
  A paper's English (or off) and its dictionary are kept in its
  `project.json` (`spelling.ts`).
- **Figures.** "Insert into paper" writes the 300 dpi PDF and a data-free
  recipe (`figures/<name>.figure.json`, the same shape `RecipeImportExport`
  saves) into the project and drops a figure block at the cursor; opening
  the recipe offers "Edit in the figure studio". Pyodide loads only once a
  spreadsheet is attached; Insert waits for a running compile, so the two
  peak-memory jobs don't overlap.
- **URL.** `/write?p=<id>` reopens a project (a reload, or the figure
  studio's link); `/write?journal=<id>` (from a match result or a journal
  page) preselects a template for a new one.
- **Word documents.** Importing a `.docx` or `.dotx` makes a project of
  `kind: "docx"` (`importDocx` in `projectStore.ts`) holding one file,
  `paper.docx`, stored as imported; a `.dotx` has its main part's content
  type rewritten, and `.doc`, macro-enabled and encrypted files are
  refused with what to do. `DocWorkspace.tsx` opens it in Folio
  (`@stll/folio-react`, Apache-2.0, a fork of Eigenpal's docx-editor,
  pinned exact): `DocEditor.tsx` wraps it (its own `next/dynamic` chunk,
  about 2 MB, no requests, fonts bundled). Saves are debounced two
  seconds and happen at ⌘S and before any window opens, a download, a
  backup and leaving; closing any other way (Back, another route) starts
  a last save as the editor closes, which the workspace's cleanup stores.
  What's stored is tracked in `docSaveState.ts`, since Folio's own record
  of edits forgets those made while a save ran. Every save is a **full** save (Folio's selective save reset
  its baseline to the first-opened file and dropped an earlier save's
  edits), which still carries the template's styles, numbering, theme,
  fonts and headers over byte for byte. The windows read the document as
  last saved (`new File([saved], "paper.docx")` through `extractFromFile`,
  where `docxText` keeps Word's list numbers so an auto-numbered
  reference list is counted); Jump to source selects the quoted
  paragraph; a figure goes in at the cursor at its drawn size (300 dpi
  PNG, sized to 96/300 of its pixels). No Word templates in the Journal
  window. Folio's stylesheet is scoped to the editor
  (`folioCss.selfcheck.ts`, and the Word smoke's style comparison of `/`
  and `/review` after a Word project). Known rough edges, with upstream
  issue drafts: `docs/word-editor-known-issues.md`.

Nothing in the workspace shows a network trace any more (the tool pages
lost theirs too); the status line says whether a request carried text
you agreed to send (a review, Ask Claude or a rewrite).

### Accounts, M coins and payments

The three AI features cost real money per run (a review ~$0.12–0.32, up to
~$1.7 for a 400k-character thorough one; an Ask Claude call ~$0.03; a
rewrite at most about $0.13, the largest Expand), so
they're paid in M coins and need an account. Nothing else does. Plan and
reasoning: `docs/plans/2026-09-28-accounts-coins-payments.md`.

**Who you are.** Google (OIDC code flow with PKCE and `state`, scope
`openid email`; the id_token comes straight from Google's token endpoint,
so its claims are checked but not its signature, per OIDC Core 3.1.3.7) or
a one-time email link (Resend; the token rides in the URL #fragment and is
spent only when the person confirms, so mail scanners can't burn it; the
page asks the server which address the link is for rather than trusting
the link). `safeNext` checks every post-sign-in destination after URL
normalisation, on the way in and on the way out. Email requests are
limited per address and network (so a stranger's network can't lock you
out of yours), per address overall (against spam), per network (an IPv6
/64 is one) and, for addresses without an account, by a daily budget
that existing users never draw on; Turnstile guards the form when its
keys are set. One
account per verified address, whichever way you come in. A session is an
opaque token in an HttpOnly `__Host-` cookie, stored only as its sha256; a
readable `ml_in=1` cookie tells pages someone is signed in, so a
signed-out visitor never calls `/api/me`. Google opens in a popup and the
link in a new tab, so a loaded paper is never lost; the page picks up the
sign-in when it regains focus (a blocked popup says so rather than
redirecting away). `_middleware.ts` refuses any non-GET without our own
`Origin` (the Paddle webhook excepted), marks everything `no-store`, and,
at most once a minute, runs `housekeeping` after answering: expired
tickets swept, sign-in links, sessions and rate counters deleted, and a
deleted account's welcome fingerprint once it's 12 months old, since
Pages has no scheduler. Every fingerprint kept for rate limits and the
welcome bonus is an HMAC with `HASH_SECRET` (sign-in fails closed without
it when deployed), so holding the database isn't enough to test an
address. No page may be framed by another site.

**The ledger.** `coin_ledger` is append-only and the balance is
`SUM(delta)`: a debit is one conditional `INSERT … SELECT … WHERE SUM >=
cost`, so two requests can't both spend the last coins, and
`UNIQUE(kind, ref)` makes every credit and debit idempotent (webhook
retries, refund sweeps). The welcome bonus is keyed on a keyed fingerprint
of the canonical address in `welcome_claims`, which outlives account
deletion by 12 months (`released_at`). Signing in needs the form's two
boxes (18 or older; the terms and the privacy notice): the email request
refuses a link without `agree: true`, and Google's start without
`agree=1`. For Pro's carry-over, `proCoinsLeft` walks the ledger: Pro coins
are spent first, a refund returns to the coins it was paid with, a
reversed pack takes pack coins first and a reversed Pro payment Pro coins
first.

**Paying for a review.** `POST /api/review/start` receives every chunk the
review sends, as ids and lengths (never text), and which of them are
reviewed; prices the whole paper with `reviewPrice` (the same function the
consent quotes); checks today's capacity; and, in one batch, debits and
creates a ticket bound to the tier and the reviewed sections (plus the
checklist at thorough), for two hours. Every pass's paper must fit the price
paid (`maxPaidChars`). Every pass sends `X-Review-Ticket`;
`review.ts` spends one of it (`claimReviewPass`) before calling Claude, so
nothing unpaid reaches the API: a section that already came back is
refused (409), each section gets at most four tries (`TRIES_PER_SECTION`,
counted in the same statement that checks them, in the ticket's `passes`),
the editor runs once per new delivery, and none starts within five minutes of the
ticket's end, so a pass can't outlive it. That binds what a ticket buys to
what it cost: Claude reads each paid section at most four times. Each
section that comes back is recorded (`review_deliveries`), as is the
editor's report. When the ticket expires, `sweepTickets` refunds the share it
didn't deliver, rounded up: sections weigh by their length and the
editor (and the checklist) like an average section, so padding a review with tiny
sections buys nothing, and a client that takes every section and skips the
editor still pays for what it got. Resume and
Retry reuse the ticket: a review is paid for once. A pass refused for
today's capacity is refused before it spends one of the ticket's. A
cancel pressed while a review is being paid for takes effect once the
charge has landed on the run's state, and any error that stops a paid run
leaves it resumable. Ask Claude debits 1 coin per call and gives it back
unless an answer goes out; Rewrite does the same at 1 coin per 500 words.

**Payments.** Paddle Billing is the merchant of record. The browser loads
Paddle.js only when Buy is clicked and names the account in `custom_data`
with its signature (`checkoutSig`, from `/api/me`), so the webhook credits
only the account that bought, never one a stranger names. An event that
refers to something not seen yet (a refund of a purchase, a won dispute
before its chargeback) is answered 503 and not recorded, so Paddle sends
it again later. `pay/webhook.ts` checks Paddle's signature
(HMAC-SHA256 over `ts:rawBody`, five minutes of skew, any `h1`), records
the event id in the same batch as its effects, and credits a pack, records
a Pro payment with its billing period, upserts a subscription (ignoring
events older than the row), or applies an adjustment (`adjustments`): an
approved refund or a chargeback takes back its share, worked out inside
the statement so two landing together can't take too much (the balance
may go negative, which blocks spending), and a won dispute gives back what
its chargeback took. Events without `custom_data` find their account
through the subscription they belong to. Pro's monthly coins are granted
lazily by `grantDuePro` from `/api/me` and the webhook (no scheduler); a
yearly plan drips monthly; a period is worth its entitlement (100 a month,
1,200 a year) times the share of its payment not refunded, so a refund
also stops later drips; unspent Pro coins above 100 lapse as the next
month arrives, and that lapse is only written if the ledger hasn't moved
since it was read. Deleting an account cancels live Pro at Paddle first
(an outage stops the deletion; Paddle saying there's nothing to cancel
doesn't) and takes the address's sign-in links and counters with it.

**Testing.** The account selfchecks run the real handlers on Node's
built-in SQLite through `testD1.ts`; the smokes sign in through
`scripts/smoke/mock_account.mjs`; `scripts/e2e/e2e_accounts.mjs` runs the real
Functions on a fresh local D1 under `wrangler pages dev`.

## The invariant that keeps `src/lib/` and `functions/` from duplicating types

`functions/api/review.ts` already imports directly from `src/lib/`
(`journalRules.ts`, `reviewPasses.ts`, `reviewGrounding.ts`,
`anthropicStream.ts`) via relative paths — there's no Workers-runtime barrier stopping it. The rule that
makes this safe: **`functions/` may import from `src/lib/` only modules
that are pure or isomorphic** — no `window`, no `localStorage`, no `fs`.
Most of `src/lib/` qualifies; a handful of browser-only modules
(`embed.ts`, `extract.ts`) and one Node-only module (`journalsServer.ts`,
used at build time) don't, and should never be imported from `functions/`.

`src/lib/review/reviewTypes.ts` is the cleanest example: it's the one file both
the client (`reviewOrchestrator.ts` and its consumers) and
`functions/api/review.ts` (via `reviewPasses.ts`) take the pass contract
— `SectionRequest`/`ChecklistRequest`/`EditorRequest`/their responses, `ReviewReport` — from, instead
of each side declaring its own copy. It qualifies for the same reason —
just types and a `const` array, nothing environment-specific.

## Folder map

One line per file. Route folders (`app/journals/`, `app/match/`, etc.)
each follow the same shape: `page.tsx` orchestrates state and layout,
`_components/` holds the pieces it assembles, `layout.tsx` (where present)
is Next's required per-route metadata shim for a `"use client"` page.

**`src/app/`** — routes and site-wide chrome.

| File | What |
|---|---|
| `layout.tsx` | Root layout: fonts, `<html>`, metadata from `lib/site.ts`. |
| `page.tsx` | Homepage shell — assembles the `_landing/` sections in one tree, no context provider. |
| `globals.css` | Site-wide only: tokens, reset, reduced-motion, the desk background (a fixed warm gradient with grain) behind every page but the homepage. Everything homepage-specific lives in `_landing/home.css`. |
| `clay.css` | The clay theme the tool pages and the workspace share, in the components layer (so a Tailwind utility on the same element wins): `.clay` (raised slab), `.clay-well` (pressed in), `.sheet` (paper), `.clay-btn` / `.clay-primary` / `.clay-ghost` / `.clay-key` / `.clay-chip`, `.clay-input` / `.clay-field` / `.clay-select`, `.clay-card` (a choice; `aria-pressed`/`aria-checked`/`data-selected` press it in), `.bead`, `.grip`, `.desk`, `.clay-window` (dialogs). Warm shadows only, one light from the top left; the `--away` colour stays reserved for what leaves the device. |
| `opengraph-image.tsx` | OG image, rendered with `satori` — can't resolve CSS custom properties, so `lib/site.ts`'s `BRAND` colors are duplicated here as literal hex, deliberately. |
| `robots.ts`, `sitemap.ts` | SEO. |
| `home/page.tsx`, `home/updates.ts`, `home/_components/AccountStrip.tsx`, `home/_components/NewsRail.tsx` | The dashboard ("Home" in the tray; the landing page's Dashboard button leads here): two ways in — the workspace and the guide — and, further down, What's new, read from `updates.ts` (newest first; to announce something, add an entry at the top). |
| `guide/page.tsx`, `guide/shots.json`, `guide/_components/ResetSiteData.tsx` | The user guide: every tool and option on screenshots of the real UI, with numbered markers whose positions `scripts/docs/guide_shots.mjs` measures and writes to `shots.json` (the images are in `public/guide/`). Re-run the script after a screen changes. |
| `architecture/page.tsx` | The developers' and reviewers' tour: the system diagram, the privacy rules in code, each tool's pipeline, the design system, tests, deploying, a review checklist. This file stays the source; the page distills it. |
| `privacy/page.tsx` | Static prose + the privacy-flow SVG diagram, and the itemised account notice (`#accounts`). |
| `signin/page.tsx`, `signin/_components/SignInView.tsx`, `signin/verify/` (`_components/VerifyView.tsx`) | Sign in (Google popup or email link); where Google's popup lands and closes; the email link's confirm step. |
| `account/page.tsx`, `account/_components/AccountView.tsx` | The balance and coin history, Pro, sign out (here or everywhere), download my data, delete. |
| `pricing/page.tsx`, `pricing/_components/Packs.tsx` | What's free, the price table, the packs and Pro; the checkout (Paddle.js on Buy) and the wait for the webhook's coins. |
| `terms/page.tsx`, `refunds/page.tsx` | The terms (M coins as prepaid usage credits) and the refund policy. |
| `contact/page.tsx` | Who runs the site and how to reach them (the operator details come from `NEXT_PUBLIC_*`). |
| `team/page.tsx`, `team/team.ts` | The team page; the people are listed in `team.ts`. |
| `journal/[id]/page.tsx` | Static-generated per-journal page (`generateStaticParams` from `getPrerenderedJournals()`). |
| `journals/page.tsx`, `journals/layout.tsx` | Browse/search/filter the full journal index. |
| `match/page.tsx` | JSX over `useMatch()`: the input, the steps run on the device, the results. |
| `match/_components/useMatch.ts` | The whole run — read → embed → topics → references → rank, the filter re-rank with its out-of-order guard (`matchSeq`), the rules checks — as one hook, so the writing workspace's Match window shares it. It interleaves ~8 `setState` calls with async steps, so it stays with its state rather than moving to `lib/`. |
| `match/_components/MatchFilters.tsx` | The 5 filter controls + `FEE_PRESETS`/`SPEED_PRESETS`. |
| `match/_components/MatchResults.tsx` | The results list with fit badges, built on the shared `JournalResultTitle`/`JournalResultChips`. On `/match` rows link on to `/review` and `/write?journal=`; inside the workspace `onReview`/`onSetTarget`/`expandOnly` keep everything on the page. |
| `match/_components/PaperInput.tsx`, `WhatWeRead.tsx`, `WhyThisJournal.tsx` | File-or-paste entry; what the matcher read (with a paste correction); the per-result reasons. |
| `match/_components/ProcessingTrace.tsx` | The live "On this device" step log + error text. |
| `match/layout.tsx` | Route metadata shim. |
| `review/page.tsx` | JSX over `useReview()`: upload, journal pick, structural check, then `ReviewRunner`. |
| `review/_components/useReview.ts`, `ReviewRunner.tsx` | The flow (attach, journal, outline edits, the passes with cancel and resume) as a hook, and the run's controls, consent notice, progress and result as one component — shared with the workspace's Review window (`onFile` can keep the project's target journal; `onCitation` adds "Jump to source"). |
| `review/_components/JournalPicker.tsx` | The hand-verified-journal grid (`showMatchLink` off inside the workspace). |
| `review/_components/TierPicker.tsx` | The quick/standard/thorough grid; owns `TIER_OPTIONS`. |
| `review/_components/OutlineEditor.tsx` | The detected outline before consent: per-section type, merge, add heading, "Don't send". |
| `review/_components/ReviewResultPanel.tsx` | The review's report: overview and Fix these first, section by section, across the paper; Download, Print, Copy. |
| `review/layout.tsx` | Route metadata shim. |
| `figures/page.tsx` | Header, `FigureStudio` over `useFigures()`, and "Add to a paper" in the export bar's slot. |
| `figures/_components/useFigures.ts`, `FigureStudio.tsx` | The studio's state (upload → data prep → spec, the debounced render loop, recipes, export) as a hook, and its body as a component — shared with the workspace's Figures window. |
| `figures/_components/DataPrep.tsx` | Sheet, header row, number format, missing-value markers, per-column types, wide→long, the parsed preview table. |
| `figures/_components/Describe.tsx` | The request box, Ask Claude (spec) / custom tweak (hook), the labels opt-in, the live `[data-testid="figure-payload"]` preview. |
| `figures/_components/Gallery.tsx` | Template thumbnails; picking one calls `bindTemplate`. |
| `figures/_components/PanelEditor.tsx`, `StyleBar.tsx` | Per-panel controls (family, roles, axes, summary, order, overlays, statistics, annotations) and whole-figure style/size/palette/grid. |
| `figures/_components/FigurePreview.tsx`, `ExportBar.tsx`, `RecipeImportExport.tsx` | The live image with local-only error details and test results; PNG/TIFF/SVG/PDF export (with a `children` slot beside Export); recipe save/load. |
| `figures/layout.tsx` | Route metadata shim. |
| `figures/_components/AddToPaper.tsx` | Puts the figure as a PDF into a LaTeX `/write` project's `figures/` and copies the LaTeX (Word projects are left out: they take figures from their own Figures window). |
| `write/page.tsx` | Project list, template picker, zip import; `?journal=` preselects a template, `?p=` reopens a project; an open project renders the full-screen `Workspace` alone. `useNetworkTrace()` counts requests with a body for the workspace's status line. |
| `write/_components/Workspace.tsx` | One open LaTeX project, full screen: the tray, the files/outline slab, the source and PDF sheets (a draggable split, or one of them alone), diagnostics, the status line, and the tool windows over it. Owns the compiled PDF as a `File`, the text files' contents (for suggestions, the outline and the word count), the remembered view settings, auto-compile and figure insertion. |
| `write/_components/DocWorkspace.tsx`, `DocEditor.tsx`, `folioCss.selfcheck.ts` | One open Word project: the tray (with Download .docx), the document in Folio, the status line, the same windows. `DocEditor`'s handle: save (full), pending, text, insertImage (at its drawn size), showQuote, focus. The selfcheck keeps Folio's stylesheet from restyling the site. |
| `write/_components/Hub.tsx`, `useProjectSession.ts` | Shared by both workspaces. `useHub` owns the tools' hooks (the one route that imports another route's `_components/`), ⌘K, the target journal, the running-tool line and leave-while-reviewing; `HubWindows` renders the windows; `hubCommands` the palette's shared entries. `useProjectSession`: the per-project Web Lock, unsaved edits, beforeunload and the save on hide and on leave. |
| `write/_components/Toolbar.tsx`, `StatusBar.tsx`, `CommandPalette.tsx`, `Shortcuts.tsx`, `CompileFirst.tsx` | The shell: home / back / rename / journal chip / tools / files toggle / view / Compile / ⌘K; the status line (compile status, counts, the paper's word count and limit, saved, a running tool, the engine, auto-compile, what was sent, the shortcuts key); the ⌘K palette; the keyboard shortcuts window; the "Compile first" notice. |
| `write/_components/EditorFormatBar.tsx`, `latexCompletions.ts`, `Outline.tsx` | The formatting bar over the source (wrap or insert; Cite/Ref/Figure lists, a table-size grid); the suggestions inside `\cite{`, `\ref{`, `\begin{` and after `\`; the Outline tab. |
| `write/_components/MatchWindow.tsx`, `ReviewWindow.tsx`, `FiguresWindow.tsx`, `ChecksWindow.tsx`, `JournalWindow.tsx`, `useChecks.ts` | The windows' bodies (dynamic imports) over the shared hooks; `useChecks` runs the format and rules checks over the PDF text. |
| `write/_components/LatexEditor.tsx`, `FileTree.tsx`, `PdfPane.tsx`, `Diagnostics.tsx`, `TemplatePicker.tsx`, `StorageBanner.tsx`, `download.ts` | The workspace's pieces. `LatexEditor`'s handle: goto (mid-screen), insert, wrap, insertBlock, comment, focus. |
| `write/_components/useRewrite.tsx`, `RewriteCard.tsx`, `RewriteMenu.tsx` | Rewrite in both editors: the selection's price on the menu, the paper's consent, the request, and the card (a word diff with Replace / Try again / Discard, Clarity's notes, or Copy when the text changed). The formatting bar's Rewrite in LaTeX; the editor bar's button and right-click item in Word. |
| `write/_components/useDocSpelling.tsx`, `SpellingCard.tsx` | Spelling and grammar in a Word document: marks painted with Folio's suggestion layer (never saved) and their fixes in a card under the caret. LaTeX shows them as CodeMirror diagnostics in `LatexEditor.tsx`. |
| `write/_components/useNetworkTrace.ts` | `useNetworkTrace()` — patches `fetch` for the page's lifetime; `/write` uses it to count requests that carried a body (the status line's "sent"). The on-page request list it once fed was removed on 2026-09-27. |
| `write/layout.tsx` | Route metadata shim. |

**`src/app/_landing/`** — homepage-only, a Next "private folder" (excluded
from routing; nothing outside `app/page.tsx` imports from it).

| File | What |
|---|---|
| `home.css` | The ~87% of the old single `globals.css` that's homepage-only. |
| `useScrollProgress.ts` | The one rAF-throttled scroll listener: hero progress, the closing section's progress (the landing crossfades into it), overall page progress for the 3D paper, and the reduced-motion query. |
| `motion.ts`, `easing.ts` | The homepage's animation maths: `localProgress`, `stagger`, `motionStyle`, over `clamp01`, `smooth`, `between`, `lerp`. |
| `SiteHeader.tsx`, `HeroSection.tsx`, `FinalSection.tsx`, `TypedPaper.tsx`, `ToolsOverlay.tsx` | The homepage is two screens: the landing (`HeroSection` — the wordmark with the Link cutout, "Find your path.", over the clay desk) and the closing call to action (`FinalSection`), which the landing crossfades into; its right column holds the desk's self-writing 3D paper (on phones, `TypedPaper`, the same manuscript as an HTML page). The middle sections (workflow, journals, matching, review, privacy) were removed on 2026-09-26. The fixed header's one link is Dashboard (`/home`); the finale's tool buttons were removed on 2026-09-28 (the closing section's Explore our tools still opens `ToolsOverlay`). |
| `IntroSequence.tsx` | The first-visit intro: a transparent layer over the landing (the question, then the landing's own wordmark builds, then the desk settles) — timing, dismissal, `sessionStorage` memory. |
| `ClayDesk.tsx` | Thin shell over `three/clayDesk.ts`: the landing's desk. It plays the intro (held floating while `.intro-overlay` is up, then settling), and on scroll morphs: every object leaves the frame, the paper stack rises, faces the camera and settles right, then writes itself in place — its top sheet is a canvas texture laid out as the manuscript (`three/paperText.ts`), placeholder bars replaced by text as it types. `_landing/TypedPaper.tsx` is the phone version. |

**`src/components/`**: shared across routes, one folder per concern.
A component used by a single route lives in that route's `_components/`
instead (or `_landing/` for the homepage). Two deliberate exceptions: the
consent notices (`review/ReviewConsent.tsx`, `figures/FigureConsent.tsx`)
stay here because `CLAUDE.md` names them as the only doors to the AI
features, and `ui/` holds generic primitives even when one route uses them.

| File | What |
|---|---|
| `layout/PageHeader.tsx` | Every non-homepage route's header: a skip link, then a sticky clay tray (the landing, Home, the five tools with the current one pressed in, Guide, the account button) the same width on every page, then the h1 with its tool's bead; 3 content-width tiers for the h1. |
| `layout/SiteFooter.tsx` | The site footer on Home and the team page: links, legal pages, copyright. |
| `layout/Logo.tsx` | `LogoMark` (the M drawn as one route ending at the ochre dot) and `Wordmark` (its i carries the same dot). |
| `layout/BetaTag.tsx` | The Beta tag beside the logo in both headers. |
| `layout/ContactDetails.tsx` | The operator, contact address, postal address and phone (from `NEXT_PUBLIC_*`), as the legal pages give them. |
| `layout/LegalSection.tsx` | A titled section of the legal pages. |
| `ui/Step.tsx` | A numbered step of a tool page on a clay slab (Review, Figures). |
| `ui/Dialog.tsx` | The modal window primitive on the native `<dialog>` (`showModal()`: focus trap, Escape, top layer, focus restore), used by the writing workspace's windows and palette. |
| `ui/ErrorText.tsx` | The one `role="alert"` error paragraph. |
| `ui/PaperDropzone.tsx` | The file drop zone. Optional `accept`/`title`/`hint`/`ariaLabel` props (defaulting to its PDF/DOCX copy) let `/figures` reuse it for CSV/XLSX. |
| `ui/NewTabLink.tsx` | A link that opens in a new tab (terms and privacy from a checkout or the sign-in form). |
| `account/AccountButton.tsx` | The M coin bead and balance in the tray and the landing header, or Sign in. |
| `account/useAccount.ts` | The account store (`useSyncExternalStore`): asks `/api/me` only when the `ml_in` hint cookie exists, revalidates on focus. |
| `account/SignInPanel.tsx` | Continue with Google (popup) or an email link, with the sign-up checkboxes. |
| `journals/JournalResultRow.tsx` | `JournalResultTitle` (prerendered-link-vs-expand-button) + `JournalResultChips` (metadata chips), shared by `/journals` and `/match`. |
| `journals/JournalDetail.tsx` | A journal's details: fees, open access, indexing, speed, its rules when hand-verified. |
| `checks/RulesCheckPanel.tsx` | A paper checked against one journal's hand-verified rules (match, review, the workspace's Checks window). |
| `checks/CheckRow.tsx` | One pass/warn/fail row, shared with the structural check. |
| `checks/FormatCheckPanel.tsx` | The 9-row structural check (match, and the workspace's Checks window). |
| `review/ReviewConsent.tsx` | The review's consent notice: exactly what is sent, the price, the explicit-consent box. |
| `figures/FigureConsent.tsx` | Ask Claude's consent notice. A deliberately separate sibling of `ReviewConsent.tsx`, not a shared generalization: see `CLAUDE.md`'s exceptions paragraph for why each notice stays independently readable. |
| `writing/RewriteConsent.tsx` | Rewrite's consent notice, given once per paper; a separate sibling of the other two for the same reason. |
| `docs/Doc.tsx`, `docs/Art.tsx`, `docs/Diagrams.tsx` | The documentation pages' blocks (contents list, sections, screenshots with markers, option tables, asides), their clay illustrations (inline SVG) and diagrams. |

**`src/app/_landing/three/`**: the landing's 3D scenes (three.js), built
in code, sharing one canvas setup.

| File | What |
|---|---|
| `useThreeCanvas.ts` | The setup/cleanup preamble shared by both scenes — mounting, the WebGL try/catch, resize, the rAF loop, teardown. |
| `clayDesk.ts` | The landing's clay-render desk, built in code (pencil, ruler, graph paper, sheets, chart, notebook, paper plane, the dashed path to a pin): rounded geometry, one matte palette-tinted material, RoomEnvironment + soft VSM shadows on a shadow-only ground. `LANDING_DESK` / `LANDING_DESK_NARROW` place it. Rendered by `app/_landing/ClayDesk.tsx` through N8AO ambient occlusion. On wider screens the camera pans down the desk with the page's scroll, so the landing (its pin included) scrolls away with its page. The closing section comes next: its own paper stands up from the desk beside the copy, a pin drops onto it and it writes itself while the section holds — finished by the end of the hold. Then the pan runs on past the two beats and holds again over the tools book (it tips to look down while the pages turn, then a pin drops onto the book), and once more at the finale: a finished manuscript gets the last pin and a rubber stamp slams READY onto it (the view dips with the hit). The dashed path stays flat on the desk — landing pin → behind the paper's pin → down the middle past the beats → under the book by its pin → under the manuscript. |
| `book.ts` | The open clay book: board, page blocks, two static page faces and two turning leaves whose vertices are laid along a bending curve each frame (corner lifts first, lands last; front/back textures, the back mirrored). `setProgress(hp, still)` turns them by the book's pinned scroll; `still` (reduced motion) snaps. |
| `bookPages.ts` | Draws one book page on a canvas: heading pages (tool, heading with the teal cutout, one line) and simple illustrations (review, write, figures). |
| `bookSpreads.ts` | The book's content — one spread per tool — and its scroll timing (tilt, turns, pin), shared by the 3D book and the page's caption so they always agree. |
| `paperText.ts` | The closing page's manuscript text, shared by the 3D page that writes itself and its phone version (`TypedPaper.tsx`). |

**`src/lib/`**: framework-agnostic logic, one folder per feature (see
"`lib/` conventions" below). Each `*.selfcheck.ts` sits beside the file it
checks.

*`src/lib/paper/`*: reading a paper (PDF/DOCX → text, headings).

| File | What |
|---|---|
| `extract.ts` | PDF/DOCX → text (browser-only: uses `pdfjs-dist`/`mammoth`); with `{ headings: true }` (the review only) also the document's heading structure. A .docx's text is `docxText` over mammoth's document, which writes in the numbers Word draws on numbered lists (selfchecked). |
| `headingHints.ts` | Pure: the document's own heading structure — `pickPdfHeadings()` from per-line font data, `pickDocxHeadings()` from Word heading styles. |

*`src/lib/match/`*: matching: the index, embedding, ranking.

| File | What |
|---|---|
| `match.ts` | Loads the index and runs the ranker: `matchJournals`, `estimatePaperTopics`, filters. |
| `rank.ts` | The ranker the browser and the harness share — signals, fusion, calibration, explanations. Read this first. |
| `matchQuery.ts`, `topics.ts` | What is read from a paper for matching; its estimated topics. |
| `embed.ts` | Text → vector (browser-only: `@huggingface/transformers`). |
| `manifest.ts` | `loadManifest()` — fetches and caches `index/manifest.json`. |

*`src/lib/journals/`*: journal data and links.

| File | What |
|---|---|
| `journalRules.ts` | The hand-verified per-journal rules data (`JOURNAL_RULES`) + `findJournalRules()`. |
| `journalUrl.ts` | `shortId()`, `journalHref()`, `isPrerendered()` — the prerendered-link-vs-expand-button decision in one place. |
| `journalsServer.ts` | Node-only (build-time): reads the index off disk for `generateStaticParams()`/`journal/[id]`. Never import from `functions/` or client code. |

*`src/lib/checks/`*: the structural and journal-rules checks.

| File | What |
|---|---|
| `formatCheck.ts` | Heuristic structural checks (word count, abstract, required-statement detection) + `extractAbstract()`. |
| `rulesCheck.ts` | Checks extracted text against a specific journal's hand-verified rules. |

*`src/lib/review/`*: the AI review (client orchestration and the Function's gates).

| File | What |
|---|---|
| `review.ts` | Before anything is sent: `prepareForReview()` (strip + normalize), `MAX_REVIEW_CHARS`. |
| `reviewOrchestrator.ts` | Client: `runReview()`: plans the paper and the depth's sections (`planReview`), pays, runs the section passes (the first alone to write the cache, then 4 at a time) and the checklist, then the editor; retries, resume. |
| `reviewSections.ts` | Pure: `splitIntoSections()` (document headings first, word list as fallback), `chunkSections()` (subsections at thorough), `buildOutline()` (the user's outline edits). |
| `reviewTypes.ts` | The pass contract and `ReviewReport`, shared by the client and `functions/api/review.ts`. |
| `reviewPasses.ts` | The Function's gates: `parsePassRequest()` (exact keys, caps), `validateEditorOutput()` (ids it was shown), `passCallConfig()` and `upstreamBody()` (the shared cached prefix). |
| `reviewGrounding.ts` | `normalizeText()`, `locate()`, `groundSectionOutput()`, `groundChecklistOutput()`: the anti-fabrication check, imported by `functions/`. |
| `reviewPrompt.ts` | `TIER_PLAN`, `REVIEW_SYSTEM`, `paperBlock()`, the section, checklist and editor instructions, imported by `functions/`. |
| `reviewReport.ts` | Pure: `assembleReport()` (from ids: every finding once), `reportMarkdown()`, `parseKept()`. |
| `reviewKeep.ts` | `browserKeeper`: the last report in this browser. |
| `reviewLimits.ts` | The hard limits both sides share. |
| `reviewTool.ts` | The three strict tool schemas, listed together in every pass. |

*`src/lib/figures/`*: the figure studio (data, specs, the Pyodide worker, Ask Claude).

| File | What |
|---|---|
| `spreadsheet.ts` | `readWorkbook()`, `suggestPrepOptions()`, `prepareDataset()` (NA markers, strict `parseNumber()`, overrides, `reshapeWideToLong()`) → `Dataset` with `levels`. |
| `figureSpec.ts` | `FigureSpec` types, the strict `FIGURE_SPEC_SCHEMA`, `validateFigureSpec()`, `checkSpecAgainstColumns()`, `checkLabels()`, `scrubSpec()`, `mergeTextFields()`. Imported by `functions/`. |
| `figureSchema.ts` | The safety-critical file: `buildFigurePayload()` is the only function allowed to construct the outbound payload; `isValidFigurePayload()`. See "The figure generator" above. |
| `figurePrompt.ts` | The spec and hook system prompts, `SPEC_TOOL`/`HOOK_TOOL`, `buildFigurePrompt()`, `isCodeSafeToRun()` — imported by `functions/api/figure.ts`. |
| `figure.ts` | Client: `askClaude()` (re-checks everything returned, passes on the new balance), session-scoped consent. |
| `figureRunner.ts` | The worker lifecycle: `warmUp()`, `renderFigure()` (stale previews dropped), `exportFigure()`, `FigureRenderError`. Talks to `public/figureWorker.mjs`, which runs `public/figurelib.py`. |
| `figureTemplates.ts` | `loadFigureTemplates()`, `bindTemplate()` (remaps a template's roles to the user's columns by type). |

*`src/lib/write/`*: the LaTeX workspace (projects, the TeX engine, source helpers).

| File | What |
|---|---|
| `texEngine.ts` | The engine's R2 URL, release, files and data packs; `packsFor()`. |
| `texRunner.ts` | The TeX worker lifecycle: `compileProject()`, supersession, deadline, the all-packs retry. Talks to `public/texWorker.js`. |
| `texLog.ts` | `parseTexLog()` — errors, warnings and missing packages with file and line. |
| `projectStore.ts` | `/write` projects in the Origin Private File System (`ProjectMeta` carries the target journal's id and name, and `kind: "docx"` for a Word project); `importDocx` / `toDocx` (what's refused, a .dotx made a document); `autosaver()`; zip export/import (a Word project's backup comes back as one). |
| `docSaveState.ts` | What a Word project's editor has stored: the document the last stored save began from and whether an edit is unstored, since Folio's record of edits forgets those made while a save ran (selfchecked). |
| `texSource.ts` | Pure LaTeX-source helpers for the workspace: a rough word count, `.bib` keys and entries, labels, the outline, `\input`s and the paper's files, `findQuoteInTex`, the figure and table snippets, the next free figure path. |
| `templateCatalog.ts` | `loadTexTemplates()`, `templateForJournal()`, `starterProject()`. |
| `zip.ts` | `zipFiles()`, `unzipFiles()`, `flattenSingleRoot()` over fflate. |

*`src/lib/writing/`*: spelling, grammar and Rewrite, in both editors.

| File | What |
|---|---|
| `spelling.ts` | A paper's spelling settings (its English, or off, and its words), read from `project.json`. Pure. |
| `grammar.ts` | Harper in a Web Worker: `checkProse` over a paper's text, on the device. |
| `latexText.ts` | LaTeX as prose: `proseMask` for the checker; `toPassage` / `fromPassage` for Rewrite (non-prose as placeholders, and back). |
| `docText.ts` | A Word document as prose: `docProse` for the checker; `docPassage` / `applyDocRewrite` for Rewrite. |
| `rewrite.ts` | Rewrite's rules, shared by the Function and the browser: `parseRewriteRequest` (exact shape, caps, the price), `checkRewrite` (the answer against the passage), `rewriteWords`. |
| `rewritePrompt.ts` | What Claude is told: the system prompt, `buildRewritePrompt`, the strict tool. Imported by `functions/api/rewrite.ts`. |
| `rewriteClient.ts` | Client: `requestRewrite()`, the answer checked again before it's offered. |

*`src/lib/accounts/`*: accounts, M coins and payments (mostly server-side).

| File | What |
|---|---|
| `coins.ts` | The prices (`reviewPrice`, `FIGURE_PRICE`, `rewritePrice`, packs, Pro), `proCoinsLeft`, `dueProGrants`, email canonicalisation, ledger labels, and the two errors the client throws. Shared by client and server. |
| `auth.ts`, `safeNext.ts` | Server: sessions and cookies, Google claims and PKCE, account linking, rate limits, the Origin check; `safeNext` is shared with the sign-in pages. |
| `ledger.ts` | Server: the coin ledger's SQL: balance, debit, credit, welcome, the ticket sweep and pass claims, Pro grants, history. |
| `dailyCaps.ts` | The AI features' daily limits (service-wide and per account), counted in D1's `rate_limits`. |
| `paddle.ts` | Server: the webhook signature, price ids, what each event does to the ledger, and the portal and cancel calls. |
| `paddleCheckout.ts` | Client: Paddle.js loaded on demand, the checkout, the customer portal. |
| `notice.ts` | `NOTICE_VERSION`: the privacy notice's version, shown on /privacy and recorded on each new account. |
| `testD1.ts` | Selfchecks only: D1's API over `node:sqlite` with every migration applied. |

*`src/lib/access/`*: the closed beta (see CLAUDE.md, "The closed beta and the console").

| File | What |
|---|---|
| `beta.ts` | `BETA = { on, coins }`: the one switch. No imports, so the client and the Functions both read it. |
| `policy.ts` | `pageNeeds`, `apiNeeds` (public, approved or developer, any spelling of a path read as one), `routesJson()` (what `public/_routes.json` must be) and `PAGE_HEADERS` (the `/*` block of `public/_headers`, for gated pages). Pure. |
| `access.ts` | Server: the access list. `admitUser` (the only door to an account), `accessFor` (session and roles in one query), `addAccess`, `removeAccess` (never the last developer), `listAccess`, `developerIn`. |

*`src/lib/telemetry/`*: the activity log.

| File | What |
|---|---|
| `apiEvents.ts` | `logEvent` (one row per API request, metadata only), `purgeEvents` (30 days), `usageSink` (an AI call's tokens into the request's row). |

*`src/lib/admin/`*: the developer console's data.

| File | What |
|---|---|
| `stats.ts` | Server: the overview, AI usage by day, feature and person, the users table, the activity log's pages, and `aiCost` from `PRICES` ($ per million tokens). |

*`src/lib/ai/`*: the Anthropic transport the three AI Functions share.

| File | What |
|---|---|
| `anthropicStream.ts` | `callAnthropicTool()` — the selfchecked streaming transport (typed truncation/upstream errors), imported by `functions/`. |

*`src/lib/` (root)*: shared helpers.

| File | What |
|---|---|
| `site.ts` | Site-wide metadata (`SITE_TITLE`, `SITE_DESCRIPTION`, `BRAND` colors) — single source for `layout.tsx`, `opengraph-image.tsx`, `sitemap.ts`, `robots.ts`. |
| `errorMessage.ts` | `errorMessage(err, fallback?)` — the one shared `instanceof Error` normalization. |

**`src/types/n8ao.d.ts`**: type declarations for the ambient-occlusion pass the landing's desk uses.

**`functions/`** — Cloudflare Pages Functions; every file here is routed
as an endpoint, so shared logic lives in `src/lib/` instead (imported via
relative paths) and only genuinely server-specific code stays here.

| File | What |
|---|---|
| `api/review.ts` | One of the three AI Functions: a stateless dispatcher for the review's `extract`/`synthesize` passes — body-size guard, `parsePassRequest`, the daily pass limits (`dailyCaps.ts`: 1,500 a day in all, 150 per account), one `callAnthropicTool`, grounding/validation. |
| `_middleware.ts` | The beta's page gate, on every request but the static assets (`public/_routes.json`): sign-in for the signed out, a refusal for the uninvited, `/admin` for developers only, every spelling of a path read as one; the pages it serves get the `_headers` security headers. |
| `api/_middleware.ts` | Old deployments refused, the Origin check on every non-GET (not the Paddle webhook), the beta's API gate, `Cache-Control: no-store`, housekeeping, and the activity log row after each answer. |
| `api/admin/*` | The console: `stats`, `users` (and coin grants), `access` (the lists), `events` (the log). Developers only. |
| `api/me.ts`, `api/account.ts` | Who's signed in, the balance, Pro, Paddle's public config; the account page's data, the export, deletion. |
| `api/auth/google/*`, `api/auth/email/*`, `api/auth/logout.ts` | Signing in and out. |
| `api/review/start.ts` | Charges a review and issues its ticket. |
| `api/pay/webhook.ts`, `api/pay/portal.ts` | Paddle's events; the customer-portal link. |
| `api/figure.ts` | The second AI Function: body-size guard, `isValidFigurePayload`, the daily limits (`dailyCaps.ts`), one `callAnthropicTool` with a strict tool, then the output gates (`validateFigureSpec`, `checkSpecAgainstColumns`, `checkLabels`, or the hook denylist). |
| `api/rewrite.ts` | The third AI Function: body-size guard, `parseRewriteRequest`, the daily limits (`dailyCaps.ts`), the debit, one `callAnthropicTool` with a strict tool and one more try if `checkRewrite` refuses the answer, a refund whenever no checked answer goes out. |

## `lib/` conventions

- **One folder per feature** (`paper/`, `match/`, `journals/`, `checks/`,
  `review/`, `figures/`, `write/`, `writing/`, `accounts/`, `ai/`, `access/`,
  `telemetry/`, `admin/`), with only the
  genuinely shared helpers (`errorMessage.ts`, `site.ts`) at
  the root. Files keep their full names (`reviewPrompt.ts`, not
  `review/prompt.ts`) so a name means the same thing in a search, a stack
  trace and these docs. Cross-feature imports are fine and expected
  (`formatCheck.ts` serves matching and the review alike); a file sits in
  the folder of the feature it mainly belongs to.
- **camelCase filenames** (`journalUrl.ts`, not `journal-url.ts`) —
  consistent with `components/`'s PascalCase, one casing convention for
  the whole `src/` tree.
- **Import extensions**: a relative import inside `lib/` carries `.ts`
  (`from "./zip.ts"`), because Node's native TS execution (every
  `*.selfcheck.ts`, see `package.json`'s `test` script) needs the real path
  with its extension and knows nothing of the `@/` alias. A `@/`-alias
  import, which only the bundler sees, leaves the extension off
  (`from "@/lib/write/zip"`); that half is a convention, kept for
  consistency (`tsconfig.json` would accept either).
- **`functions/` may only import `src/lib/` modules that are pure or
  isomorphic** — no `window`, `localStorage`, or `fs`. See "The invariant
  that keeps `src/lib/` and `functions/` from duplicating types" above.

## Read these five files first

If you're new to this codebase, in this order:

1. `CLAUDE.md` — the three privacy rules everything else follows.
2. `src/lib/match/rank.ts` — the ranker (with `match.ts` loading the index).
3. `pipeline/build_index.py` — how the static index those rankings run
   against gets built.
4. `functions/api/review.ts` — one of the three exceptions to "nothing
   leaves the browser," and why it's built the way it is (see above).
   `functions/api/figure.ts` and `functions/api/rewrite.ts` are the
   other, narrower ones.
5. `src/app/page.tsx` and `src/app/_landing/` — the homepage. One scroll-driven
   narrative split into one file per section; `useScrollProgress.ts` is
   the single source of every value the sections animate against.
