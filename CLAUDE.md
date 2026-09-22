# MargaLink

Privacy-first journal finder. A researcher uploads a paper; the site suggests
matching journals. See `journal-finder-plan.md` for the full product plan.

## Three privacy rules — every change must respect these

1. The paper file is never uploaded for matching or format checks.
2. Nothing from a paper is stored on the server, not even for logged-in users.
3. Any feature that sends text out of the browser is opt-in, with a plain
   language notice first.

In practice: extraction (`web/src/lib/extract.ts`), embedding
(`embed.ts`), ranking (`match.ts`), the rule-based format check
(`formatCheck.ts`) and journal-rules check (`rulesCheck.ts`) all run in the
browser — no network calls during any of them carry the paper's text, only
the public model weights and public journal index. `match/page.tsx`
instruments `fetch()` for the whole page lifetime (not just one run) and
shows every request made, so this is checkable on the page itself, not just
asserted here.

**The one disclosed exception (rule 3):** the LLM pre-submission review
(`functions/api/review.ts`) sends paper text to Anthropic's Claude API —
opt-in only, behind an explicit consent step (`ReviewConsent.tsx`) that
names exactly what happens before anything is sent, never a default-on
path. This is the project's only server-side code and the only feature
where "never leaves your device" doesn't hold. Every other feature keeps
rule 1 absolutely; this one is rule 3's carve-out, not a quiet exception to
rule 1.

## Layout

- `pipeline/` — offline data pipeline (Python, `uv`). Fetches OpenAlex
  journal/paper data, builds the journal index. Never runs in production;
  its output (`web/public/index/*`) is static files the browser fetches.
- `web/` — Next.js app, static export (`output: "export"` in
  `next.config.ts`) — no backend, **except** `web/functions/api/review.ts`
  (a Cloudflare Pages Function, holding the Anthropic API key server-side
  since the browser must never see it — see the disclosed exception above).

## Frozen decisions (Phase 0)

- Embedding model: `thenlper/gte-small` / browser: `Xenova/gte-small`,
  384 dimensions. Must stay identical for journal centroids and user
  papers — changing it means rebuilding the whole index.
- Journal index ships to the browser as int8 (not fp32): negligible
  accuracy loss (~1pp), ~4x smaller download.
