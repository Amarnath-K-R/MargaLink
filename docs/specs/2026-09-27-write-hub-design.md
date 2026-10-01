# `/write` as the hub — Design

> Brainstormed 2026-09-27 with the product owner. The plan is
> `docs/superpowers/plans/2026-09-27-write-hub.md`.

## Context

`/write` is the product's core: a researcher should write a paper start to end and reach every
other tool from inside it. Today it is a fixed three-column page (file tree · CodeMirror · PDF
iframe) with one toolbar row (back, name, engine, Compile) and one cross-tool bridge (`/figures` →
"Add to a paper"). Match, review, figures and journals each live on their own page with their wiring
locked inside `page.tsx`.

The outcome: from one page, write → see which journals the draft fits → set a target journal → read
its rules and get its template → check format and rules → make a figure and drop it in at the
cursor → get the AI review with "jump to source", with a per-project URL, a command palette, an
Insert menu and a status bar that says plainly what (if anything) was sent.

## Decisions (locked with the product owner)

1. **The layout stays**: toolbar on top, files on the left, LaTeX and PDF side by side. Each tool
   opens in a **pop-up window** over the workspace. A window's state survives closing it (close
   Match, keep editing, reopen: results still there), so tool state lives in hooks at the Workspace
   level and a window is only a view.
2. **No AI writing helper.** The only network-sending features remain the AI review and the figure
   "Ask Claude", behind their existing consent components. The privacy page's "no AI in the editor"
   line is reworded honestly (no AI writes; the two opt-in exceptions are reachable from the hub).
3. **Paper text for Match, Review and Checks is the last compiled PDF**, fed through the existing
   `extractFromFile` pipeline. Until there is a PDF, those windows say "Compile first".
4. **The dialog is the native `<dialog>`** (`showModal()`): focus trap, Escape, `aria-modal`, focus
   restore for free; no dependency.
5. **Shortcuts**: Mod-S (save + compile, exists), Mod-K (command palette), Escape. No Mod-digit
   shortcuts (browsers reserve them for tabs).
6. **Each tool's page wiring is lifted into a hook beside the tool** (`useMatch`, `useReview`,
   `useFigures`); the standalone pages become JSX over their hook with no behaviour change; `/write`
   consumes the same hooks.
7. **"Use its template" creates a new project**, never mutates the open one.
8. **Figures inserted from the window save a data-free recipe** (`figures/<name>.figure.json`) beside
   the PDF so the figure can be reopened and regenerated.
9. Standalone tool pages remain; phones keep the read-only last PDF.

## What the user sees

**Toolbar**: ← All projects · project name (click to rename inline) · Journal chip (opens the
Journal window) · Insert (figures, table, equation, section, citations from the project's `.bib`
files, cross-references from its labels) · Tools: Match, Review, Figures, Checks, Journal · engine ·
Compile · ⌘K.

**Status bar**: compile status · errors and warnings · approximate word count of the open file ·
Saved / Unsaved edit · a "running" chip for a tool still working (click to reopen) · and, on the
right, "Nothing from this paper has been sent." or "N request(s) carried text you agreed to send."

**Windows**:

- **Match** — matches the compiled PDF on this device; results with "Set as target journal" and
  "AI review available →" (opens the Review window with that journal). "Draft changed — match
  again" once a newer PDF exists.
- **Review** — reviews against the target journal when it is one of the pilot journals, otherwise
  offers the picker; the same tier picker, outline editor, consent box and result panel as
  `/review`; each cited passage gets "Jump to source" (best-effort locate in the `.tex`).
- **Figures** — the full figure studio; "Insert into paper" writes the PDF and its recipe into
  `figures/`, and drops a `\begin{figure}` block at the cursor. Opening a `.figure.json` in the file
  tree offers "Edit in the figure studio".
- **Checks** — the format check and the target journal's rules check over the compiled PDF; instant,
  nothing sent.
- **Journal** — the target journal's details, hand-verified rules where they exist, its publisher's
  template ("Start a new paper from it"), and a search to change the target.
- **Command palette** (⌘K) — every action, filterable.

**Per-project URL**: `/write?p=<id>` reopens a project; `/write?journal=<id>` (from a match result
or a journal page) preselects the template for a new one.

## Privacy

Rule 1 is unchanged: matching and the checks read the PDF compiled on the device. The two rule-3
exceptions (review, Ask Claude) are reachable from the hub through the same consent components, and
both the trace panel and the status bar say when something was sent.
