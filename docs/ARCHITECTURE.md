# Architecture

Why MargaLink is built the way it is — not a tour of the code (the code and
its own comments are the tour), but the decisions that aren't obvious just
from reading a single file.

## The core decision: no server for matching

The original plan (`journal-finder-plan.md`) called for a server that
compares an uploaded paper's embedding against journal vectors stored in
Postgres/pgvector. That was never built. What exists instead:

1. The pipeline (`pipeline/`) builds one static, versioned index offline:
   every journal's centroid embedding, quantized to int8, plus its
   metadata. Checked into the deploy as `web/public/index/{manifest.json,
   index.bin, meta.json}` (gitignored in source control — see
   [pipeline/README.md](../pipeline/README.md) for how to produce it).
2. The browser downloads that index once (it's public data, same trust
   category as the page's own JS) and does the entire match — extract
   text, embed, rank — locally. `src/lib/match.ts` is the whole ranking
   engine: no network round-trip carries anything from the user's paper.

This isn't an optimization on top of a server design — it's the direct
consequence of the project's privacy rules (`CLAUDE.md`). A server that
ranks journals necessarily sees the paper's embedding at minimum; keeping
rule 1 (the paper never leaves the device) absolute meant removing the
server from that path entirely, not trusting it to behave. The two places
where something *does* leave the device (the AI review, the figure
generator) are deliberately built as disclosed exceptions, not the
default — see below.

**Current numbers** (`web/public/index/manifest.json`): 18,125 journals,
384-dimension embeddings (`thenlper/gte-small` server-side /
`Xenova/gte-small` in the browser — same weights, frozen together per
`CLAUDE.md`), shipped as int8 rather than fp32 (~1pp accuracy loss for a
~4x smaller download). `index.bin` is ~6.9MB, `meta.json` ~10MB.

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

A real manuscript fact-check against an early version of this feature's
prompt turned up three real failure modes, which is why the current
implementation looks the way it does:

1. The model attributed numbers to the abstract that only appeared in
   Results/Tables — it was inferring section boundaries from raw text
   instead of reading real ones. Fix: the abstract is extracted and
   handed over as its own labeled block (`formatCheck.ts`'s
   `extractAbstract`, already proven correct against real PDFs), so "is
   this in the abstract" stops being an inference the model has to make.
2. It flagged "inconsistencies" that actually reconciled once the
   arithmetic was checked. Fix: the prompt explicitly requires arithmetic
   reconciliation and a careful re-read of any table before a finding is
   reported.
3. (Both of the above compound a third risk: a model can state a quote
   confidently without that quote actually appearing anywhere in the
   source.) Fix: every finding requires a verbatim citation, and
   `filterGrounded()` verifies server-side that every citation actually
   appears in the source text — never trusting the model's own claim that
   a quote is real — dropping any finding that doesn't verify before it
   ever reaches the client.

The fourth defense is a design choice rather than a bug fix: extended
thinking (adaptive effort) lets the model reason through verification —
checking quotes, arithmetic, section attribution — before it commits to
the tool call, inside one request. A literal second Claude call (draft,
then a separate verify-and-prune pass) was tried first and worked, but
re-sends the full paper text a second time and doubles latency for
accuracy gains a single well-instructed reasoning pass captures almost as
well.

Three review depths (`ReviewTier`: quick/standard/thorough) map to
Anthropic's effort levels — verification rigor (grounding, arithmetic) is
identical at every tier; only how exhaustively the model looks varies.
`thorough` uses effort `"high"`, deliberately not `"max"`: confirmed
empirically that `"max"` is effectively unbounded in cost/time (one real
test ran past 4.5 minutes without finishing, while also truncating its
own output at a 24,000-token cap on a ~1,200-word paper) — `"high"` is
the level already proven to work well on a real paper earlier in the
project.

(The `functions/api/review.ts` handler itself carries a short pointer
back to this section rather than repeating it — see there for where each
of these defenses actually lives in code.)

### The figure generator: what leaves the device, and what doesn't

The figure generator (`/figures`) has the same shape as the AI review —
an opt-in, consent-gated call to Claude — but a narrower privacy problem
to solve. A researcher's raw spreadsheet is individual-level data, more
sensitive than a manuscript draft, so "upload your data, we compute
stats server-side" was never on the table. The design instead splits
**code generation** from **code execution**: Claude only ever sees a
*description* of the data (column names, inferred dtypes, row count, the
chosen chart type, an optional style note) and generates Python plotting
code from that description; the code then runs against the real data
locally, in a Web Worker running Pyodide (Python compiled to WASM). The
two round trips in the whole feature are the schema-only POST to
`/api/figure` and the worker's own bodyless GETs to jsDelivr for
Pyodide's runtime and wheels — a cell value appears in neither.

`src/lib/figureSchema.ts` is this feature's `reviewGrounding.ts`: the one
piece of previously-untested logic sitting directly behind a network
call, and the one file this feature's safety actually rests on.
`buildFigurePayload()` is the *only* function permitted to construct the
outbound payload — it always builds a fresh object literal, never spreads
a `Dataset` — and `figureSchema.selfcheck.ts` proves the payload is safe
rather than asserting it: it plants sentinel values in a fixture dataset,
confirms they never appear anywhere in the built payload, and asserts the
payload's key set exactly matches five known keys. That last assertion is
the one that actually protects the future — it fails the moment someone
adds a field like `sampleRows` "to help Claude produce better code,"
turning a quiet leak into a deliberate, reviewed change. The Function
re-validates the same shape server-side and rejects unknown keys, so a
tampered client can't widen the payload either.

Three things are deliberately never sent, each for its own reason:

- **Cell values** — the point of the whole design.
- **Category levels** — a column's distinct values (a site name, a
  patient ID, a group label) are themselves data, not schema, even
  though they look like metadata.
