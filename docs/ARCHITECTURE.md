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
server from that path entirely, not trusting it to behave. The one place
where text *does* leave the device (the AI review) is deliberately built
as the exception, not the default — see below.

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

The one exception to "no backend": `web/functions/api/review.ts`, a
single Cloudflare Pages Function. It exists only because the AI review
needs somewhere to hold the Anthropic API key that the browser must never
see — see `CLAUDE.md`'s "one disclosed exception." Everything else in
`web/` is static files served from Cloudflare's edge, no server involved.

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

## Read these five files first

If you're new to this codebase, in this order:

1. `CLAUDE.md` — the three privacy rules everything else follows.
2. `src/lib/match.ts` — the entire client-side ranking engine.
3. `pipeline/build_index.py` — how the static index those rankings run
   against gets built.
4. `functions/api/review.ts` — the one exception to "nothing leaves the
   browser," and why it's built the way it is (see above).
5. `src/app/page.tsx` — the homepage; large, but everything in it is one
   scroll-driven narrative rather than several unrelated features.
