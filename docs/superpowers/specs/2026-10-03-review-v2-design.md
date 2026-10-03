# AI review v2: a section-by-section review worth its price

Status: design approved by the owner, 2026-10-03. Replaces the review's
multipass design (`docs/plans/2026-09-23-review-multipass.md`); the outline
(`docs/plans/2026-09-23-review-outline.md`) stays.

## Context

A thorough review (10 M coins, about $0.90-1.20 to the user) came back
repetitive, unstructured and thin. It had about 10 distinct points, most
repeated 2-4 times across "Fix these first", "Inconsistencies",
"Statistical reporting" and "Other observations". There was no
section-by-section review, and nothing on design, methods, argument,
limitations or overclaiming. The owner asked for the prompts and the
architecture to be redesigned so a paying user gets the best review we can
give.

### Root causes

1. **Only numbers are reviewed.**
   - Each section call (`reviewPrompt.ts`, extract) pulls out numeric
     claims, statistical-reporting slips and at most 5 one-line notes.
   - The final call (synthesize) never sees the paper: only the abstract,
     the outline and that ledger.
   - So "thorough" means more numbers, never a review of each section's
     substance.
   - Product plan §7 (structure and clarity by section, reporting
     checklists, readability) was never built (multipass plan, Decision 3).
2. **Repetition is built into the report.**
   - "Statistical reporting" shows every extract finding unfiltered
     (`reviewOrchestrator.ts:152-158`).
   - "Fix these first" restates some of them in new words.
   - Results and Conclusion each report the same issue.
   - Nothing deduplicates by meaning.
3. **Thin by instruction.**
   - "ONE concise sentence per description".
   - No why, no suggested fix.
   - Notes are capped at 5 per section.
   - Other observations are bare strings with no quote.
4. **A self-inflicted finding.** `stripIdentifyingInfo` (`review.ts:19`)
   replaces author lines with "[redacted]". The model then reports a
   "redacted placeholder" in the paper.
5. **Overconfidence.** "A pooled AUC should fall within the fold range" is
   stated as an error, but it can fall below every fold when score scales
   differ between folds. Nothing asks for a legitimate explanation first,
   or for a doubt to be put as a question.

### Numbers

- **Coin value:** $0.09-0.12.
- **Prices for the first 50k characters (and each further 50k):** quick 4
  (+2), standard 6 (+3), thorough 10 (+5).
- **Model:** `claude-sonnet-5`, $2/M input and $10/M output.
- **Measured today:** $0.12-0.32 and 41-142 s per review (39k-103k chars).
- **Input is cheap** (a 60k-character paper is about 15k tokens, $0.03).
  Output and thinking are the cost.

## Decisions (owner, 2026-10-03)

- **Budget:** coin prices stay the same, and Claude may take up to about
  60% of a review's price. Ceilings per 50,000 characters, from the
  cheapest coin ($0.09):
  - quick $0.22;
  - standard $0.32;
  - thorough $0.54.
- **Context:** every request carries the whole paper, minus "Don't send"
  sections and references. It is cached with Anthropic's prompt caching,
  and each request reviews one part. Consent, privacy notice and guide say
  so.
- **Layout:** section by section, under an overview whose "Fix these first"
  links down to findings. Every finding appears exactly once.
- **Tiers:** a depth ladder (below).
- **Architecture:** section reviewers plus one editor. The report is
  assembled from ids.
- **Keeping the report:**
  - kept on the device (with the /write project; the last one on /review);
  - Download as a Markdown file, or print to PDF;
  - Copy.

## Design

### Passes