- **Python tracebacks** — a traceback from the generated code running
  against real data can quote a cell value verbatim in its error message
  (`KeyError: 'ZZQQ-SENTINEL-0042'`, for instance). This is why
  auto-repair-from-error (sending a failure back to Claude to fix its own
  code) isn't built: it isn't just unbuilt, it's a privacy problem this
  design specifically avoids creating. Errors are shown to the
  researcher, who can edit their note and regenerate — they never leave
  the device.

The generated code is always shown, not hidden behind a "trust us" figure
— the same transparency the payload preview on the page already gives
the request.

The ~28-30MB Pyodide download (wasm runtime, stdlib, pandas/matplotlib
wheels) sounds large in isolation, but it's the same order of magnitude
as the embedding model `/match` already downloads for local matching, and
it's cached by the browser for a year afterward — this isn't a new class
of tradeoff for the project, just the second time it's made.

One honest caveat: `useNetworkTrace()` patches `fetch` on the main
thread, so `/match` and `/review`'s "every request this page makes" claim
is literally complete. The figure worker's CDN fetches happen inside the
worker, off the main thread, so they don't appear in that trace panel.
The privacy property still holds — those fetches are bodyless GETs for
public, versioned assets, never anything from the dataset — but the trace
panel's completeness guarantee doesn't extend there, and `/figures`
doesn't claim it does.

## The invariant that keeps `src/lib/` and `functions/` from duplicating types

`functions/api/review.ts` already imports directly from `src/lib/`
(`journalRules.ts`, `formatCheck.ts`, `reviewTypes.ts`) via relative
paths — there's no Workers-runtime barrier stopping it. The rule that
makes this safe: **`functions/` may import from `src/lib/` only modules
that are pure or isomorphic** — no `window`, no `localStorage`, no `fs`.
Most of `src/lib/` qualifies; a handful of browser-only modules
(`embed.ts`, `extract.ts`) and one Node-only module (`journalsServer.ts`,
used at build time) don't, and should never be imported from `functions/`.

`src/lib/reviewTypes.ts` is the cleanest example: it's the one file both
the client (`review.ts` and its consumers) and `functions/api/review.ts`
import `Citation`/`ReviewTier`/`ReviewResult`/`REVIEW_TIERS` from, instead
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
| `match/page.tsx` | Orchestrates the extract→embed→match pipeline. `process()` stays here rather than moving to `lib/`: it interleaves ~8 `setState` calls with async steps, and the out-of-order-result guard (`matchSeq`) has to move with that state, not get separated from it. |
| `match/_components/MatchFilters.tsx` | The 5 filter controls + `FEE_PRESETS`/`SPEED_PRESETS`. |
| `match/_components/MatchResults.tsx` | The results list, built on the shared `JournalResultTitle`/`JournalResultChips`. |
| `match/_components/FormatCheckPanel.tsx` | The 9-row structural-check `<dl>`. |
| `match/_components/ProcessingTrace.tsx` | The live "On this device" step log + error text. |
| `match/layout.tsx` | Route metadata shim. |
| `review/page.tsx` | Orchestrates upload → journal pick → structural check → AI review consent/request. |
| `review/_components/JournalPicker.tsx` | The hand-verified-journal grid. |
| `review/_components/TierPicker.tsx` | The quick/standard/thorough grid; owns `TIER_OPTIONS`. |
| `review/layout.tsx` | Route metadata shim. |
| `figures/page.tsx` | Orchestrates upload → chart/role spec → consent → code-gen → local Pyodide render. |
| `figures/_components/FigureSpecForm.tsx` | Chart-type grid + dtype-filtered role selects; owns `CHART_OPTIONS` and the live `[data-testid="figure-payload"]` preview. |
| `figures/_components/FigurePanel.tsx` | The rendered figure, PNG/SVG/PDF download links, the always-visible generated-code panel, Regenerate. |
| `figures/layout.tsx` | Route metadata shim. |

