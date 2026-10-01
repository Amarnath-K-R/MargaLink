# Documentation pages — Implementation Plan

> Written 2026-09-28 during the overnight run ("a proper documentation page that documents the
> architecture of everything for developers and reviewers, and a how-to-use page for users, with
> visuals for each tool and every option in each tool, rich illustrations matching our theme").
> Same execution rules as the write refinements plan: one commit per task, `npm run check` green,
> checked in the browser before each commit, never merge to `main`.

**Goal:** two pages in the clay theme — `/guide` for people using MargaLink, `/architecture` for the
people building and reviewing it — accurate to the code as it is, and cheap to keep accurate.

## Decisions

1. **Two routes, not one.** The audiences want different things: a user wants "what do I click and
   what happens"; a reviewer wants "where does data go and why is that safe". Both are static pages
   (server components), linked from the header tray ("Guide") and from each other; the homepage stays
   high-level (a footer link only).
2. **Real screenshots for "how", drawn illustrations for "what".** Every step and option is shown
   on a screenshot of the actual UI, so it can't drift into fiction; each tool also gets a small
   clay illustration (inline SVG, the homepage palette, soft warm shadows) that says what the tool is
   for at a glance.
3. **Screenshots are generated, with their callouts.** `scripts/guide_shots.mjs` (Playwright, run
   against the dev server with the local index) drives each tool to the state a section needs,
   captures element screenshots as JPEG (quality 82) into `public/guide/`, and writes
   `public/guide/shots.json` with each callout's position as a percentage of its image (from the
   target element's bounding box). The page draws numbered clay markers from that JSON, so a
   re-run after a UI change moves the markers with the UI. Budget: ≤ 40 images, ≤ 5 MB total.
4. **Every option in a table beside its screenshot**: the control's name as it appears on screen,
   what it does, its default, and whether anything leaves the device (only Review's send and
   Figures' Ask Claude ever do — marked in the "leaves this device" colour, as in the app).
5. **The architecture page renders its diagrams as inline SVG components** (system overview; the
   privacy boundary; the match pipeline; the review passes; the figure worker; the writing hub),
   with text distilled from `docs/ARCHITECTURE.md` and `CLAUDE.md` — the markdown stays the source
   for contributors; the page is the tour. A "Reviewing a change" checklist closes it.

## /guide — sections

- **Getting around**: the tray (tools, privacy, guide), what stays on the device, the two opt-in
  exceptions and what their notices look like.
- **Browse journals**: search, field filter, cards, chips (OA, MEDLINE, fee, speed), a journal's
  page, "Write a paper for this journal".
- **Match your paper**: upload vs paste; the on-device steps; What we read (and correcting it);
  filters (field, fee, speed, open access, MEDLINE); a result card — fit pill (strong / possible /
  weak), chips, Why this journal (topic bars, citations, closest cluster), Check against rules, AI
  review link, Write for this journal; the format check rows.
- **Get it reviewed**: attach; the pilot journals; the structural check; depth (quick / standard /
  thorough); the detected outline (section types, merge, add heading, Don't send); the consent
  notice (request count, stripping, limits); progress, cancel, resume/retry; reading the review
  (journal fit, fix these first, inconsistencies, statistical reporting, citations, coverage).
- **Make figures**: attach; check how it was read (header row, decimal mark, thousands separator,
  missing markers, sheet, stack columns, column types); describe to Claude (and the notice, group
  labels, what is sent, custom tweaks); templates (all of them, from the gallery); adjust (journal
  style, size, width/height, palette and custom colours, layout rows/columns, panel letters, shared
  legend; panels; chart types; columns; title; axes; group order; overlays; statistics and tests;
  annotations; panel options); export (formats, dpi, downloads), recipes, Add to a paper.
- **Write your paper**: projects and templates (bundled vs publisher links, importing a zip,
  backups); the workspace tray; files and outline; the source (formatting bar, suggestions,
  shortcuts); the PDF; compiling (engines, auto-compile, diagnostics, first-run download); the
  windows (Match, Review, Figures, Checks, Journal) and what each reads; the command palette; views;
  the status line; storage and backups.
- **Troubleshooting**: first compile is slow; a missing package; the review limit; "Compile first";
  "Couldn't find that passage"; where projects live and how to move them.

## /architecture — sections

System overview (static site + two Pages Functions + public R2 assets + Anthropic); the three
privacy rules and how each is enforced in code; per tool: data flow diagram, key modules, what
crosses the network; the writing workspace (OPFS, TeX worker, the hub's shared hooks, windows);
the clay design system (tokens, classes, where they live); folder map; `lib/` conventions; testing
(`npm run check`, the selfchecks, the Playwright smokes and what each covers); deployment; a
reviewer's checklist (privacy, consent paths, network calls, tests, docs).

## Tasks

- **D1 — shared docs chrome.** `components/docs/` (DocLayout with a sticky clay contents list,
  Callout markers over a screenshot, OptionTable, Illustration frame); "Guide" in the tray.
- **D2 — screenshots script.** `scripts/guide_shots.mjs` + the first run's images and JSON.
- **D3 — /guide.** All sections above, with the tool illustrations.
- **D4 — /architecture.** All sections above, with the diagrams.
- **D5 — links and copy.** Footer links (homepage, privacy, tools), README/ARCHITECTURE pointers,
  sitemap entries.

## Verification

`npm run check`; a smoke (`check_docs.mjs`): both pages load without errors, every image in
`shots.json` exists and every callout lies inside its image, every in-page anchor resolves, and
no request with a body is made. Screenshots of both pages at 1440 and 390 wide, looked at.