Every request has the same layout:
- one shared system prompt (the reviewer's rules);
- then the paper as one cached block (`cache_control`);
- then the pass's own instruction (not cached).

All three tools are listed in every request, in one fixed order. That way
every pass shares one cached prefix (tools, system, paper). The
instruction names the tool to call, and a call to any other tool counts as
malformed output, which is retried.

1. **Section pass:** one per reviewed section (one per subsection at
   thorough).
   - It reviews ONE section against a checklist for its kind, reading the
     rest of the paper for context.
   - It returns:
     - `verdict` (1-2 sentences);
     - `findings[]`;
     - `keyNumbers[]`: up to 15 sample sizes, primary outcomes and headline
       metrics, each `{measure, quote}`.
   - The first section pass runs alone and writes the cache. The rest run
     4 at a time.
2. **Checklist pass:** thorough only. It runs alongside the sections, after
   the first.
   - It picks the reporting guideline for the study type from a fixed list:
     CONSORT, STROBE, PRISMA, STARD, TRIPOD+AI, CARE, ARRIVE, SRQR, CHEERS,
     SPIRIT, or none (with why).
   - It returns only the items missing or partly reported, each as
     `{item, status: missing|partial, section, note, quote?}`.
   - Items are named, never given invented item numbers.
3. **Editor pass:** last, once.
   - It reads the paper, every finding by id (title, severity, why, quotes,
     section) and every section's keyNumbers.
   - It returns:
     - `overview`: 4-6 sentences on what the paper does and its main
       strengths and weaknesses.
     - `strengths[]`: up to 3.
     - `journalFit`: good, possible or poor, with why.
     - `fixFirst`: finding ids, ranked. 3-5 at quick, 3-8 otherwise.
     - `duplicates`: groups of ids. One is kept, in the section where the
       fix belongs.
     - `verdicts` (standard and thorough), for each major finding: `keep`;
       `soften`, with a new title and a why put as a question; or `drop`,
       with a reason.
     - `acrossPaper[]` (standard and thorough) findings:
       - numbers that disagree between sections (at least 2 quotes);
       - an abstract that doesn't match the results;
       - conclusions that go beyond the results;
       - methods that are never reported, or results that were never
         described.

### Tiers

| | Sections reviewed | Findings | Editor | Extra |
|---|---|---|---|---|
| Quick | abstract, results, discussion/conclusion, body | major + the most important minor, up to 4 per section | low effort; no verdicts, no across-paper findings | – |
| Standard | every section but references and supplement | major + minor, up to 8 per section | medium; verdicts on majors; across-paper findings | – |
| Thorough | + supplement; each subsection of 2,000+ chars on its own | major, minor and suggestions, up to 12 per section | high; verdicts on majors; across-paper findings | checklist pass |

Effort and `max_tokens` per pass and tier are set from the live check, so
each tier stays under its ceiling.

### Prompts and findings

- **Finding shape** (strict tool schema):
  - `title`: at most 12 words.
  - `severity`:
    - `major`: a reviewer would doubt a result or conclusion;
    - `minor`: should be fixed;
    - `suggestion`: would improve the paper.
  - `category`: design, analysis, reporting, consistency, claims, clarity,
    or figures and tables.
  - `quotes`: 0-3, verbatim, from any section.
  - `why`: 1-3 sentences.
  - `suggestion`: 1-3 sentences on what to do, never rewritten text.
  - `question`: true when the point is a doubt to clarify, not an error.
  - `missing`: true when the point is about something absent. It may quote
    the nearest passage.
- **Checklist per section kind** (in the instruction):
  - Title and front matter: the title matches the study.
  - Abstract: aim, design, main result with numbers, a conclusion that
    matches the results.
  - Introduction: the gap, prior work, the aim, the contribution.
  - Methods: design, data and eligibility, sample size, splits and
    leakage, outcomes, the analysis plan, missing data, multiplicity,
    reproducibility.
  - Results: every planned analysis reported, effects with uncertainty,
    tables and figures, no interpretation.
  - Discussion and conclusion: claims supported, limitations, causal
    language, generalisability, comparison with prior work.
- **Calibration:**
  - Before calling something an error, look in the paper for a legitimate
    explanation. If one is plausible, put the point as a question.
  - A wrong finding is worse than a missing one. Don't fill space.
- **No repeats:** a section pass reports a problem in the section where it
  should be fixed. It may quote other sections as evidence.
- **Our marker:**
  - The system prompt says that lines reading "[redacted]" were removed by
    MargaLink to hide names and emails, and must never be commented on.
  - The server also drops any finding whose only quote is the marker.
- **Unchanged rules:**
  - The untrusted-text rule stays as it is today.
  - No comments on word count or required statements; the on-device
    checks own those.
  - No acceptance prediction.
  - No em dashes in what Claude writes. Any that slip through are shown as
    a comma, as Rewrite does with notes.
- **Grounding:**
  - Every quote must be found in the request's paper text, using
    `reviewGrounding.ts`'s normalisation. A quote that isn't found is
    removed.
  - A finding left with no quotes is dropped, unless it is `missing`.
  - Editor ids must exist, duplicate groups must not overlap, and the
    `fixFirst` ids must survive.

### The report

- **Assembly** (in the browser, from ids):
  1. Apply duplicates (keep one).
  2. Apply verdicts: `soften` replaces the title and why; `drop` removes
     the finding.
  3. Render.

  This way a finding can appear in only one place.
- **Layout:**
  - **Overview:** the overview text, strengths, journal fit, and Fix these
    first as numbered links (severity, title, section).
  - **Section by section:** one collapsible block per section, with its
    title, counts and verdict, then its findings. Each finding shows its
    quotes with Jump to source, why it matters and the suggestion.
  - **Across the paper:** the across-paper findings and, at thorough, the
    checklist (the guideline, why it applies, and the missing and partial
    items).
  - **Coverage**, e.g. "Reviewed 9 of 10 sections; 2 findings set aside on
    a second look", and the AI disclaimer as today.
- **Progressive:**
  - Section blocks fill in as their passes return.
  - The overview and Fix these first appear when the editor finishes.
- **Keep:**
  - /write saves the last review with the project (OPFS, beside the paper;
    included in backups) and reopens it in the Review window.
  - /review keeps the last report in this browser (`localStorage`, wrapped
    in try/catch), with "Forget this report".
- **Download:** a Markdown file, and "Print or save as PDF" (a print
  stylesheet).
- **Copy:** the same text, to the clipboard.
- **Sectioning fix:**
  - Headings like "3.Results:-" are recognised: a trailing ":-", ":", "-"
    or ".", and numbering with no space before the word.
  - Results no longer folds into the section before it.

### Money, limits and wording

- **Price:**
  - Same formula and coins. Every section sent is billed, which now means
    every included section at every tier, since the whole paper is the
    context.
  - Quick and standard cost a little more on papers with long skipped
    sections.
  - "Don't send" still lowers the price.
  - The pricing copy says all of this.
- **Ticket:**
  - `/api/review/start` takes every included chunk `{id, chars}` and the
    ids to review.
  - The ticket's chunk map records which ids are reviewed.
  - The checklist pass is tracked like a section, with its own id, tries
    and delivery, so no migration is needed.
  - Passes are:
    - one per reviewed section, with 4 tries each;
    - the editor;
    - the checklist (thorough only).
  - Each pass checks its paper block against the ticket: the ids, and
    lengths no longer than what was paid for.
  - The body limit is raised to 2 MB.
- **Refunds:**
  - The price is shared across the passes: each reviewed section by its
    length, and the editor and the checklist as an average reviewed
    section.
  - Undelivered parts are refunded by the sweep, as today.
  - For two hours after deploy, the sweep reads both the old and the new
    ticket shape.
- **Activity log:** it records cache write and read tokens, and `PRICES`
  gains their rates (1.25x and 0.1x input), so /admin shows the true cost.
- **Wording** (with the code, on the same branch):
  - ReviewConsent:
    - several requests, each carrying the paper's text and reviewing one
      part, then an editor pass;
    - Anthropic may hold the text in memory for a few minutes, to reuse it
      between these requests.
  - The privacy notice: its row, storage and caching (`NOTICE_VERSION` goes
    from 3 to 4).
  - The guide: its section, with new screenshots from
    `scripts/docs/guide_shots.mjs`.
  - Pricing, refunds and terms (the parts).
  - TierPicker and the /review copy.
  - ARCHITECTURE.md, CLAUDE.md's exception 1, and the status of product
    plan §7.
- **Removed:**
  - the extract and synthesize passes and the ledger;
  - the Statistical reporting and Other observations buckets;
  - their prompts, tools and types.

  Tickets in flight at deploy are refunded by the sweep.

## Testing

- **Selfchecks:**
  - Prompts: the checklist per kind, the marker note, tier settings, and a
    shared prefix identical across passes.
  - Pass parsing: exact keys, the paper block against the ticket, grounding
    against the whole paper, and editor validation.
  - Orchestration: the cache-warming first pass, assembly showing each
    finding once, duplicates and verdicts applied, partial results, resume.
  - The ticket: billing, the pass budget, refunds, and old-shape sweeps.
  - Stream usage: the cache fields.
  - The report: the Markdown export.
- **Smoke** (`check_review.mjs`, with a stubbed API): the new layout,
  collapse, Jump, Download, Copy, a reload keeping the report, and /write
  reopening it.
- **e2e:** `e2e_accounts` runs start and the passes on a fresh D1.
- **Live gate** (`scripts/eval/review_live.ts`):
  - It uses the real key, with papers from a local folder that is never
    committed.
  - The papers are the owner's sample, plus open-access papers of
    different designs: a trial, a cohort study, an ML prediction study and
    a review.
  - For each tier it records:
    - the report as Markdown;
    - cost, time and passes;
    - findings by severity;
    - near-duplicate titles (there must be none);
    - findings set aside.
  - Every tier must stay under its ceiling. The owner reads v2 beside v1 on
    the same paper before merge.

## Risks

- **A wrong tool call** (with the shared tool list): treated as malformed
  and retried.
- **Cache misses** (a retry after 5 minutes, or a resume): each costs a
  fresh write. That is bounded and visible in /admin.
- **Thorough takes about 3-4 minutes:** sections render as they arrive.
- **Editor input on a long paper:**
  - The findings sent to it are capped at 200.
  - Its output is only ids and short text.
- **Quality is judged by people:** the live gate decides merge, not the
  selfchecks.
