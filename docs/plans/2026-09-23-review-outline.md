# Review outline: real heading detection + user-confirmed outline — Implementation Plan

> **For agentic workers:** executed natively (superpowers:executing-plans), one commit per task, `cd web && npm run check` green before every commit.

**Goal:** Give the multi-pass review a correct section outline for every paper — from the document's own structure where it has one (DOCX heading styles, PDF heading fonts), with the user able to see and fix the outline before consenting — so findings carry the right section labels, tiers pick the right sections, and the cross-check sees the paper's real shape.

**Why (from a real run, 2026-09-23):** `Wearables_Review_Final.docx`, a narrative review with custom headings ("Wave I: Proof of Concept", "Equity and Governance", …), was split into "Abstract / Introduction (part 1–5) / Conclusion (part 1–2)". Every section was reviewed (9 of 9), but the middle of the paper was labelled "Introduction", the appendix "Conclusion", and a quick review would have skipped almost everything. The DOCX has 21 styled headings (h1 + h2) that `mammoth.extractRawText` discards. Probes on three real PDFs showed the same structure is recoverable from fonts: BMC uses `GillSans-Bold` (sections) / `GillSans-BoldItalic` (subsections); JACC puts every heading, and nothing else, in one dedicated font (`AdvOT5b669f61` @ 8pt vs 7.7pt body); JCSM uses a `.B` font with UPPERCASE top level and an 11pt subsection level. The font pass costs ~130–200 ms for 10–24 pages.

