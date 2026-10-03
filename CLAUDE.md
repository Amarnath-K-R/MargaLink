# MargaLink

Privacy-first journal finder. A researcher uploads a paper; the site suggests
matching journals. See `docs/product-plan.md` for the full product plan.

## Three privacy rules — every change must respect these

1. The paper file is never uploaded for matching or format checks.
2. Nothing from a paper is stored on the server, not even for logged-in users.
3. Any feature that sends text out of the browser is opt-in, with a plain
   language notice first.

In practice: extraction (`web/src/lib/paper/extract.ts`), embedding
(`embed.ts`), ranking (`match.ts`), the rule-based format check
(`formatCheck.ts`) and journal-rules check (`rulesCheck.ts`) all run in the
browser — no network calls during any of them carry the paper's text, only
the public model weights and public journal index.

`/write` (the LaTeX workspace) keeps rule 1 the same way: projects live in
the browser's Origin Private File System (`projectStore.ts`), and TeX Live
runs in a Web Worker (`public/texWorker.js`, driven by `texRunner.ts`). The
engine and its data packs are public files on our Cloudflare R2 bucket
(`texEngine.ts` names the URL; `scripts/ops/publish_busytex.sh` uploads them,
with pinned sizes and a total cap) — a public-asset origin, fetched with
bodyless GETs, never anything from a paper. A Word project (`kind: "docx"`,
one `paper.docx`) is kept the same way and edited in Folio
(`@stll/folio-react`, `DocEditor.tsx`), which runs in the page and makes no
requests; it saves with full saves only (its selective save lost edits:
`docs/word-editor-known-issues.md`), and `check_docx_fidelity.mjs` is the
gate for any Folio upgrade. Spelling and grammar (`src/lib/writing/`:
Harper's WASM in a Web Worker, served from our own origin) run on the
device in both editors; a paper's English variant and dictionary are kept
in its project settings. The workspace is also the hub: match, review,
figures, checks and journal open as windows over it. Matching and the
checks read the compiled PDF, or the saved Word document, on-device (rule 1
unchanged); the review and figure exceptions are reachable from there
through the same `ReviewConsent` / `FigureConsent` components, Rewrite
works on a selection in either editor behind `RewriteConsent`, and the
status bar says when something was sent.

**The three disclosed exceptions (rule 3):** three features send something to
Anthropic's Claude API. All are opt-in, each sits behind an explicit
consent step that names exactly what happens before anything is sent, and
none has a default-on path.

1. **The LLM pre-submission review** (`functions/api/review.ts`,
   orchestrated by `src/lib/review/reviewOrchestrator.ts`, consent in
   `ReviewConsent.tsx`) sends the paper's text, in several short requests
   — one per section, then one over the extracted numbers. This is the
   only feature that sends a whole paper's content (Rewrite sends only a
   selected passage). The server keeps none of it between requests.
2. **The figure generator** (`functions/api/figure.ts`, consent in
   `FigureConsent.tsx`). Figures are drawn locally (Pyodide worker running
   `public/figurelib.py`); only "Ask Claude" sends anything: column names,
   inferred types, row count, the user's request text, and the current
   figure description with typed text blanked and group references as
   `#n`. Category labels (≤30 per column, ≤12 columns) are added only when
   the user ticks a separate box, and the notice lists them each time. It
   never sends a cell value or a traceback. `src/lib/figures/figureSchema.ts` is
   the only thing permitted to build that payload, and
   `figureSchema.selfcheck.ts` proves it with planted sentinels; the
   Function re-validates it and gates Claude's reply (valid spec, columns
   that exist, no label it wasn't given; hooks through the denylist).
3. **Rewrite** (`functions/api/rewrite.ts`, rules in
   `src/lib/writing/rewrite.ts`, consent in `RewriteConsent.tsx`, once per
   paper, kept in the browser: `ProjectMeta.rewriteConsent`, never in a
   backup; the command "Turn off Rewrite for this paper" withdraws it).
   Sends only the passage the person selected, the tool (paraphrase, tone,
   shorten, expand, clarity) and tone, the format and the paper's English
   variant. Citations, references, labels, maths, drawings, pictures, LaTeX
   comments and, in Word, fields, content controls and footnote marks are
   replaced by numbered placeholders in the browser
   (`latexText.ts` `toPassage`, `docText.ts` `docPassage`) and never sent.
   `parseRewriteRequest` accepts exactly those fields, on both sides;
   `checkRewrite` refuses an answer that drops, adds or moves a placeholder,
   adds a number, or (LaTeX) changes a command, brace, `$`, `%` or `&`,
   before it's returned, and the browser checks it again before offering it. 1 M coin per 500
   words selected, refunded whenever no checked answer goes out.

These three Pages Functions are the only server code that ever receives
anything from a paper or a dataset, and they share one credential
(`ANTHROPIC_API_KEY`). Every other feature keeps rule 1 absolutely; these
three are rule 3's carve-outs, not quiet exceptions to rule 1.

