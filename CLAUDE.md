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
the public model weights and public journal index.

`/write` (the LaTeX workspace) keeps rule 1 the same way: projects live in
the browser's Origin Private File System (`projectStore.ts`), and TeX Live
runs in a Web Worker (`public/texWorker.js`, driven by `texRunner.ts`). The
engine and its data packs are public files on our Cloudflare R2 bucket
(`texEngine.ts` names the URL; `scripts/publish_busytex.sh` uploads them,
with pinned sizes and a total cap) — a public-asset origin, fetched with
bodyless GETs, never anything from a paper. The workspace is also the hub:
match, review, figures, checks and journal open as windows over it. Matching
and the checks read the compiled PDF on-device (rule 1 unchanged); the two
rule-3 exceptions are reachable from there through the same `ReviewConsent`
/ `FigureConsent` components, and the status bar says when something was
sent.

**The two disclosed exceptions (rule 3):** two features send something to
Anthropic's Claude API. Both are opt-in, both sit behind an explicit
consent step that names exactly what happens before anything is sent, and
neither has a default-on path.

1. **The LLM pre-submission review** (`functions/api/review.ts`,
   orchestrated by `src/lib/reviewOrchestrator.ts`, consent in
   `ReviewConsent.tsx`) sends the paper's text, in several short requests
   — one per section, then one over the extracted numbers. This is the
   only feature where "never leaves your device" doesn't hold for a
   paper's content. The server keeps none of it between requests.
2. **The figure generator** (`functions/api/figure.ts`, consent in
   `FigureConsent.tsx`). Figures are drawn locally (Pyodide worker running
   `public/figurelib.py`); only "Ask Claude" sends anything: column names,
   inferred types, row count, the user's request text, and the current
   figure description with typed text blanked and group references as
   `#n`. Category labels (≤30 per column, ≤12 columns) are added only when
   the user ticks a separate box, and the notice lists them each time. It
   never sends a cell value or a traceback. `src/lib/figureSchema.ts` is
   the only thing permitted to build that payload, and
   `figureSchema.selfcheck.ts` proves it with planted sentinels; the
   Function re-validates it and gates Claude's reply (valid spec, columns
   that exist, no label it wasn't given; hooks through the denylist).

These two Pages Functions are the only server code that ever receives
anything from a paper or a dataset, and they share one credential
(`ANTHROPIC_API_KEY`). Every other feature keeps rule 1 absolutely; these
two are rule 3's carve-outs, not quiet exceptions to rule 1.

**Accounts, M coins and payments** (`docs/superpowers/plans/2026-09-28-accounts-coins-payments.md`):
the two AI features cost M coins, so they need an account; nothing else
does, and a signed-out visitor makes no account request (`useAccount.ts`
asks `/api/me` only when the `ml_in` hint cookie exists). The account
Functions (`functions/api/_middleware.ts`, `me.ts`, `account.ts`,
`auth/*`, `review/start.ts`, and later `pay/*`) keep an email address,
Google's account id, hashed sessions and an append-only coin ledger in D1
(`migrations/`, SQL in `src/lib/ledger.ts`, prices in `src/lib/coins.ts`).
None of them ever receives paper content: `review/start.ts` takes section
ids and character counts, and its ticket row keeps only those, for two
hours. Rule 2 holds for signed-in users exactly as before. Never log an
email address, a token or a request body.

## Layout

- `pipeline/` — offline data pipeline (Python, `uv`). Fetches OpenAlex
  journal/paper data, builds the journal index. Never runs in production;
  its output (`web/public/index/*`) is static files the browser fetches.
- `web/` — Next.js app, static export (`output: "export"` in
  `next.config.ts`) — no backend, **except** the Cloudflare Pages
  Functions in `web/functions/api/`: `review.ts` and `figure.ts`, holding
  the Anthropic API key server-side since the browser must never see it
  (see the disclosed exceptions above), and the account and payment
  Functions beside them (see "Accounts, M coins and payments").

## Frozen decisions (Phase 0)

