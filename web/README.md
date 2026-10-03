# MargaLink web app

The Next.js app (App Router, static export) and the Cloudflare Pages
Functions behind its account and AI features. The repo root's `README.md`
covers setup, checks and the workflow; `CLAUDE.md` has the privacy rules
every change must respect; `docs/ARCHITECTURE.md` has a one-line-per-file
map of `src/` and `functions/`.

```bash
npm install
npm run fetch-index   # the journal index (gitignored) from the deployed site
npm run dev           # http://localhost:3000
npm run dev:full      # with the Functions and a local D1, on :8788 (copy .dev.vars.example to .dev.vars first)
npm run check         # typecheck + lint + selfchecks
npm run smoke         # Playwright checks against the dev server (first: npx playwright install chromium)
```

| Folder | What |
|---|---|
| `src/app/` | Routes. Tool pieces in each route's `_components/`; the homepage in `_landing/`. |
| `src/components/` | Shared UI: `layout/`, `ui/`, `account/`, `journals/`, `checks/`, `review/`, `figures/`, `docs/`. |
| `src/lib/` | Logic by feature: `paper/`, `match/`, `journals/`, `checks/`, `review/`, `figures/`, `write/`, `accounts/`, `ai/`. |
| `functions/api/` | The Pages Functions (AI, accounts, sign-in, payments). |
| `migrations/` | The D1 schema. |
| `public/` | Workers, `figurelib.py`, templates, fonts, the guide's screenshots; `index/` is generated. |
| `scripts/` | `smoke/`, `e2e/`, `eval/`, `docs/`, `ops/`, `fixtures/`. |
| `figurelib/` | The CPython checks for `public/figurelib.py`. |