**Accounts, M coins and payments** (`docs/plans/2026-09-28-accounts-coins-payments.md`):
the three AI features cost M coins, so they need an account; nothing else
does, and a signed-out visitor makes no account request (`useAccount.ts`
asks `/api/me` only when the `ml_in` hint cookie exists). The account
Functions (`functions/api/_middleware.ts`, `me.ts`, `account.ts`,
`auth/*`, `review/start.ts`, `pay/*`) keep an email address,
Google's account id, hashed sessions and an append-only coin ledger in D1
(`migrations/`, SQL in `src/lib/accounts/ledger.ts`, prices in `src/lib/accounts/coins.ts`).
None of them ever receives paper content: `review/start.ts` takes section
ids and character counts, and its ticket row keeps only those, for two
hours. Rule 2 holds for signed-in users exactly as before. Never log an
email address, a token or a request body.

**The closed beta and the console** (`web/src/lib/access/`): while
`BETA.on` (`access/beta.ts`, the one switch), the dashboard and every tool
need an invited account, and new accounts start with `BETA.coins` (50) in
place of the 10 welcome coins. `access/policy.ts` says what each path
needs, reading every spelling of a path as one (`/HOME`, `/home/`,
`/h%6Fme`: Pages routes Functions case-insensitively and a static server
may answer them with the page). `functions/_middleware.ts` gates pages
(`public/_routes.json`, which `policy.selfcheck.ts` keeps equal to
`routesJson()`, sends it every request but the static asset folders, and
it sets `_headers`' security headers on what it serves, since Pages skips
that file once a Function runs), and `functions/api/_middleware.ts` gates
the API (the AI features need an invited account, `/api/admin/*` a
developer). Email sign-in is off while the beta runs (Google only), except
on localhost for the e2e. `access/access.ts` holds the access list (`access_list`:
canonical address, `beta` or `developer`): `admitUser` is the only way an
account is created or signed in, and turns uninvited addresses away
before anything is stored. Every API request is logged after it's answered
(`telemetry/apiEvents.ts`, table `api_events`: the path without its query,
status, time, the account from its session, an AI call's model and token
counts; never an IP, address or body), kept 30 days. Developers read it
all at `/admin` (`src/app/admin/`, `functions/api/admin/*`, SQL in
`src/lib/admin/stats.ts`, whose `PRICES` table must match Anthropic's
rates for the model in `review.ts`/`figure.ts`). To end the beta: set
`BETA.on` false, commit the smaller `_routes.json` the policy selfcheck
asks for, and update the privacy notice and terms.

Adding someone: the console's Access tab. The first developer is seeded
by hand, once per database (Gmail addresses: lowercase, no dots or +tag in
`email_key`):
```bash
npx wrangler d1 execute margalink --remote --command "INSERT INTO access_list (email_key, email, role, note, added_at) VALUES ('<canonical>', '<address>', 'developer', 'owner', unixepoch() * 1000)"
```
Turning the beta on in a database that already has accounts closes it to
them: before migrating, count them
(`SELECT COUNT(*) FROM users`, and `SELECT COUNT(*) FROM subscriptions WHERE status != 'canceled'`),
and either invite them or email them first (the terms promise notice of
changes that matter to account holders). After deploying, sign out anyone
who signed in through the old code between the migration and the deploy:
`DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE access_key IS NULL)`.

## Layout

- `pipeline/` — offline data pipeline (Python, `uv`). Fetches OpenAlex
  journal/paper data, builds the journal index. Never runs in production;
  its output (`web/public/index/*`) is static files the browser fetches.
- `web/` — Next.js app, static export (`output: "export"` in
  `next.config.ts`) — no backend, **except** the Cloudflare Pages
  Functions in `web/functions/`: `api/review.ts`, `api/figure.ts` and
  `api/rewrite.ts`, holding the Anthropic API key server-side since the browser must never
  see it (see the disclosed exceptions above), the account, payment and
  console Functions beside them (see "Accounts, M coins and payments"),
  and the beta's page gate, `_middleware.ts`.

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

Web app: `cd web && npm install && npm run fetch-index && npm run dev`.
`/journals`, `/match`, `/journal/[id]` and `npm run build` need the journal
index (`web/public/index/`, gitignored): `npm run fetch-index` downloads the
deployed one; the pipeline (below) rebuilds it from source. With the
Functions and a local D1: copy `web/.dev.vars.example` to `.dev.vars`, then
`npm run dev:full` (port 8788).

Pipeline: `cd pipeline && uv sync && cp .env.example .env`, then the run
order in `pipeline/README.md` (fetch, enrich, build, then
`eval_match.ts --fit --write-manifest`, which publishes the ranking;
`fetch_works.py` alone takes hours and is resumable). Its data and each
built index are kept in R2: `uv run backup.py push` after a run,
`uv run backup.py pull` on a new machine instead of re-fetching (README,
"Backups").