- Embedding model: 384-dimensional, small (~33 MB in the browser), named
  once in `pipeline/embedding.py` and carried to the browser by
  `manifest.json` (`model_id`, `query_prefix`). Journal centres, topics and
  user papers always come from the same model; it changes only when the
  bake-off (`pipeline/bakeoff.py`) shows ≥ 5 points of top-10 accuracy, and
  a change means rebuilding the whole index.
- Journal index ships to the browser as int8 (not fp32): negligible
  accuracy loss (~1pp), ~4x smaller download.

## Running it

Web app: `cd web && npm install && npm run dev` — but `/journals`,
`/match`, `/journal/[id]`, and `npm run build` all need the pipeline's
output first (see below); without it you only get `/`, `/privacy`, `/review`, `/figures`, `/write`.

Pipeline, in order (see `pipeline/README.md` for the full explanation —
`fetch_works.py` alone takes hours and is resumable):
```bash
cd pipeline && uv sync
uv run --env-file .env fetch_sources.py
uv run --env-file .env fetch_works.py
uv run --env-file .env enrich_doaj.py
uv run --env-file .env enrich_nlm.py
uv run build_index.py
```

Deploy: `cd web && npm run deploy` (builds, strips the oversized WASM file
Cloudflare Pages would otherwise reject — see `docs/ARCHITECTURE.md` — then
`wrangler pages deploy`).

## Environment variables

| Variable | Where | Purpose |
|---|---|---|
| `OPENALEX_API_KEY` | `pipeline/.env` | Raises OpenAlex's rate limit; the fetchers work without it, just slower. |
| `ANTHROPIC_API_KEY` | `web/.dev.vars` locally, the Cloudflare Pages dashboard in prod | The credential for both server-side features — `functions/api/review.ts` and `functions/api/figure.ts`. Server-side only. |
| `DB` | `wrangler.toml` binding (D1) | Accounts, sessions, the coin ledger, review tickets. Local: `npm run db:local`; the ids in `wrangler.toml` are placeholders until `wrangler d1 create`. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` | `.dev.vars` / dashboard secrets | "Continue with Google" (scope `openid email`). Unset: the Google button explains it's not set up. |
| `RESEND_API_KEY`, `EMAIL_FROM` | `.dev.vars` / dashboard secrets | Email sign-in links. |
| `DEV_EMAIL_LOG` | `.dev.vars` only | `1` on localhost prints sign-in links to the console instead of emailing them. |
| `PADDLE_ENV`, `PADDLE_CLIENT_TOKEN`, `PADDLE_API_KEY`, `PADDLE_WEBHOOK_SECRET` | `.dev.vars` / dashboard secrets | Coin packs and Pro through Paddle (`sandbox` or `production`). The client token is public (Paddle.js); the other two are secret. |
| `PADDLE_PRICE_IDS` | `.dev.vars` / dashboard | Our products' Paddle price ids, as JSON: `{"S":"pri_…","M":"pri_…","L":"pri_…","PRO_MONTH":"pri_…","PRO_YEAR":"pri_…"}` (they differ between sandbox and live). |
| `NEXT_PUBLIC_CONTACT_EMAIL` | `web/`, build-time | The address the privacy page and the terms give for questions and complaints. Set before accounts open. |
| `NEXT_PUBLIC_SITE_URL` | `web/`, build-time | Absolute URL for `sitemap.ts`/`robots.ts`/OG tags. Unset in dev; no domain registered yet (see `journal-finder-plan.md` §13). |

## Verification

This repo's standing convention — reuse these rather than inventing new
one-off checks:
```bash
cd web && npm run check     # typecheck + lint + the *.selfcheck.ts files
cd web && npm run smoke     # Playwright checks against a running dev server
cd web/figurelib && uv run selfcheck.py && uv run ruff check . ../public/figurelib.py
cd pipeline && uv run selfcheck.py && uv run ruff check .
```
`.github/workflows/check.yml` runs all but `smoke` (which needs a live dev
server) on every push.
