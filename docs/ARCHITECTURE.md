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
   text, embed, estimate topics, read the reference list, rank — locally.
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
  top 200 by embedding plus every cited journal are scored. A journal's
  names include NLM's standard abbreviations for its ISSNs ("J Am Coll
  Cardiol", `pipeline/fetch_nlm_abbrevs.py`), since medical reference lists
  use those rather than full titles: 12,356 journals have one.
- **Weights and the fit scale are measured, not chosen.** `build_index.py`
  holds back each journal's newest papers (never indexed);
  `web/scripts/eval/eval_match.ts` runs `rank.ts` itself over them, reports a
  ladder (today → multi-centre → + topics → + references), fits the weights
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
- **Reference names** must start where a journal name starts in a
  reference, right after the title, as well as be followed by a year or
  volume (`references.ts`). Without the left edge, NLM abbreviations (built
  from parts) credited an unindexed journal's citation to an indexed one
  whose abbreviation it ends in ("Acta Belg Med Phys" to Medical Physics).
  On one synthetic Vancouver citation per MEDLINE journal: 12,750 of 13,548
  indexed journals credited correctly, 1 to the wrong one, and 132 of
  24,512 unindexed journals credited to some indexed one.

**Measured (2026-09-29, 18,965 journals, 54,369 centres).** The held-out
set is each journal's newest papers, never indexed (347,619); the harness
scores a seeded sample of 5,345 of them, which always includes the 351 with
a resolved reference list. The real journal's rank:

| Configuration | top 1 | top 5 | top 10 |
|---|---|---|---|
| One averaged vector per journal (v1), whole sample | 12.6% | 30.0% | 40.5% |
| Multi-centre, whole sample | 12.7% | 29.4% | 40.0% |
| Fitted (emb 1, topic 0.02, ref 0.05), unseen half | 13.3% | 30.3% | 40.3% |
| Same weights, references off (content alone), unseen half | 13.1% | 29.8% | 39.8% |
| Papers with a resolved reference list (351): no references | 11.7% | 25.9% | 38.5% |
| Same papers, references at 0.03 | 15.4% | 38.7% | 48.4% |