Deploy: `cd web && npm run deploy` (builds, strips the oversized WASM file
Cloudflare Pages would otherwise reject — see `docs/ARCHITECTURE.md` — then
`wrangler pages deploy`).

## Environment variables

| Variable | Where | Purpose |
|---|---|---|
| `OPENALEX_API_KEY` | `pipeline/.env` | Raises OpenAlex's rate limit; the fetchers work without it, just slower. |
| `ANTHROPIC_API_KEY` | `web/.dev.vars` locally, the Cloudflare Pages dashboard in prod | The credential for the three server-side AI features: `functions/api/review.ts`, `functions/api/figure.ts` and `functions/api/rewrite.ts`. Server-side only. |
| `DB` | `wrangler.toml` binding (D1) | Accounts, sessions, the coin ledger, review tickets, and the AI features' daily limits (`src/lib/accounts/dailyCaps.ts`). Local: `npm run db:local`. After a new migration: `wrangler d1 migrations apply margalink --remote`. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` | `.dev.vars` / dashboard secrets | "Continue with Google" (scope `openid email`). Unset: the Google button explains it's not set up. |
| `RESEND_API_KEY`, `EMAIL_FROM` | `.dev.vars` / dashboard secrets | Email sign-in links. |
| `DEV_EMAIL_LOG` | `.dev.vars` only | `1` on localhost prints sign-in links to the console instead of emailing them. |
| `HASH_SECRET` | `.dev.vars` / dashboard secret | Keys the fingerprints kept for sign-in rate limits and the once-per-address welcome bonus (HMAC). Required when deployed: sign-in fails closed without it; localhost uses a fixed dev key. |
| `TURNSTILE_SECRET`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | dashboard secret; `web/`, build-time | Cloudflare Turnstile on the email sign-in form. Required for email sign-in when deployed (without it the request fails closed, like `HASH_SECRET`); set both. |
| `PADDLE_ENV`, `PADDLE_CLIENT_TOKEN`, `PADDLE_API_KEY`, `PADDLE_WEBHOOK_SECRET` | `.dev.vars` / dashboard secrets | Coin packs and Pro through Paddle (`sandbox` or `production`). The client token is public (Paddle.js); the other two are secret. |
| `PADDLE_PRICE_IDS` | `.dev.vars` / dashboard | Our products' Paddle price ids, as JSON: `{"S":"pri_…","M":"pri_…","L":"pri_…","PRO_MONTH":"pri_…","PRO_YEAR":"pri_…"}` (they differ between sandbox and live). |
| `NEXT_PUBLIC_CONTACT_EMAIL` | `web/`, build-time | Overrides the contact address the site gives for questions and complaints (/contact, privacy, terms, refunds, the sign-in panel). Defaults to `developer@margalink.com` (`src/lib/site.ts`); every address at the domain forwards to the owner (Cloudflare Email Routing, catch-all). |
| `NEXT_PUBLIC_OPERATOR` | `web/`, build-time | The sole proprietor's full legal name, as the privacy notice, the terms and `/contact` give it (also the grievance officer). Set before accounts open. |
| `NEXT_PUBLIC_POSTAL_ADDRESS`, `NEXT_PUBLIC_SUPPORT_PHONE` | `web/`, build-time | The postal address and buyer-support phone number on `/contact`, the privacy notice and the terms (Paddle's seller policy and India's rules ask for both). Set before accounts open. |
| `NEXT_PUBLIC_SITE_URL` | `web/`, build-time | Absolute URL for `sitemap.ts`/`robots.ts`/OG tags. Defaults to `https://margalink.com` (`src/lib/site.ts`); set it only for a copy at another address. |

## Working here

- `main` is the shared branch. Each task goes on its own branch, pushed,
  with a pull request into `main`; the owner merges after testing. Never
  commit straight to `main` or merge a PR unasked.
- Code lives by feature: `web/src/lib/<feature>/` (`paper`, `match`,
  `journals`, `checks`, `review`, `figures`, `write`, `writing`, `accounts`, `ai`,
  `access`, `telemetry`, `admin`),
  shared UI in `web/src/components/<concern>/`, single-route pieces in that
  route's `_components/` (the homepage's in `_landing/`). A new
  `*.selfcheck.ts` sits beside the file it tests.
- No em dashes in user-visible copy (pages, errors, titles, on-screen
  data); comments and the prompts sent to Claude are exempt.

## Verification

This repo's standing convention — reuse these rather than inventing new
one-off checks:
```bash
cd web && npm run check     # typecheck + lint + the *.selfcheck.ts files
cd web && npm run smoke     # Playwright checks against a running dev server
cd web && npm run build && node scripts/e2e/e2e_accounts.mjs   # the account Functions for real, on a fresh local D1
cd web/figurelib && uv run selfcheck.py && uv run ruff check . ../public/figurelib.py
cd pipeline && uv run selfcheck.py && uv run ruff check .
```
`.github/workflows/check.yml` runs `npm run check` and the figurelib and
pipeline checks on every push; not the smokes, the build or `e2e_accounts`
(those need the journal index and a browser).
