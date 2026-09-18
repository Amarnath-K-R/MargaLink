# MargaLink

Privacy-first journal finder. A researcher uploads a paper; the site suggests
matching journals. See `journal-finder-plan.md` for the full product plan.

## Three privacy rules — every change must respect these

1. The paper file is never uploaded for matching or format checks.
2. Nothing from a paper is stored on the server, not even for logged-in users.
3. Any feature that sends text out of the browser is opt-in, with a plain
   language notice first.

In practice: extraction (`web/src/lib/extract.ts`), embedding
(`embed.ts`), and ranking (`match.ts`) all run in the browser. The only
network calls during matching are for the public model weights and the
public journal index — never the paper's text. `page.tsx` instruments
`fetch()` during processing and shows every request made, so this is
checkable on the page itself, not just asserted here.

## Layout

- `pipeline/` — offline data pipeline (Python, `uv`). Fetches OpenAlex
  journal/paper data, builds the journal index. Never runs in production;
  its output (`web/public/index/*`) is static files the browser fetches.
- `web/` — Next.js app, static export (`output: "export"` in
  `next.config.ts`) — no backend.

## Frozen decisions (Phase 0)

- Embedding model: `thenlper/gte-small` / browser: `Xenova/gte-small`,
  384 dimensions. Must stay identical for journal centroids and user
  papers — changing it means rebuilding the whole index.
- Journal index ships to the browser as int8 (not fp32): negligible
  accuracy loss (~1pp), ~4x smaller download.