**`src/app/_home/`** — homepage-only, a Next "private folder" (excluded
from routing; nothing outside `app/page.tsx` imports from it).

| File | What |
|---|---|
| `home.css` | The ~87% of the old single `globals.css` that's homepage-only. |
| `useScrollProgress.ts` | The one rAF-throttled scroll listener driving every section's progress value + the reduced-motion media query. |
| `motion.ts` | `localProgress`, `stagger`, `motionStyle`, `countUp`, `decodeText` — the homepage's own animation-math kit (builds on `lib/easing.ts`'s `between`). |
| `demoData.ts` | Illustrative marketing content (`journalCards`, `requestRows`, `reviewTiersData`, `privacyMetrics`) — never real data. |
| `atoms.tsx` | `StageLabel`, `PrivacyPill`, `scrollToId` — small pieces shared by 3+ sections. |
| `SiteHeader.tsx`, `HeroSection.tsx`, `PathwaysSection.tsx`, `JournalsSection.tsx`, `MatchingSection.tsx`, `ReviewSection.tsx`, `PrivacySection.tsx`, `FinalSection.tsx` | One component per homepage section, each taking only the progress values it uses. `JournalsSection.tsx` fetches the real journal count via `loadManifest()` rather than a hardcoded number. `PathwaysSection.tsx`'s workflow list has a 4th row linking to `/figures` (a real `<Link>`, unlike the other three rows' `scrollToId` buttons) — a full scroll-narrative section for figures, like the other three tools get, is explicitly deferred. |

**`src/components/`** — shared across routes.

| File | What |
|---|---|
| `PageHeader.tsx` | The brand/nav/title header shared by every non-homepage route; 3 content-width tiers. |
| `NetworkTrace.tsx` | `useNetworkTrace()` + `<NetworkTracePanel>` — the fetch-instrumentation that makes `/match` and `/review`'s privacy claims checkable on the page itself. |
| `JournalResultRow.tsx` | `JournalResultTitle` (prerendered-link-vs-expand-button) + `JournalResultChips` (metadata chips), shared by `/journals` and `/match`. |
| `ErrorText.tsx` | The one `role="alert"` error paragraph. |
| `IntroSequence.tsx` | The first-visit overlay: timing, dismissal, `sessionStorage` memory. |
| `ThreeIntroScene.tsx`, `ThreePaperScene.tsx` | Thin shells over `components/three/` — see below. |
| `JournalDetail.tsx`, `PaperDropzone.tsx`, `RulesCheckPanel.tsx`, `ReviewConsent.tsx`, `ReviewResultPanel.tsx`, `CheckRow.tsx`, `FigureConsent.tsx` | Single-purpose presentational pieces. `PaperDropzone.tsx` takes optional `accept`/`title`/`hint`/`ariaLabel` props (defaulting to its original PDF/DOCX copy) so `/figures` reuses it for CSV/XLSX instead of a second dropzone component. `FigureConsent.tsx` is a deliberately separate sibling of `ReviewConsent.tsx`, not a shared generalization — see `CLAUDE.md`'s exceptions paragraph for why each consent notice stays independently readable. |

**`src/components/three/`** — the one domain subfolder in `components/`
(see "Design decisions" in the reorg plan for why: 5 files sharing one
real technical concern, not a speculative grouping).

