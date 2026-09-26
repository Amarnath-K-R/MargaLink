# Architecture

Why MargaLink is built the way it is — not a tour of the code (the code and
its own comments are the tour), but the decisions that aren't obvious just
from reading a single file.

## The core decision: no server for matching

The original plan (`journal-finder-plan.md`) called for a server that
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
   text, embed, estimate topics, read the reference list, rank — locally.
   `src/lib/rank.ts` is the whole ranker: no network round-trip carries
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

Design and plan: `docs/superpowers/specs/2026-09-24-matching-v2-design.md`,
`docs/superpowers/plans/2026-09-24-matching-v2.md`.

- **What is read** (`matchQuery.ts`): the title, the real abstract
  (`formatCheck.extractAbstract`), keywords and the reference list — not the
  first 3,000 characters, which for most PDFs is authors and affiliations.
  The page shows it ("What we read") with a paste box to correct it, and
  pasted text is a first-class entry for phones.
- **Journals** are 1–4 centres each (k-means over their recent papers,
  `pipeline/kmeans.py`), so a broad journal is several clusters rather than
  one average that matches none; a journal scores by its closest centre.
- **Four signals** (`rank.ts`): embedding similarity; overlap between the
  paper's estimated OpenAlex topics (`topics.ts`) and the journal's recent
  topic profile; how often the paper's own reference list cites the journal
  (`references.ts` — a name counts only where a journal name sits in a
  reference, so "Science" in a title doesn't); a small activity prior. The
  top 200 by embedding plus every cited journal are scored.
- **Weights and the fit scale are measured, not chosen.** `build_index.py`
  holds back each journal's newest papers (never indexed);
  `web/scripts/eval_match.ts` runs `rank.ts` itself over them, reports a
  ladder (today → multi-centre → + topics → + references), fits the weights
  on one half and the fit scale on the other, and writes both with the
  accuracy into the manifest. "Fit 78" means the match is as close as 78% of
  real paper→journal pairings; an unfitted build shows raw similarity, no
  percentages. A drift guard checks that `rank.ts` reproduces the pipeline's
  own integer ranking exactly.
- **Hygiene:** journals whose papers don't cohere or don't match their
  field are dropped at build time (`pipeline/quality.py`, reasons in
  `pipeline/data/dropped.txt`).

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
limit. `src/lib/embed.ts` already points `onnxruntime-web` at a CDN copy
instead of a local one for exactly this reason (see its comment); the
`rm -f` in the deploy script is a defensive second layer in case Next's
bundler still copies a local copy into the export regardless.

The exceptions to "no backend": two Cloudflare Pages Functions,
`web/functions/api/review.ts` and `web/functions/api/figure.ts`. Both
exist only because their feature needs somewhere to hold the Anthropic
API key that the browser must never see — see `CLAUDE.md`'s "two
disclosed exceptions." Everything else in `web/` is static files served
from Cloudflare's edge, no server involved.

### The AI review: what it defends against, and why

A real manuscript fact-check against an early version of this feature
turned up three failure modes that still shape it: (1) the model
attributed numbers to the abstract that only appeared in Results — so the
abstract is handed over as its own labeled block, never inferred; (2) it
flagged "inconsistencies" that reconciled once the arithmetic was checked
— so the prompts require reconciliation before a finding is reported; (3)
a model can state a quote confidently that appears nowhere in the source —
so every quote is verified server-side, never trusted.

The first implementation was one synchronous call over the whole paper.
It broke in three ways on real, long papers: extended thinking and the
final JSON share one `max_tokens` budget, so a table-heavy paper ended
with `stop_reason: max_tokens` and no result at all; the text was silently
truncated past 150k characters; and one dropped stream lost everything.

**The review is now a map-reduce over the paper, orchestrated by the
browser** (`src/lib/reviewOrchestrator.ts`):

1. `review.ts`'s `prepareForReview` strips author lines and normalizes the
   text (NFKC, ligatures, line-end hyphenation, curly quotes) once,
   client-side, so the model's verbatim quotes come back in the same
   alphabet the grounding check reads. `reviewSections.ts` splits it into
   headed sections and ≤16k-character chunks. **Headings come from the
   document itself where it has them** (`headingHints.ts`): Word heading
   styles from a DOCX, and for a PDF the embedded font data — a heading is a
   short line in a non-body font that is followed by body text, used more
   than once (this separates real headings from figure labels, table headers
   and bold reference fragments; the level-1 style is the one carrying
   Methods/Results/…). A document heading that isn't a standard one
   ("Wave III: Hard Clinical Outcomes") becomes its own section of kind
   `body`, reviewed at every depth, instead of being swallowed by the
   previous section. Without such structure, a conservative word list takes
   over (letter-spaced "R E F E R E N C E S" recognized; a wrapped lowercase
   "methods" line is not a heading). Before consent the user sees the
   detected outline and can correct it — change a section's type, merge it
   into the previous one, add a heading by its exact text, or mark it
   "Don't send", which keeps it out of every request and out of the section
   map (`buildOutline`). Papers over 400,000 characters are refused before
   consent — never truncated.
2. One **extract** pass per chunk (≤3 concurrent, effort `medium` on every
   tier — it's mechanical) returns a bounded list of quantitative claims,
   each with a verbatim quote that `reviewGrounding.ts`'s
   `groundExtractOutput` verifies against *that chunk only*. Output is
   small and capped, so a pass can't run out of budget the way the single
   call did; if one still truncates (422), it is retried once asking for
   half as many claims. A pass that keeps failing is recorded in
   `coverage.failed` — not fatal: synthesis runs on what succeeded, the
   page says which section couldn't be checked, and "Retry failed
   sections" re-runs only those plus synthesis (no second device use).
3. One **synthesize** pass over the resulting **claims ledger** — never the
   paper text — finds inconsistencies label by label and writes the
   prioritized "Fix these first" summary. It can only cite ledger ids;
   `reviewPasses.ts` drops any id not in the submitted ledger and any
   inconsistency left with fewer than two. A fabricated cross-reference
   therefore cannot survive: every citation the user sees was verified in
   the chunk it came from. (A separate draft-then-verify second call was
   tried before this redesign and dropped for re-sending the whole paper;
   the ledger gets the same guarantee without that cost.)

`functions/api/review.ts` is a thin, stateless dispatcher on `pass`: it
validates exact key sets and caps (`parsePassRequest`), applies the daily
*pass* cap (`review-pass-count:${date}`, 1,500, incremented before the
upstream call so client retries can't spend uncounted), calls Anthropic
through the selfchecked `anthropicStream.ts` (streaming, because long
non-streaming requests with thinking hit 524s at Anthropic's edge), and
grounds/validates the output. It never holds paper text between
requests. No prompt caching is used; Anthropic retains API data only
under its own API data policy, and MargaLink itself stores nothing.

Tiers (`TIER_PLAN` in `reviewPrompt.ts`) decide which section kinds are
extracted (quick: abstract/results/discussion; standard: everything but
references and supplementary material; thorough: everything but
references), the claims cap per chunk (20/30/40) and the synthesis effort
(low/medium/high). Verification rigor is identical at every tier. `max`
effort stays off-limits: it was confirmed to be effectively unbounded in
cost and time on a real paper. Measured on three real papers (39k–103k
characters) across all tiers: every review completed with no failed
section, costing $0.12–0.32 and taking 41–142 s. Projected for a
400k-character paper on thorough: about $1.2 typical, $1.7 if every chunk
is table-dense; the knobs are `CHUNK_CHARS` and the thorough claims cap.

### The figure generator: what leaves the device, and what doesn't

`/figures` is a figure *studio*, and almost all of it is local. A
researcher's raw spreadsheet is individual-level data, more sensitive than
a manuscript draft, so the design splits **language** from **drawing**:

- A declarative **`FigureSpec`** (`src/lib/figureSpec.ts`) — panels ×
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

`src/lib/figureSchema.ts` is this feature's `reviewGrounding.ts`:
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
(`lockNetwork`). `scripts/check_figure_sandbox.mjs` posts tweaks straight
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
exports are free and unlimited; 5 Claude calls per device, 200 per day
globally (`figure-count:<date>` in `FIGURES_KV`).

One honest caveat: `useNetworkTrace()` patches `fetch` on the main thread.
The worker's fetches (Pyodide from jsDelivr, `figurelib.py`, fonts) happen
off the main thread, so they don't appear in the page's trace panel. They
are bodyless GETs for public, versioned assets — never anything from the
dataset — but the panel's completeness guarantee doesn't extend there,
and `/figures` doesn't claim it does.

### The writing workspace: LaTeX in the browser

`/write` is a single-author LaTeX workspace: start from a journal's
template (or import a zip), edit in CodeMirror, compile to PDF, back up
as a zip. No server, no AI.

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
  small scripts come from the HTTP cache. `scripts/publish_busytex.sh` uploads only an allowlist of
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

`/write`'s trace panel covers the page's own fetches (template files);
the engine is fetched by the worker, like `/figures`' runtime.

## The invariant that keeps `src/lib/` and `functions/` from duplicating types

`functions/api/review.ts` already imports directly from `src/lib/`
(`journalRules.ts`, `reviewPasses.ts`, `reviewGrounding.ts`,
`anthropicStream.ts`) via relative paths — there's no Workers-runtime barrier stopping it. The rule that
makes this safe: **`functions/` may import from `src/lib/` only modules
that are pure or isomorphic** — no `window`, no `localStorage`, no `fs`.
Most of `src/lib/` qualifies; a handful of browser-only modules
(`embed.ts`, `extract.ts`) and one Node-only module (`journalsServer.ts`,
used at build time) don't, and should never be imported from `functions/`.

`src/lib/reviewTypes.ts` is the cleanest example: it's the one file both
the client (`reviewOrchestrator.ts` and its consumers) and
`functions/api/review.ts` (via `reviewPasses.ts`) take the pass contract
— `ExtractRequest`/`SynthesizeRequest`/their responses, `ReviewResult` — from, instead
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
| `page.tsx` | Homepage shell — assembles the `_home/` sections in one tree, no context provider. |
| `globals.css` | Site-wide only: tokens, reset, reduced-motion. Everything homepage-specific lives in `_home/home.css`. |
| `opengraph-image.tsx` | OG image, rendered with `satori` — can't resolve CSS custom properties, so `lib/site.ts`'s `BRAND` colors are duplicated here as literal hex, deliberately. |
| `robots.ts`, `sitemap.ts` | SEO. |
| `privacy/page.tsx` | Static prose + the privacy-flow SVG diagram. |
| `journal/[id]/page.tsx` | Static-generated per-journal page (`generateStaticParams` from `getPrerenderedJournals()`). |
| `journals/page.tsx`, `journals/layout.tsx` | Browse/search/filter the full journal index. |
| `match/page.tsx` | Orchestrates read → embed → topics → references → rank. `process()` stays here rather than moving to `lib/`: it interleaves ~8 `setState` calls with async steps, and the out-of-order-result guard (`matchSeq`) has to move with that state, not get separated from it. |
| `match/_components/MatchFilters.tsx` | The 5 filter controls + `FEE_PRESETS`/`SPEED_PRESETS`. |
| `match/_components/MatchResults.tsx` | The results list with fit badges, built on the shared `JournalResultTitle`/`JournalResultChips`. |
| `match/_components/PaperInput.tsx`, `WhatWeRead.tsx`, `WhyThisJournal.tsx` | File-or-paste entry; what the matcher read (with a paste correction); the per-result reasons. |
| `match/_components/FormatCheckPanel.tsx` | The 9-row structural-check `<dl>`. |
| `match/_components/ProcessingTrace.tsx` | The live "On this device" step log + error text. |
| `match/layout.tsx` | Route metadata shim. |
| `review/page.tsx` | Orchestrates upload → journal pick → structural check → AI review consent/request. |
| `review/_components/JournalPicker.tsx` | The hand-verified-journal grid. |
| `review/_components/TierPicker.tsx` | The quick/standard/thorough grid; owns `TIER_OPTIONS`. |
| `review/_components/OutlineEditor.tsx` | The detected outline before consent: per-section type, merge, add heading, "Don't send". |
| `review/layout.tsx` | Route metadata shim. |
| `figures/page.tsx` | The studio: upload → data prep → Describe/Gallery → panel editor → live local preview → export. Owns the spec, the debounced render loop and recipes. |
| `figures/_components/DataPrep.tsx` | Sheet, header row, number format, missing-value markers, per-column types, wide→long, the parsed preview table. |
| `figures/_components/Describe.tsx` | The request box, Ask Claude (spec) / custom tweak (hook), the labels opt-in, the live `[data-testid="figure-payload"]` preview. |
| `figures/_components/Gallery.tsx` | Template thumbnails; picking one calls `bindTemplate`. |
| `figures/_components/PanelEditor.tsx`, `StyleBar.tsx` | Per-panel controls (family, roles, axes, summary, order, overlays, statistics, annotations) and whole-figure style/size/palette/grid. |
| `figures/_components/FigurePreview.tsx`, `ExportBar.tsx`, `RecipeImportExport.tsx` | The live image with local-only error details and test results; PNG/TIFF/SVG/PDF export; recipe save/load. |
| `figures/layout.tsx` | Route metadata shim. |
| `figures/_components/AddToPaper.tsx` | Puts the figure as a PDF into a `/write` project's `figures/` and copies the LaTeX. |
| `write/page.tsx` | Project list, template picker, zip import; `?journal=` preselects a template. |
| `write/_components/Workspace.tsx` | One open project: file tree, editor, compile, PDF, diagnostics, backup. |
| `write/_components/LatexEditor.tsx`, `FileTree.tsx`, `PdfPane.tsx`, `Diagnostics.tsx`, `TemplatePicker.tsx`, `StorageBanner.tsx`, `download.ts` | The workspace's pieces. |
| `write/layout.tsx` | Route metadata shim. |

**`src/app/_home/`** — homepage-only, a Next "private folder" (excluded
from routing; nothing outside `app/page.tsx` imports from it).

| File | What |
|---|---|
| `home.css` | The ~87% of the old single `globals.css` that's homepage-only. |
| `useScrollProgress.ts` | The one rAF-throttled scroll listener: hero progress, the closing section's progress (the landing crossfades into it), overall page progress for the 3D paper, and the reduced-motion query. |
| `motion.ts` | `localProgress`, `stagger`, `motionStyle`, `countUp`, `decodeText` — the homepage's own animation-math kit (builds on `lib/easing.ts`'s `between`). |
| `SiteHeader.tsx`, `HeroSection.tsx`, `FinalSection.tsx`, `TypedPaper.tsx`, `ToolsOverlay.tsx` | The homepage is two screens: the landing (`HeroSection` — the wordmark with the Link cutout, "Find your path.", over the clay desk) and the closing call to action (`FinalSection`), which the landing crossfades into; its right column holds the desk's self-writing 3D paper (on phones, `TypedPaper`, the same manuscript as an HTML page). The middle sections (workflow, journals, matching, review, privacy) were removed on 2026-09-26. |

**`src/components/`** — shared across routes.

| File | What |
|---|---|
| `PageHeader.tsx` | The brand/nav/title header shared by every non-homepage route; 3 content-width tiers. |
| `NetworkTrace.tsx` | `useNetworkTrace()` + `<NetworkTracePanel>` — the fetch-instrumentation that makes `/match` and `/review`'s privacy claims checkable on the page itself. |
| `JournalResultRow.tsx` | `JournalResultTitle` (prerendered-link-vs-expand-button) + `JournalResultChips` (metadata chips), shared by `/journals` and `/match`. |
| `ErrorText.tsx` | The one `role="alert"` error paragraph. |
| `IntroSequence.tsx` | The first-visit intro: a transparent layer over the landing (the question, then the landing's own wordmark builds, then the desk settles) — timing, dismissal, `sessionStorage` memory. |
| `ClayDesk.tsx` | Thin shell over `components/three/clayDesk.ts`: the landing's desk. It plays the intro (held floating while `.intro-overlay` is up, then settling), and on scroll morphs: every object leaves the frame, the paper stack rises, faces the camera and settles right, then writes itself in place — its top sheet is a canvas texture laid out as the manuscript (`three/paperText.ts`), placeholder bars replaced by text as it types. `_home/TypedPaper.tsx` is the phone version. |
| `JournalDetail.tsx`, `PaperDropzone.tsx`, `RulesCheckPanel.tsx`, `ReviewConsent.tsx`, `ReviewResultPanel.tsx`, `CheckRow.tsx`, `FigureConsent.tsx` | Single-purpose presentational pieces. `PaperDropzone.tsx` takes optional `accept`/`title`/`hint`/`ariaLabel` props (defaulting to its original PDF/DOCX copy) so `/figures` reuses it for CSV/XLSX instead of a second dropzone component. `FigureConsent.tsx` is a deliberately separate sibling of `ReviewConsent.tsx`, not a shared generalization — see `CLAUDE.md`'s exceptions paragraph for why each consent notice stays independently readable. |

**`src/components/three/`** — the one domain subfolder in `components/`
(see "Design decisions" in the reorg plan for why: 5 files sharing one
real technical concern, not a speculative grouping).

| File | What |
|---|---|
| `useThreeCanvas.ts` | The setup/cleanup preamble shared by both scenes — mounting, the WebGL try/catch, resize, the rAF loop, teardown. |
| `clayDesk.ts` | The landing's clay-render desk, built in code (pencil, ruler, graph paper, sheets, chart, notebook, paper plane, the dashed path to a pin): rounded geometry, one matte palette-tinted material, RoomEnvironment + soft VSM shadows on a shadow-only ground. `LANDING_DESK` / `LANDING_DESK_NARROW` place it. Rendered by `components/ClayDesk.tsx` through N8AO ambient occlusion. On wider screens the camera pans down the desk with the page's scroll and holds while a sticky section is pinned: the closing section (its paper stands up, gets a pin and writes itself — finished by the end of the hold) and then the tools book (camera tips to look down while the pages turn, then a pin drops onto it). The dashed path runs landing pin → paper pin → book pin. |
| `book.ts` | The open clay book: board, page blocks, two static page faces and two turning leaves whose vertices are laid along a bending curve each frame (corner lifts first, lands last; front/back textures, the back mirrored). `setProgress(hp, still)` turns them by the book's pinned scroll; `still` (reduced motion) snaps. |
| `bookPages.ts` | Draws one book page on a canvas: heading pages (tool, heading with the teal cutout, one line) and simple illustrations (review, write, figures). |
| `bookSpreads.ts` | The book's content — one spread per tool — and its scroll timing (tilt, turns, pin), shared by the 3D book and the page's caption so they always agree. |

**`src/lib/`** — framework-agnostic logic, deliberately kept flat (see
"lib/ conventions" below).

| File | What |
|---|---|
| `match.ts` | Loads the index and runs the ranker: `matchJournals`, `estimatePaperTopics`, `loadNameIndex`, filters. |
| `rank.ts` | The ranker the browser and the harness share — signals, fusion, calibration, explanations. Read this first. |
| `matchQuery.ts`, `references.ts`, `topics.ts` | What is read from a paper; its reference list → cited journals; its estimated topics. |
| `extract.ts` | PDF/DOCX → text (browser-only: uses `pdfjs-dist`/`mammoth`); with `{ headings: true }` (the review only) also the document's heading structure. |
| `embed.ts` | Text → vector (browser-only: `@huggingface/transformers`). |
| `formatCheck.ts` | Heuristic structural checks (word count, abstract, required-statement detection) + `extractAbstract()`. |
| `rulesCheck.ts` | Checks extracted text against a specific journal's hand-verified rules. |
| `journalRules.ts` | The hand-verified per-journal rules data (`JOURNAL_RULES`) + `findJournalRules()`. |
| `journalUrl.ts` | `shortId()`, `journalHref()`, `isPrerendered()` — the prerendered-link-vs-expand-button decision in one place. |
| `journalsServer.ts` | Node-only (build-time): reads the index off disk for `generateStaticParams()`/`journal/[id]`. Never import from `functions/` or client code. |
| `manifest.ts` | `loadManifest()` — fetches and caches `index/manifest.json`. |
| `site.ts` | Site-wide metadata (`SITE_TITLE`, `SITE_DESCRIPTION`, `BRAND` colors) — single source for `layout.tsx`, `opengraph-image.tsx`, `sitemap.ts`, `robots.ts`. |
| `easing.ts` | `clamp01`, `smooth`, `between`, `lerp` — the one shared animation-math kit (was reimplemented 3× before Phase 5). |
| `errorMessage.ts` | `errorMessage(err, fallback?)` — the one shared `instanceof Error` normalization. |
| `review.ts` | Before anything is sent: `prepareForReview()` (strip + normalize), `MAX_REVIEW_CHARS`, the per-device usage counter. |
| `reviewOrchestrator.ts` | Client: `runReview()` — plans chunks, runs extract passes (≤3 concurrent, retries, resume), builds the claims ledger, runs synthesis, assembles `ReviewResult` with `coverage`. |
| `reviewSections.ts` | Pure: `splitIntoSections()` (document headings first, word list as fallback), `chunkSections()`, `buildPaperMap()`, `buildOutline()` (the user's outline edits). |
| `headingHints.ts` | Pure: the document's own heading structure — `pickPdfHeadings()` from per-line font data, `pickDocxHeadings()` from Word heading styles. |
| `reviewTypes.ts` | The pass contract and `ReviewResult` — shared by the client and `functions/api/review.ts`. |
| `reviewPasses.ts` | The Function's gates: `parsePassRequest()` (exact keys, caps), `validateSynthesisOutput()` (ledger-id membership), `passCallConfig()`. |
| `reviewGrounding.ts` | `normalizeText()`, `groundExtractOutput()` — the anti-fabrication check, imported by `functions/`. |
| `reviewPrompt.ts` | `TIER_PLAN`, `buildExtractPrompt()`, `buildSynthesizePrompt()` — imported by `functions/`. |
| `reviewTool.ts` | The two strict tool schemas + drift guards — imported by `functions/`. |
| `anthropicStream.ts` | `callAnthropicTool()` — the selfchecked streaming transport (typed truncation/upstream errors), imported by `functions/`. |
| `spreadsheet.ts` | `readWorkbook()`, `suggestPrepOptions()`, `prepareDataset()` (NA markers, strict `parseNumber()`, overrides, `reshapeWideToLong()`) → `Dataset` with `levels`. |
| `figureSpec.ts` | `FigureSpec` types, the strict `FIGURE_SPEC_SCHEMA`, `validateFigureSpec()`, `checkSpecAgainstColumns()`, `checkLabels()`, `scrubSpec()`, `mergeTextFields()`. Imported by `functions/`. |
| `figureSchema.ts` | The safety-critical file: `buildFigurePayload()` is the only function allowed to construct the outbound payload; `isValidFigurePayload()`. See "The figure generator" above. |
| `figurePrompt.ts` | The spec and hook system prompts, `SPEC_TOOL`/`HOOK_TOOL`, `buildFigurePrompt()`, `isCodeSafeToRun()` — imported by `functions/api/figure.ts`. |
| `figure.ts` | Client: `askClaude()` (re-checks everything returned), the per-device usage counter, session-scoped consent. |
| `figureRunner.ts` | The worker lifecycle: `warmUp()`, `renderFigure()` (stale previews dropped), `exportFigure()`, `FigureRenderError`. Talks to `public/figureWorker.mjs`, which runs `public/figurelib.py`. |
| `figureTemplates.ts` | `loadTemplates()`, `bindTemplate()` (remaps a template's roles to the user's columns by type). |
| `texEngine.ts` | The engine's R2 URL, release, files and data packs; `packsFor()`. |
| `texRunner.ts` | The TeX worker lifecycle: `compileProject()`, supersession, deadline, the all-packs retry. Talks to `public/texWorker.js`. |
| `texLog.ts` | `parseTexLog()` — errors, warnings and missing packages with file and line. |
| `projectStore.ts` | `/write` projects in the Origin Private File System; `autosaver()`; zip export/import. |
| `templateCatalog.ts` | `loadTemplates()`, `templateForJournal()`, `starterProject()`. |
| `zip.ts` | `zipFiles()`, `unzipFiles()`, `flattenSingleRoot()` over fflate. |

**`functions/`** — Cloudflare Pages Functions; every file here is routed
as an endpoint, so shared logic lives in `src/lib/` instead (imported via
relative paths) and only genuinely server-specific code stays here.

| File | What |
|---|---|
| `api/review.ts` | One of the two server-side files in the project: a stateless dispatcher for the review's `extract`/`synthesize` passes — body-size guard, `parsePassRequest`, the KV daily pass cap, one `callAnthropicTool`, grounding/validation. |
| `api/figure.ts` | The other: body-size guard, `isValidFigurePayload`, the KV daily cap, one `callAnthropicTool` with a strict tool, then the output gates (`validateFigureSpec`, `checkSpecAgainstColumns`, `checkLabels`, or the hook denylist). |

## `lib/` conventions

- **Flat, not domain-folders.** The dependency graph doesn't support it:
  `formatCheck.ts` serves both a "format" concern and a "review" concern;
  `journalUrl.ts` serves journals, match, and the sitemap. Domain folders
  would strand files in a `shared/` bucket for no comprehension gain at
  this file count. Revisit if `lib/` crosses ~30 files — the figure
  generator's files (`spreadsheet.ts`, `figureSpec.ts`, `figureSchema.ts`,
  `figurePrompt.ts`, `figure.ts`, `figureRunner.ts`, `figureTemplates.ts`) cross that number,
  but the recommendation is to stay flat anyway: the `figure*` filename
  prefix is already doing the grouping work a folder would, and carving
  out `lib/figure/` while everything else stays flat buys inconsistency,
  not clarity. The multi-pass review redesign was the next feature, and
  the decision held: the `review*` prefix groups its files, and a
  `lib/review/` folder would be churn without a comprehension gain.
- **camelCase filenames** (`journalUrl.ts`, not `journal-url.ts`) —
  consistent with `components/`'s PascalCase, one casing convention for
  the whole `src/` tree.
- **Import extensions**: a relative lib-to-lib import carries `.ts`
  (`from "./easing.ts"`); a `@/`-alias import doesn't
  (`from "@/lib/easing"`). This isn't stylistic — Node's native TS
  execution (used by every `*.selfcheck.ts`, see `package.json`'s `test`
  script) needs the real relative path with its extension; the bundler
  only resolves the `@/` alias, and errors just as reliably on a stray
  `.ts` extension there.
- **`functions/` may only import `src/lib/` modules that are pure or
  isomorphic** — no `window`, `localStorage`, or `fs`. See "The invariant
  that keeps `src/lib/` and `functions/` from duplicating types" above.

## Read these five files first

If you're new to this codebase, in this order:

1. `CLAUDE.md` — the three privacy rules everything else follows.
2. `src/lib/rank.ts` — the ranker (with `match.ts` loading the index).
3. `pipeline/build_index.py` — how the static index those rankings run
   against gets built.
4. `functions/api/review.ts` — one of the two exceptions to "nothing
   leaves the browser," and why it's built the way it is (see above).
   `functions/api/figure.ts` is the other, narrower one.
5. `src/app/page.tsx` and `src/app/_home/` — the homepage. One scroll-driven
   narrative split into one file per section; `useScrollProgress.ts` is
   the single source of every value the sections animate against.
