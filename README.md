# MargaLink

A privacy-first journal finder. A researcher uploads a paper; the site
suggests matching journals, checks the paper's structure against the
target journal's rules, and (only if the researcher opts in) runs an AI
review. See [`docs/product-plan.md`](docs/product-plan.md) for the
original product plan and [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
for how the built system actually works (they've diverged in places;
`docs/product-plan.md` carries a status header pointing out where).

## Three privacy rules

Every change in this repo has to respect these (`CLAUDE.md` has the full
version, including how each is checkable):

1. The paper file is never uploaded for matching or format checks.
2. Nothing from a paper is stored on the server, not even for logged-in users.
3. Any feature that sends text out of the browser is opt-in, with a plain
   language notice first.

Two disclosed exceptions: an opt-in AI review sends paper text to
Anthropic's API, and the figure studio's opt-in "Ask Claude" sends a
spreadsheet's schema and your request (never its values; category labels
only if you tick a box). Figures themselves are drawn on your device, and the LaTeX writing
workspace compiles and stores papers on your device too, and opens the other tools from inside
it (matching and the checks read the compiled PDF, on-device; the two opt-in AI features sit
behind their notices). Both AI features sit behind an explicit consent step that names exactly
what happens before anything is sent. See `docs/ARCHITECTURE.md`.

Those two features cost money per run, so they're paid in M coins and need
an account (Google or an email link; only an email address is kept, never
anything from a paper). Everything else is free, with no account. Coins
come from a welcome bonus, packs, or Pro, sold through Paddle as the
merchant of record.

## Repository layout

| Path | What |
|---|---|
| `web/` | The Next.js app (static export) and its Cloudflare Pages Functions. See `web/README.md`. |
| `web/src/app/` | Routes, one folder per URL. Each tool's pieces sit in its `_components/`; the homepage's sections and 3D scenes in `_landing/`. |
| `web/src/components/` | Shared UI by concern: `layout/` (header, footer, logo), `ui/` (dialog, steps, drop zone), `account/`, `journals/`, `checks/`, `review/`, `figures/`, `docs/`. |
| `web/src/lib/` | Framework-agnostic logic by feature: `paper/`, `match/`, `journals/`, `checks/`, `review/`, `figures/`, `write/`, `accounts/`, `ai/`. Each `*.selfcheck.ts` sits beside the file it tests. |
| `web/functions/api/` | The server code: the two AI Functions (`review.ts`, `figure.ts`, holding the Anthropic key) and the account, sign-in and payment Functions. None of it ever receives paper content except the two opt-in AI features. |
| `web/migrations/` | The D1 (SQLite) schema for accounts and the coin ledger. |
| `web/public/` | Static assets: the TeX and figure workers, `figurelib.py`, templates, the figure gallery, fonts, the guide's screenshots. The journal index (`public/index/`) is generated, not committed. |
| `web/scripts/` | `smoke/` (Playwright checks against a dev server), `e2e/` (the account Functions on a local D1), `eval/` (the ranker's evaluation), `docs/` (the guide's screenshots), `ops/` (index download, TeX engine upload, templates), `fixtures/`. |
| `web/figurelib/` | A CPython harness that checks `public/figurelib.py` (the figure renderer) and every gallery template. |
| `pipeline/` | The offline data pipeline (Python, uv): OpenAlex, DOAJ and NLM data in, the static journal index out. See `pipeline/README.md`. |
| `docs/` | `ARCHITECTURE.md` (why it's built this way, with a one-line-per-file map), `product-plan.md` (the original plan), `plans/` and `specs/` (design records of each feature, kept as written). |
| `CLAUDE.md` | The working rules for AI coding agents, and the full privacy rules and environment variables. Worth reading for humans too. |

In the running app, `/guide` is the illustrated user guide and
`/architecture` is a tour of the system for developers and reviewers.

## Getting started

You need Node 26 and [uv](https://docs.astral.sh/uv/) (only for the pipeline and the figure renderer's checks).

```bash
git clone git@github.com:Amarnath-K-R/MargaLink.git
cd MargaLink/web
npm install
npm run fetch-index   # the journal index, from the deployed site (~40 MB)
npm run dev           # http://localhost:3000
```

`npm run dev` serves every page; the tools that need a server (the AI
features, sign-in, coins) need the Pages Functions too:

```bash
cp .dev.vars.example .dev.vars   # fill in what you need; all optional
npm run dev:full                 # builds, applies the local D1 migrations, serves on :8788
```

To rebuild the index from source instead of downloading it, run the
pipeline (hours, ~11 GB): see `pipeline/README.md`.

## Checks

```bash
cd web && npm run check    # typecheck + lint + every selfcheck
cd web && npm run smoke    # Playwright checks against a running dev server (npm run dev)
cd web && npm run build && node scripts/e2e/e2e_accounts.mjs   # the account Functions, on a fresh local D1
cd web/figurelib && uv run selfcheck.py && uv run ruff check . ../public/figurelib.py
cd pipeline && uv run selfcheck.py && uv run ruff check .
```

CI (`.github/workflows/check.yml`) runs all but `smoke` and the build on
every push and pull request; those two need the journal index.

## Working on it

- Branch from `main`, one branch per change, and open a pull request; `main` is merged after review and testing.
- Keep the three privacy rules above. Anything new that sends data off the device needs its own opt-in notice and a mention in `CLAUDE.md`.
- New logic gets a `*.selfcheck.ts` beside it (plain `node:assert`, run by `npm test`); a change to a flow gets its smoke in `scripts/smoke/` updated.
- No em dashes in anything a user can see (pages, errors, titles); code comments are fine.
- After a UI change to a tool page, re-take the guide's screenshots: `node scripts/docs/guide_shots.mjs <section>`.
- `web/AGENTS.md` (and `web/CLAUDE.md`, which includes it) is generated by `next dev`; don't hand-edit it.

## Deploying

Maintainers only. The site is deployed by direct upload to Cloudflare Pages
(not from git):

```bash
cd web
npx wrangler d1 migrations apply margalink --remote   # when there's a new migration
npm run deploy
```

Secrets live in the Cloudflare Pages dashboard; `CLAUDE.md` lists them.