| File | What |
|---|---|
| `useThreeCanvas.ts` | The setup/cleanup preamble shared by both scenes — mounting, the WebGL try/catch, resize, the rAF loop, teardown. |
| `sceneHelpers.ts` | `forEachMaterial` (shared mesh/material traversal) + `setOpacity` (`ThreePaperScene`'s absolute-value policy). |
| `paperSceneGraph.ts` | `buildPaperScene()` — the homepage scene's meshes/lights/groups. |
| `paperSceneMotion.ts` | `applyFrame()` + the `SCROLL` table (every scroll-threshold pair the scene's choreography depends on, named). |
| `introSceneGraph.ts` | `buildIntroScene()` — the first-visit overlay's meshes/lights/groups. |

**`src/lib/`** — framework-agnostic logic, deliberately kept flat (see
"lib/ conventions" below).

| File | What |
|---|---|
| `match.ts` | The entire client-side ranking engine — read this first. |
| `extract.ts` | PDF/DOCX → text (browser-only: uses `pdfjs-dist`/`mammoth`). |
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
| `review.ts` | Client side of the AI review: `requestReview()`, `stripIdentifyingInfo()`, the per-device usage counter. |
| `reviewTypes.ts` | `Citation`/`ReviewTier`/`ReviewResult`/`REVIEW_TIERS` — the one contract shared by the client and `functions/api/review.ts`. |
| `reviewGrounding.ts` | `filterGrounded()` and the quote-verification it depends on — the anti-fabrication check, imported by `functions/`. |
| `reviewPrompt.ts` | `buildPrompt()`, `TIER_CONFIG` — imported by `functions/`. |
| `reviewTool.ts` | The Claude tool-call JSON Schema + the `ReviewResult` drift guard — imported by `functions/`. |
| `spreadsheet.ts` | CSV/XLSX → `Dataset` (columns, inferred dtypes, row count). Mirrors `extract.ts`'s shape. |
| `figureSchema.ts` | The safety-critical file: `buildFigurePayload()` is the only function allowed to construct the outbound figure-generation payload. See "The figure generator" above. |
| `figurePrompt.ts` | `buildFigurePrompt()`, `extractPythonCode()` — imported by `functions/api/figure.ts`. |
| `figure.ts` | Client side of figure generation: `requestFigureCode()`, the per-device usage counter, session-scoped consent. Mirrors `review.ts`. |
| `figureRunner.ts` | The Pyodide worker lifecycle: `warmUp()`, `runFigureCode()`, `isCodeSafeToRun()`. Talks to `public/figureWorker.mjs`. |

**`functions/`** — Cloudflare Pages Functions; every file here is routed
as an endpoint, so shared logic lives in `src/lib/` instead (imported via
relative paths) and only genuinely server-specific code stays here.

| File | What |
|---|---|
| `api/review.ts` | One of the two server-side files in the project. `Env`, `UpstreamError`, `callAnthropicStreaming` (streaming transport — Workers-specific, doesn't belong in `lib/`), the KV daily cap, and request validation. |
| `api/figure.ts` | The other. Plain (non-streaming) `fetch` to Anthropic, no tool call, `isValidFigurePayload`/`validateSpec` request validation, its own KV daily cap. Simpler than `review.ts` — see "The figure generator" above for why. |

## `lib/` conventions

- **Flat, not domain-folders.** The dependency graph doesn't support it:
  `formatCheck.ts` serves both a "format" concern and a "review" concern;
  `journalUrl.ts` serves journals, match, and the sitemap. Domain folders
  would strand files in a `shared/` bucket for no comprehension gain at
  this file count. Revisit if `lib/` crosses ~30 files — the figure
  generator's five new files (`spreadsheet.ts`, `figureSchema.ts`,
  `figurePrompt.ts`, `figure.ts`, `figureRunner.ts`) cross that number,
  but the recommendation is to stay flat anyway: the `figure*` filename
  prefix is already doing the grouping work a folder would, and carving
  out `lib/figure/` while everything else stays flat buys inconsistency,
  not clarity. The next feature after this one is the one that should
  force the real decision.
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
2. `src/lib/match.ts` — the entire client-side ranking engine.
3. `pipeline/build_index.py` — how the static index those rankings run
   against gets built.
4. `functions/api/review.ts` — one of the two exceptions to "nothing
   leaves the browser," and why it's built the way it is (see above).
   `functions/api/figure.ts` is the other, narrower one.
5. `src/app/page.tsx` and `src/app/_home/` — the homepage. One scroll-driven
   narrative split into one file per section; `useScrollProgress.ts` is
   the single source of every value the sections animate against.