**Decisions**
1. Structure comes from the document, not a word list, whenever the document has it. The existing vocab regexes stay as the fallback for structureless text (and still decide each heading's *kind*).
2. A heading that isn't in the vocab (e.g. "Wave III: Hard Clinical Outcomes") becomes its own section of a new kind **`body`** — included by every tier — instead of being swallowed by the previous section.
3. Outline editing is optional and happens before consent: the user sees the detected outline, can change a section's kind, merge a section into the previous one, **exclude a section from sending**, and add a heading by typing it exactly as it appears. Nothing about the outline leaves the device.
4. Required manual entry and DOCX-only uploads were considered and rejected (friction; excludes LaTeX/PDF authors).
5. Heading detection runs only for `/review` (opt-in flag on `extractFromFile`); `/match` is unchanged.

## Interfaces

```ts
// reviewTypes.ts
export const SECTION_KINDS = ["abstract","introduction","methods","results","discussion","body","references","supplement","other"] as const;
export type HeadingHint = { text: string; level: 1 | 2 };   // text exactly as the extracted line reads (pre-normalization)

// extract.ts
export type ExtractedPaper = { text: string; fullText: string; headings?: HeadingHint[] };
export async function extractFromFile(file: File, opts?: { headings?: boolean }): Promise<ExtractedPaper>;

// headingHints.ts (new, pure, selfchecked)
export type LineFontInfo = { text: string; font: string; size: number; wholeLine: boolean }; // dominant font/size of the line; wholeLine = every non-space char in that font
export function pickPdfHeadings(lines: LineFontInfo[]): HeadingHint[];
export function pickDocxHeadings(html: string): HeadingHint[];

// reviewSections.ts
export function splitIntoSections(text: string, hints?: HeadingHint[]): Section[];
export type OutlineEdits = {
  kinds: Record<number, SectionKind | "excluded">; // keyed by Section.charStart (stable across re-splits)
  merged: number[];                                  // charStarts of sections merged into their predecessor
  addedHeadings: string[];                           // exact heading lines the user typed
};
export function buildOutline(text: string, hints: HeadingHint[] | undefined, edits: OutlineEdits):
  { sections: Section[]; excluded: Section[]; unmatchedHeadings: string[] };

// reviewOrchestrator.ts
RunReviewOptions gains `sections?: Section[]` and `excluded?: Section[]` (planState uses them instead of re-splitting text);
excluded sections appear in coverage.skipped with title suffix " (excluded by you)" and are never sent.
```

## Algorithms

**PDF (`pickPdfHeadings`)** — per line: dominant real font name (via `page.getOperatorList()` then `page.commonObjs.get(item.fontName).name`), max size, `wholeLine`.
1. Body signature = the (font, size) with the most characters.
2. Candidate = `wholeLine`, text 2–90 chars, starts with a letter or a numbering prefix, no terminal period/comma, not mostly digits, font signature ≠ body, **and the next non-empty line is in the body signature** (kills figure labels, table headers and bold reference fragments, which are followed by more of their own font). A line whose font name contains `Italic` without `Bold` is never a candidate.
3. Keep only signatures that produce ≥2 candidates (a heading style is used more than once).
4. Levels: the signature whose candidates match the vocab (Methods/Results/…) most often is level 1; if none match, the signature with the largest size (tie: UPPERCASE text) is level 1. Every other kept signature is level 2.

**DOCX (`pickDocxHeadings`)** — `mammoth.convertToHtml`: `<h1>` → level 1, `<h2>`–`<h6>` → level 2. Only if there are **zero** styled headings: whole-bold short paragraphs *outside tables* (`<p><strong>…</strong></p>` not inside `<table>`) followed by a non-bold paragraph become level-2 hints.

**Sectioning with hints** — normalize hint text and each line the same way (`normalizeText`, trim, collapse spaces, case-insensitive). If there are ≥2 level-1 hints, **only hint lines are headings** (a body-font line reading "methods" can no longer start a section); a level-1 hint gets its vocab kind if it matches, else `body`; a level-2 hint is a subsection boundary used by the chunker (existing `splitAtSubsections` also accepts hint lines, so chunk titles read "Wave III: Hard Clinical Outcomes · Cluster 2: Changing the Endpoint"). With <2 level-1 hints, fall back to today's vocab behaviour, with any level-2 hints still used as chunk boundaries. The existing abstract-merges-forward, short-section merge, `HEAD_CHARS`, letter-spaced and capital-start rules are unchanged.

**Outline edits** — `buildOutline` = split with `hints ∪ addedHeadings (as level 1)` → apply `merged` → apply `kinds` → separate `excluded`. Added headings not found as a line are returned in `unmatchedHeadings` so the UI can say "couldn't find that line".

## Tasks

### Task 1: `headingHints.ts` — pure heading pickers (+ selfcheck)
Selfcheck cases, built from the probed shapes: (a) BMC-like lines (Bold sections, BoldItalic subsections, bold table header lines followed by more bold lines, bold reference fragments) → exactly the section/subsection headings with the right levels; (b) JACC-like: one dedicated heading font at 8 vs body 7.7, a figure font whose lines are followed by same-font lines → only the headings; (c) JCSM-like: `.B` font, UPPERCASE level 1 at 10pt, Title-case level 2 at 11pt → levels correct; (d) single-use bold line → not a heading; (e) italic-only font lines → never; (f) DOCX html with h1/h2 → hints in order with levels; (g) DOCX with no styles, bold paragraphs inside a table + two standalone bold lines each followed by prose → only the two, level 2.

### Task 2: `extract.ts` emits hints for `/review` only
PDF: in the existing per-item loop, track per-line dominant font/size/wholeLine; call `getOperatorList()` per page only when `opts.headings`. DOCX: `convertToHtml` alongside `extractRawText` only when `opts.headings`. `/review`'s `onFile` passes `{ headings: true }`; `/match` untouched. Proof: a scratch Node probe (not committed) prints hints for the three PDFs and `Wearables_Review_Final.docx` — expect the 21 DOCX headings, BMC's Background/Methods/…/Conclusion + BoldItalic subsections, JACC's METHODS/RESULTS/DISCUSSION/CONCLUSIONS, JCSM's uppercase + 11pt subsections.

### Task 3: hint-aware sectioning + `body` kind
`SECTION_KINDS` gains `body`; `TIER_PLAN` adds `body` to all three tiers; server validation picks it up via `SECTION_KINDS`. `splitIntoSections(text, hints)` per the algorithm; `chunkSections` treats level-2 hint lines as subsection boundaries. Selfcheck: the wearables outline (synthetic text with the 21 headings) → Abstract, other (Journal Submission Guidelines), Introduction, 3× body (Waves I–III), body (Wave IV), 2× body, discussion (Conclusion), supplement (Appendix); a body-font "methods" line with hints present is not a heading; <2 level-1 hints → identical output to today (all existing cases still pass). Zero-cost probe on the four real documents printing `id | kind | title | chars`.

### Task 4: `buildOutline` + orchestrator takes sections
Pure edits application keyed by `charStart`; `runReview` accepts `sections`/`excluded`; excluded chunks never POSTed and listed in coverage as "(excluded by you)". Selfcheck: kind override changes tier planning; merge joins text and removes the boundary; exclude removes the chunk from every request body (assert no POST body contains its text); added heading splits a section; unmatched heading reported; edits survive a re-split (keyed by charStart).

### Task 5: Outline UI before consent
`review/_components/OutlineEditor.tsx`: collapsed "Detected outline · 12 sections · Edit" row above the review button; expanded list of `title · words` with a kind `<select>` (Abstract, Introduction, Methods, Results, Discussion, Body, Supplement, References, Other, **Don't send**), a "Merge into previous" button, and an "Add a heading" input (with the unmatched-line message). Page state holds `hints` + `edits`; `passCount` and `runReview` use `buildOutline`. Changing the outline resets any in-progress result (like changing tier). Consent copy adds "N sections you excluded won't be sent." Smoke (`check_review.mjs`): outline visible with the fixture's sections; set one section to "Don't send" → consent count drops by one and no request body contains that section's first line; add a heading that doesn't exist → message shown.

### Task 6: Docs + zero-cost verification
`docs/ARCHITECTURE.md` review section: where headings come from (DOCX styles, PDF heading fonts, vocab fallback), the `body` kind, the outline step, excluded sections never sent. Privacy page bullet: "You can exclude any section before sending; excluded sections never leave your device." Final zero-cost check: run the Task 2/3 probe on all four documents and record the outlines in the commit message; no paid API calls are needed for this plan (sectioning is local; the pass contract only gains the `body` kind).

## Verification
- `npm run check` (all selfchecks incl. `headingHints`, `reviewSections`, `reviewOrchestrator`) and `npm run smoke` green.
- Wearables DOCX outline matches its 21 styled headings; BMC/JACC/JCSM outlines match the probed heading lines.
- Manual: `/review` with the wearables DOCX → outline shows the Waves; exclude "Appendix" → consent count drops; (optional, paid) a review shows findings labelled by Wave.

## Risks
- PDFs whose headings use the body font with no size/weight difference (rare; some preprints) → no hints → today's vocab fallback, and the outline editor is the escape hatch.
- Multi-column PDFs where a heading's next line in extraction order is a different column's figure text → that heading can be missed; the editor covers it.
- `getOperatorList()` on very large PDFs (100+ pages) may take ~1–2 s; acceptable for an opt-in review, measured in Task 2.