On 18,965 journals, content alone finds the real one in the top 10 for
about 4 papers in 10. Multi-centre and the topic signal don't beat one
averaged vector on this measure (the differences are within noise); they're
kept for what they explain (a result's closest cluster and shared topics).
The paper's own reference list adds about 10 points, measured with
references resolved perfectly through OpenAlex: parsing a real PDF's list
finds fewer, so that gain is an upper bound. The top result's field is
right about 58% of the time either way. Real PDFs: IJBNPA #1, J Clin Sleep
Med #2; a heart failure paper in JACC ranks heart failure journals and the
journals it cites most (Int J Cardiol, J Card Fail) above JACC.

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
`web/functions/api/`. Two, `review.ts` and `figure.ts`, exist because
their feature needs somewhere to hold the Anthropic API key that the
browser must never see — see `CLAUDE.md`'s "two disclosed exceptions."
The rest run accounts, M coins and payments (see "Accounts, M coins and
payments" below) on a D1 database; none of them ever receives anything
from a paper. Everything else in `web/` is static files served from
Cloudflare's edge.

Deploying needs, beyond `ANTHROPIC_API_KEY`:
the D1 databases created and their ids in `wrangler.toml` (production and
`[env.preview]`), `wrangler d1 migrations apply margalink --remote` after
every new migration, and the account secrets listed in `CLAUDE.md`.

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
browser** (`src/lib/review/reviewOrchestrator.ts`):

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

### The writing workspace: LaTeX in the browser

`/write` is a single-author LaTeX workspace: start from a journal's
template (or import a zip), edit in CodeMirror, compile to PDF, back up
as a zip. No server; no AI in the editor. It is also the hub: the other
tools open as windows over it (see **Windows** below).

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
  when asked for. Tool state lives in hooks mounted by `Workspace`
  (`useMatch`, `useReview`, `useFigures` — the same hooks the standalone
  pages render — plus `useChecks`), so closing a window keeps its
  results and a running review carries on (the status bar shows it).
  `Workspace` is keyed by project id so nothing leaks between projects.
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
- **Figures.** "Insert into paper" writes the 300 dpi PDF and a data-free
  recipe (`figures/<name>.figure.json`, the same shape `RecipeImportExport`
  saves) into the project and drops a figure block at the cursor; opening
  the recipe offers "Edit in the figure studio". Pyodide loads only once a
  spreadsheet is attached; Insert waits for a running compile, so the two
  peak-memory jobs don't overlap.
- **URL.** `/write?p=<id>` reopens a project (a reload, or the figure
  studio's link); `/write?journal=<id>` (from a match result or a journal
  page) preselects a template for a new one.

Nothing in the workspace shows a network trace any more (the tool pages
lost theirs too); the status line says whether a request carried text
you agreed to send (a review or Ask Claude).

### Accounts, M coins and payments

The two AI features cost real money per run (a review ~$0.12–0.32, up to
~$1.7 for a 400k-character thorough one; an Ask Claude call ~$0.03), so
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

**Paying for a review.** `POST /api/review/start` receives the planned
sections' ids and lengths, never text; prices them with `reviewPrice`
(the same function the consent quotes); checks today's capacity; and, in
one batch, debits and creates a ticket bound to the tier, those sections
and lengths, for two hours. Every pass sends `X-Review-Ticket`;
`review.ts` spends one of it (`claimReviewPass`) before calling Claude, so
nothing unpaid reaches the API: a section that already came back is
refused (409), each section gets at most four tries (`TRIES_PER_SECTION`,
counted in the same statement that checks them, in the ticket's `passes`),
the cross-check runs once, and none starts within five minutes of the
ticket's end, so a pass can't outlive it. That binds what a ticket buys to
what it cost: Claude reads each paid section at most four times. Each
section that comes back is recorded (`review_deliveries`), as is a
synthesis. When the ticket expires, `sweepTickets` refunds the share it
didn't deliver, rounded up: sections weigh by their length and the
cross-check like an average section, so padding a review with tiny
sections buys nothing, and a client that takes every section and skips the
cross-check still pays for what it got. Resume and
Retry reuse the ticket: a review is paid for once. A pass refused for
today's capacity is refused before it spends one of the ticket's. A
cancel pressed while a review is being paid for takes effect once the
charge has landed on the run's state, and any error that stops a paid run
leaves it resumable. Ask Claude debits 1 coin per call and gives it back
unless an answer goes out.

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
| `page.tsx` | Homepage shell — assembles the `_landing/` sections in one tree, no context provider. |
| `globals.css` | Site-wide only: tokens, reset, reduced-motion, the desk background (a fixed warm gradient with grain) behind every page but the homepage. Everything homepage-specific lives in `_landing/home.css`. |
| `clay.css` | The clay theme the tool pages and the workspace share, in the components layer (so a Tailwind utility on the same element wins): `.clay` (raised slab), `.clay-well` (pressed in), `.sheet` (paper), `.clay-btn` / `.clay-primary` / `.clay-ghost` / `.clay-key` / `.clay-chip`, `.clay-input` / `.clay-field` / `.clay-select`, `.clay-card` (a choice; `aria-pressed`/`aria-checked`/`data-selected` press it in), `.bead`, `.grip`, `.desk`, `.clay-window` (dialogs). Warm shadows only, one light from the top left; the `--away` colour stays reserved for what leaves the device. |
| `opengraph-image.tsx` | OG image, rendered with `satori` — can't resolve CSS custom properties, so `lib/site.ts`'s `BRAND` colors are duplicated here as literal hex, deliberately. |
| `robots.ts`, `sitemap.ts` | SEO. |
| `home/page.tsx`, `home/updates.ts` | The dashboard ("Home" in the tray; the landing page's Dashboard button leads here): two ways in — the workspace and the guide — and, further down, What's new, read from `updates.ts` (newest first; to announce something, add an entry at the top). |
| `guide/page.tsx`, `guide/shots.json` | The user guide: every tool and option on screenshots of the real UI, with numbered markers whose positions `scripts/docs/guide_shots.mjs` measures and writes to `shots.json` (the images are in `public/guide/`). Re-run the script after a screen changes. |
| `architecture/page.tsx` | The developers' and reviewers' tour: the system diagram, the privacy rules in code, each tool's pipeline, the design system, tests, deploying, a review checklist. This file stays the source; the page distills it. |
| `privacy/page.tsx` | Static prose + the privacy-flow SVG diagram, and the itemised account notice (`#accounts`). |
| `signin/page.tsx`, `signin/SignInView.tsx`, `signin/verify/` | Sign in (Google popup or email link); where Google's popup lands and closes; the email link's confirm step. |
| `account/page.tsx`, `account/AccountView.tsx` | The balance and coin history, Pro, sign out (here or everywhere), download my data, delete. |
| `pricing/page.tsx`, `pricing/Packs.tsx` | What's free, the price table, the packs and Pro; the checkout (Paddle.js on Buy) and the wait for the webhook's coins. |
| `terms/page.tsx`, `refunds/page.tsx` | The terms (M coins as prepaid usage credits) and the refund policy. |
| `journal/[id]/page.tsx` | Static-generated per-journal page (`generateStaticParams` from `getPrerenderedJournals()`). |
| `journals/page.tsx`, `journals/layout.tsx` | Browse/search/filter the full journal index. |
| `match/page.tsx` | JSX over `useMatch()`: the input, the steps run on the device, the results. |
| `match/_components/useMatch.ts` | The whole run — read → embed → topics → references → rank, the filter re-rank with its out-of-order guard (`matchSeq`), the rules checks — as one hook, so the writing workspace's Match window shares it. It interleaves ~8 `setState` calls with async steps, so it stays with its state rather than moving to `lib/`. |
| `match/_components/MatchFilters.tsx` | The 5 filter controls + `FEE_PRESETS`/`SPEED_PRESETS`. |
| `match/_components/MatchResults.tsx` | The results list with fit badges, built on the shared `JournalResultTitle`/`JournalResultChips`. On `/match` rows link on to `/review` and `/write?journal=`; inside the workspace `onReview`/`onSetTarget`/`expandOnly` keep everything on the page. |
| `match/_components/PaperInput.tsx`, `WhatWeRead.tsx`, `WhyThisJournal.tsx` | File-or-paste entry; what the matcher read (with a paste correction); the per-result reasons. |
| `match/_components/FormatCheckPanel.tsx` | The 9-row structural-check `<dl>`. |
| `match/_components/ProcessingTrace.tsx` | The live "On this device" step log + error text. |
| `match/layout.tsx` | Route metadata shim. |
| `review/page.tsx` | JSX over `useReview()`: upload, journal pick, structural check, then `ReviewRunner`. |
| `review/_components/useReview.ts`, `ReviewRunner.tsx` | The flow (attach, journal, outline edits, the passes with cancel and resume) as a hook, and the run's controls, consent notice, progress and result as one component — shared with the workspace's Review window (`onFile` can keep the project's target journal; `onCitation` adds "Jump to source"). |
| `review/_components/JournalPicker.tsx` | The hand-verified-journal grid (`showMatchLink` off inside the workspace). |
| `review/_components/TierPicker.tsx` | The quick/standard/thorough grid; owns `TIER_OPTIONS`. |
| `review/_components/OutlineEditor.tsx` | The detected outline before consent: per-section type, merge, add heading, "Don't send". |
| `review/layout.tsx` | Route metadata shim. |
| `figures/page.tsx` | Header, `FigureStudio` over `useFigures()`, and "Add to a paper" in the export bar's slot. |
| `figures/_components/useFigures.ts`, `FigureStudio.tsx` | The studio's state (upload → data prep → spec, the debounced render loop, recipes, export) as a hook, and its body as a component — shared with the workspace's Figures window. |
| `figures/_components/DataPrep.tsx` | Sheet, header row, number format, missing-value markers, per-column types, wide→long, the parsed preview table. |
| `figures/_components/Describe.tsx` | The request box, Ask Claude (spec) / custom tweak (hook), the labels opt-in, the live `[data-testid="figure-payload"]` preview. |
| `figures/_components/Gallery.tsx` | Template thumbnails; picking one calls `bindTemplate`. |
| `figures/_components/PanelEditor.tsx`, `StyleBar.tsx` | Per-panel controls (family, roles, axes, summary, order, overlays, statistics, annotations) and whole-figure style/size/palette/grid. |
| `figures/_components/FigurePreview.tsx`, `ExportBar.tsx`, `RecipeImportExport.tsx` | The live image with local-only error details and test results; PNG/TIFF/SVG/PDF export (with a `children` slot beside Export); recipe save/load. |
| `figures/layout.tsx` | Route metadata shim. |
| `figures/_components/AddToPaper.tsx` | Puts the figure as a PDF into a `/write` project's `figures/` and copies the LaTeX. |
| `write/page.tsx` | Project list, template picker, zip import; `?journal=` preselects a template, `?p=` reopens a project; an open project renders the full-screen `Workspace` alone. `useNetworkTrace()` counts requests with a body for the workspace's status line. |
| `write/_components/Workspace.tsx` | One open project, full screen: the tray, the files/outline slab, the source and PDF sheets (a draggable split, or one of them alone), diagnostics, the status line, and the tool windows over it. Owns the tools' hooks (the one route that imports another route's `_components/`), the compiled PDF as a `File`, the text files' contents (for suggestions, the outline and the word count), the remembered view settings, auto-compile and figure insertion. |
| `write/_components/Toolbar.tsx`, `StatusBar.tsx`, `CommandPalette.tsx`, `Shortcuts.tsx`, `CompileFirst.tsx` | The shell: home / back / rename / journal chip / tools / files toggle / view / Compile / ⌘K; the status line (compile status, counts, the paper's word count and limit, saved, a running tool, the engine, auto-compile, what was sent, the shortcuts key); the ⌘K palette; the keyboard shortcuts window; the "Compile first" notice. |
| `write/_components/EditorFormatBar.tsx`, `latexCompletions.ts`, `Outline.tsx` | The formatting bar over the source (wrap or insert; Cite/Ref/Figure lists, a table-size grid); the suggestions inside `\cite{`, `\ref{`, `\begin{` and after `\`; the Outline tab. |
| `write/_components/MatchWindow.tsx`, `ReviewWindow.tsx`, `FiguresWindow.tsx`, `ChecksWindow.tsx`, `JournalWindow.tsx`, `useChecks.ts` | The windows' bodies (dynamic imports) over the shared hooks; `useChecks` runs the format and rules checks over the PDF text. |
| `write/_components/LatexEditor.tsx`, `FileTree.tsx`, `PdfPane.tsx`, `Diagnostics.tsx`, `TemplatePicker.tsx`, `StorageBanner.tsx`, `download.ts` | The workspace's pieces. `LatexEditor`'s handle: goto (mid-screen), insert, wrap, insertBlock, comment, focus. |
| `write/_components/NetworkTrace.tsx` | `useNetworkTrace()` — patches `fetch` for the page's lifetime; `/write` uses it to count requests that carried a body (the status line's "sent"). The on-page request list it once fed was removed on 2026-09-27. |
| `write/layout.tsx` | Route metadata shim. |

**`src/app/_landing/`** — homepage-only, a Next "private folder" (excluded
from routing; nothing outside `app/page.tsx` imports from it).

| File | What |
|---|---|
| `home.css` | The ~87% of the old single `globals.css` that's homepage-only. |
| `useScrollProgress.ts` | The one rAF-throttled scroll listener: hero progress, the closing section's progress (the landing crossfades into it), overall page progress for the 3D paper, and the reduced-motion query. |
| `motion.ts` | `localProgress`, `stagger`, `motionStyle`, `countUp`, `decodeText` — the homepage's own animation-math kit (builds on `lib/easing.ts`'s `between`). |
| `SiteHeader.tsx`, `HeroSection.tsx`, `FinalSection.tsx`, `TypedPaper.tsx`, `ToolsOverlay.tsx` | The homepage is two screens: the landing (`HeroSection` — the wordmark with the Link cutout, "Find your path.", over the clay desk) and the closing call to action (`FinalSection`), which the landing crossfades into; its right column holds the desk's self-writing 3D paper (on phones, `TypedPaper`, the same manuscript as an HTML page). The middle sections (workflow, journals, matching, review, privacy) were removed on 2026-09-26. The fixed header's one link is Dashboard (`/home`); the finale's tool buttons were removed on 2026-09-28 (the closing section's Explore our tools still opens `ToolsOverlay`). |
| `IntroSequence.tsx` | The first-visit intro: a transparent layer over the landing (the question, then the landing's own wordmark builds, then the desk settles) — timing, dismissal, `sessionStorage` memory. |
| `ClayDesk.tsx` | Thin shell over `three/clayDesk.ts`: the landing's desk. It plays the intro (held floating while `.intro-overlay` is up, then settling), and on scroll morphs: every object leaves the frame, the paper stack rises, faces the camera and settles right, then writes itself in place — its top sheet is a canvas texture laid out as the manuscript (`three/paperText.ts`), placeholder bars replaced by text as it types. `_landing/TypedPaper.tsx` is the phone version. |

**`src/components/`**: shared across routes, one folder per concern.
A component used by a single route lives in that route's `_components/`
instead (or `_landing/` for the homepage).

| File | What |
|---|---|
| `layout/PageHeader.tsx` | Every non-homepage route's header: a skip link, then a sticky clay tray (the landing, Home, the five tools with the current one pressed in, Guide, Privacy) the same width on every page, then the h1 with its tool's bead; 3 content-width tiers for the h1. |
| `layout/SiteFooter.tsx` | The site footer on Home and the team page: links, legal pages, copyright. |
| `layout/Logo.tsx` | `LogoMark` (the M drawn as one route ending at the ochre dot) and `Wordmark` (its i carries the same dot). |
| `layout/BetaTag.tsx` | The Beta tag beside the logo in both headers. |
| `layout/ContactDetails.tsx` | The operator, contact address, postal address and phone (from `NEXT_PUBLIC_*`), as the legal pages give them. |
| `ui/Step.tsx` | A numbered step of a tool page on a clay slab (Review, Figures). |
| `ui/Dialog.tsx` | The modal window primitive on the native `<dialog>` (`showModal()`: focus trap, Escape, top layer, focus restore), used by the writing workspace's windows and palette. |
| `ui/ErrorText.tsx` | The one `role="alert"` error paragraph. |
| `ui/PaperDropzone.tsx` | The file drop zone. Optional `accept`/`title`/`hint`/`ariaLabel` props (defaulting to its PDF/DOCX copy) let `/figures` reuse it for CSV/XLSX. |
| `account/AccountButton.tsx` | The M coin bead and balance in the tray and the landing header, or Sign in. |
| `account/useAccount.ts` | The account store (`useSyncExternalStore`): asks `/api/me` only when the `ml_in` hint cookie exists, revalidates on focus. |
| `account/SignInPanel.tsx` | Continue with Google (popup) or an email link, with the sign-up checkboxes. |
| `account/ResetSiteData.tsx` | Clears everything this site keeps in the browser (the guide's Reset site data). |
| `journals/JournalResultRow.tsx` | `JournalResultTitle` (prerendered-link-vs-expand-button) + `JournalResultChips` (metadata chips), shared by `/journals` and `/match`. |
| `journals/JournalDetail.tsx` | A journal's details: fees, open access, indexing, speed, its rules when hand-verified. |
| `checks/RulesCheckPanel.tsx` | A paper checked against one journal's hand-verified rules (match, review, the workspace's Checks window). |
| `checks/CheckRow.tsx` | One pass/warn/fail row, shared with the structural check. |
| `review/ReviewConsent.tsx` | The review's consent notice: exactly what is sent, the price, the explicit-consent box. |
| `review/ReviewResultPanel.tsx` | The review's result: comments section by section, the numbers check. |
| `figures/FigureConsent.tsx` | Ask Claude's consent notice. A deliberately separate sibling of `ReviewConsent.tsx`, not a shared generalization: see `CLAUDE.md`'s exceptions paragraph for why each notice stays independently readable. |
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

**`src/lib/`**: framework-agnostic logic, one folder per feature (see
"`lib/` conventions" below). Each `*.selfcheck.ts` sits beside the file it
checks.

*`src/lib/paper/`*: reading a paper (PDF/DOCX → text, headings, references).

| File | What |
|---|---|
| `references.ts` | A paper's reference list → the journals it cites. |
| `extract.ts` | PDF/DOCX → text (browser-only: uses `pdfjs-dist`/`mammoth`); with `{ headings: true }` (the review only) also the document's heading structure. |
| `headingHints.ts` | Pure: the document's own heading structure — `pickPdfHeadings()` from per-line font data, `pickDocxHeadings()` from Word heading styles. |

*`src/lib/match/`*: matching: the index, embedding, ranking.

| File | What |
|---|---|
| `match.ts` | Loads the index and runs the ranker: `matchJournals`, `estimatePaperTopics`, `loadNameIndex`, filters. |
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
| `reviewOrchestrator.ts` | Client: `runReview()` — plans chunks, runs extract passes (≤3 concurrent, retries, resume), builds the claims ledger, runs synthesis, assembles `ReviewResult` with `coverage`. |
| `reviewSections.ts` | Pure: `splitIntoSections()` (document headings first, word list as fallback), `chunkSections()`, `buildPaperMap()`, `buildOutline()` (the user's outline edits). |
| `reviewTypes.ts` | The pass contract and `ReviewResult` — shared by the client and `functions/api/review.ts`. |
| `reviewPasses.ts` | The Function's gates: `parsePassRequest()` (exact keys, caps), `validateSynthesisOutput()` (ledger-id membership), `passCallConfig()`. |
| `reviewGrounding.ts` | `normalizeText()`, `groundExtractOutput()` — the anti-fabrication check, imported by `functions/`. |
| `reviewPrompt.ts` | `TIER_PLAN`, `buildExtractPrompt()`, `buildSynthesizePrompt()` — imported by `functions/`. |
| `reviewTool.ts` | The two strict tool schemas + drift guards — imported by `functions/`. |

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
| `projectStore.ts` | `/write` projects in the Origin Private File System (`ProjectMeta` carries the target journal's id and name); `autosaver()`; zip export/import. |
| `texSource.ts` | Pure LaTeX-source helpers for the workspace: a rough word count, `.bib` keys and entries, labels, the outline, `\input`s and the paper's files, `findQuoteInTex`, the figure and table snippets, the next free figure path. |
| `templateCatalog.ts` | `loadTexTemplates()`, `templateForJournal()`, `starterProject()`. |
| `zip.ts` | `zipFiles()`, `unzipFiles()`, `flattenSingleRoot()` over fflate. |

*`src/lib/accounts/`*: accounts, M coins and payments (mostly server-side).

| File | What |
|---|---|
| `coins.ts` | The prices (`reviewPrice`, `FIGURE_PRICE`, packs, Pro), `proCoinsLeft`, `dueProGrants`, email canonicalisation, ledger labels, and the two errors the client throws. Shared by client and server. |
| `auth.ts`, `safeNext.ts` | Server: sessions and cookies, Google claims and PKCE, account linking, rate limits, the Origin check; `safeNext` is shared with the sign-in pages. |
| `ledger.ts` | Server: the coin ledger's SQL: balance, debit, credit, welcome, the ticket sweep and pass claims, Pro grants, history. |
| `paddle.ts` | Server: the webhook signature, price ids, what each event does to the ledger, and the portal and cancel calls. |
| `paddleCheckout.ts` | Client: Paddle.js loaded on demand, the checkout, the customer portal. |
| `testD1.ts` | Selfchecks only: D1's API over `node:sqlite` with every migration applied. |

*`src/lib/ai/`*: the Anthropic transport the two AI Functions share.

| File | What |
|---|---|
| `anthropicStream.ts` | `callAnthropicTool()` — the selfchecked streaming transport (typed truncation/upstream errors), imported by `functions/`. |

*`src/lib/` (root)*: shared helpers.

| File | What |
|---|---|
| `site.ts` | Site-wide metadata (`SITE_TITLE`, `SITE_DESCRIPTION`, `BRAND` colors) — single source for `layout.tsx`, `opengraph-image.tsx`, `sitemap.ts`, `robots.ts`. |
| `easing.ts` | `clamp01`, `smooth`, `between`, `lerp` — the one shared animation-math kit (was reimplemented 3× before Phase 5). |
| `errorMessage.ts` | `errorMessage(err, fallback?)` — the one shared `instanceof Error` normalization. |

**`functions/`** — Cloudflare Pages Functions; every file here is routed
as an endpoint, so shared logic lives in `src/lib/` instead (imported via
relative paths) and only genuinely server-specific code stays here.

| File | What |
|---|---|
| `api/review.ts` | One of the two server-side files in the project: a stateless dispatcher for the review's `extract`/`synthesize` passes — body-size guard, `parsePassRequest`, the daily pass limits (`dailyCaps.ts`: 1,500 a day in all, 150 per account), one `callAnthropicTool`, grounding/validation. |
| `api/_middleware.ts` | The Origin check on every non-GET (not the Paddle webhook) and `Cache-Control: no-store`. |
| `api/me.ts`, `api/account.ts` | Who's signed in, the balance, Pro, Paddle's public config; the account page's data, the export, deletion. |
| `api/auth/google/*`, `api/auth/email/*`, `api/auth/logout.ts` | Signing in and out. |
| `api/review/start.ts` | Charges a review and issues its ticket. |
| `api/pay/webhook.ts`, `api/pay/portal.ts` | Paddle's events; the customer-portal link. |
| `api/figure.ts` | The other AI Function: body-size guard, `isValidFigurePayload`, the daily limits (`dailyCaps.ts`), one `callAnthropicTool` with a strict tool, then the output gates (`validateFigureSpec`, `checkSpecAgainstColumns`, `checkLabels`, or the hook denylist). |

## `lib/` conventions

- **One folder per feature** (`paper/`, `match/`, `journals/`, `checks/`,
  `review/`, `figures/`, `write/`, `accounts/`, `ai/`), with only the
  genuinely shared helpers (`easing.ts`, `errorMessage.ts`, `site.ts`) at
  the root. Files keep their full names (`reviewPrompt.ts`, not
  `review/prompt.ts`) so a name means the same thing in a search, a stack
  trace and these docs. Cross-feature imports are fine and expected
  (`formatCheck.ts` serves matching and the review alike); a file sits in
  the folder of the feature it mainly belongs to.
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
2. `src/lib/match/rank.ts` — the ranker (with `match.ts` loading the index).
3. `pipeline/build_index.py` — how the static index those rankings run
   against gets built.
4. `functions/api/review.ts` — one of the two exceptions to "nothing
   leaves the browser," and why it's built the way it is (see above).
   `functions/api/figure.ts` is the other, narrower one.
5. `src/app/page.tsx` and `src/app/_landing/` — the homepage. One scroll-driven
   narrative split into one file per section; `useScrollProgress.ts` is
   the single source of every value the sections animate against.
