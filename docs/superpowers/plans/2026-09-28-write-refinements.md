# /write refinements — Implementation Plan

> Written 2026-09-28 during an overnight run ("go into plan mode and see how we can improve this
> writing page — more features, more intuitive, more user friendly; no questions, finish it").
> Kept as a document instead of interactive plan mode: leaving plan mode waits for approval, which
> would have stalled the run. Executed natively, one commit per task, `npm run check` green before
> each; a task that changes behaviour a smoke covers updates that smoke. Never merge to `main`.

**Goal:** make the full-screen workspace the place a researcher actually writes in — less LaTeX to
remember, faster navigation, fewer surprises — without adding anything that leaves the device.

**Constraints:** the three privacy rules (nothing here sends anything anywhere; all of it is local
UI over the project's own files); no new npm dependencies (CodeMirror's autocomplete and commands
ship with `codemirror`); the clay theme (`app/clay.css`); the smokes' selectors stay stable or are
updated in the same commit.

## What a writer gets

1. **A formatting bar on the source sheet** (replaces the bare file label): the file name, then
   Bold · Italic · Section ▾ (section / subsection / subsubsection / paragraph) · Bulleted list ·
   Numbered list · Inline maths · Equation · Footnote · Cite ▾ (the project's .bib keys, searchable)
   · Ref ▾ (the project's labels) · Figure ▾ (figures/) · Table (a rows × columns grid picker) ·
   Comment. Buttons wrap the selection (or insert a placeholder and select it). Shortcuts:
   Mod-B, Mod-I, Mod-/ (comment), Mod-Shift-8 (itemize). Shown only when a .tex file is open.
2. **Suggestions while typing**: `\cite{` / `\citep{` / `\citet{` / `\parencite{` / `\textcite{`
   offer .bib keys (with the entry's title as detail); `\ref{` / `\eqref{` / `\autoref{` / `\cref{`
   offer labels; `\begin{` offers environments (and closes them); `\` + letters offers common
   commands. Keys and labels come from the files already in memory (`sources`) — no reparse on
   every keystroke, no remount.
3. **An outline** beside the files: the left slab gets two tabs, Files and Outline. Outline lists
   the paper's sectioning commands in reading order — following `\input`/`\include` one level from
   the main file — indented by level; clicking one opens its file at that line.
4. **Views**: Source · Split · PDF (a segmented control in the tray, remembered per browser) and a
   files-panel toggle. The engine choice moves to the status line (it's rarely changed), freeing the
   tray.
5. **Auto-compile** (off by default; a switch on the status line): 2 s after the last saved edit,
   compile if nothing is compiling. Remembered per browser.
6. **Whole-paper word count** on the status line (main file plus its inputs, same rough count as
   today), against the target journal's word limit when it's a pilot journal: "≈ 2,431 of 3,000
   words" with a small bar.
7. **Friendlier files**: New file and Rename are inline inputs (Enter/Escape), Delete asks in an
   inline confirm on the row — no `window.prompt`/`confirm`; dropping files on the Files slab
   uploads them (images to figures/, as the upload button does).
8. **Help that's there when needed**: a Keyboard shortcuts window (palette command, and a `?` key on
   the status line); a one-time "Getting around" card on the empty PDF sheet (the tools, ⌘K,
   suggestions after `\cite{`), dismissed for good once closed.

## Tasks

- **W1 — texSource helpers.** `texOutline(tex)` → `{level, title, line}[]` (part…subparagraph,
  starred forms, optional short titles, comments ignored); `texInputs(tex)` → the files `\input`/
  `\include`d, in order, `.tex` added when missing; `paperFiles(main, sources)` → main plus its
  inputs that exist. Selfcheck first (cases: levels, starred, `[short]{long}`, commented, inputs with
  and without extension, a missing input skipped). Commit `Write (1/7): outline and inputs helpers`.
- **W2 — formatting bar.** `EditorHandle` gains `wrap(before, after, placeholder)` and
  `insertBlock(text)`; `EditorFormatBar.tsx` (clay chips, popovers for Section/Cite/Ref/Figure/
  Table); CodeMirror keymap for Mod-B/Mod-I/Mod-Shift-8; Mod-/ is CodeMirror's toggleComment (stex
  declares `%`). Commit `Write (2/7): a formatting bar on the source`.
- **W3 — suggestions.** A completion source in `LatexEditor` reading a ref of `{keys, labels}`
  (`bibEntries` gives keys with titles). Commit `Write (3/7): suggestions for citations, labels,
  environments`.
- **W4 — outline.** Files | Outline tabs on the left slab; `Outline.tsx`; clicking uses `goto`.
  Commit `Write (4/7): the outline`.
- **W5 — views, auto-compile, word goal.** Tray view switcher + files toggle; engine select to the
  status line (keeps `aria-label="TeX engine"`); auto-compile switch; paper word count with the
  pilot limit. Commit `Write (5/7): views, auto-compile, the word goal`.
- **W6 — files.** Inline new/rename, inline delete confirm, drop-to-upload; `check_write.mjs`'s
  prompt/confirm steps become inline-input steps. Commit `Write (6/7): inline file operations`.
- **W7 — help.** Shortcuts window, first-run card, palette commands for every new action; the
  ARCHITECTURE write section and the guide get the new features. Commit `Write (7/7): shortcuts
  and first-run help`.

## Verification

`npm run check` (with W1's selfcheck) at every commit; `check_write.mjs` after W2, W4, W5, W6 with
new steps: bold wraps a selection; typing `\cite{` shows a .bib key; the outline jumps to a section;
PDF-only view hides the editor and back; inline New file creates and refuses an existing name.
Each task is also checked in the browser (screenshots) before its commit.

## Deferred

SyncTeX (PDF ↔ source), snapshots/history, DOI → BibTeX (a network lookup: needs its own consent
design), spell check (the browser's flags every command), co-editing.
