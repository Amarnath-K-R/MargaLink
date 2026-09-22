# MargaLink — web app

Next.js (App Router, static export) frontend for MargaLink, a privacy-first
journal finder. See the repo root's `CLAUDE.md` and `journal-finder-plan.md`
for the product plan and the three privacy rules every change must respect.

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

`npm run build` produces the static export in `out/`. `scripts/drive_app.mjs`
is a manual Playwright smoke driver — `node scripts/drive_app.mjs` against a
running dev server exercises the match flow end to end and screenshots the
result.

## Deploy

Static export, deployed to Cloudflare Pages (`wrangler.toml`) — the app has
no backend except `functions/api/review.ts`, a single Cloudflare Pages
Function holding the Anthropic API key server-side for the opt-in AI review.
