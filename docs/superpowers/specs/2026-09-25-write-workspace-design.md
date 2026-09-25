# Paper-writing workspace (`/write`) — Design

> Brainstormed 2026-09-25 with the product owner. Sub-project 1 of the paper-writing tool: the LaTeX
> workspace. AI writing help and richer figure automation are later sub-projects with their own specs.

## Context

MargaLink takes a researcher from a draft to a submission: match a journal, check the paper's
structure against its rules, get it reviewed, make its figures. The one step missing is *writing and
typesetting the paper itself* — today that happens in Overleaf or a local TeX install, and journals
increasingly want a LaTeX submission in their own template. The owner wants a full writing
environment inside MargaLink: pick the journal's template (or upload one), write in a code editor,
see the compiled PDF beside it, and later get AI writing help and figures dropped in from the
figure studio.

The product's three privacy rules apply unchanged. A real TeX engine can run in the browser
(TeX Live compiled to WebAssembly), so the manuscript never has to leave the tab — the whole
workspace fits rule 1 with no new exception.

## Decisions (locked with the product owner)

1. **Job:** a full writing environment ("write the whole paper here"), not only a format-my-draft
   step.
2. **Storage:** in the browser only (per device), with `.zip` export/import. No accounts, no sync.
   Rule 2 stays intact.
3. **Collaboration:** single author per device for now. Real-time co-editing is a later project.
4. **AI in the editor:** none in this sub-project. Whole-paper checks stay with the review tool.
5. **Engine:** the MIT-licensed BusyTeX core (TeX Live compiled to WebAssembly), with its MIT
   pipeline script, hosted by us. Not the AGPL wrappers (TeXlyre BusyTeX, SwiftLaTeX): MargaLink
   is proprietary (no LICENSE file) and an AGPL library linked into the page could oblige us to
   open-source it. The compiled TeX programs (GPL/LPPL) run as a separate program in a worker,
   exchanged with by messages only — the same footing as any site that runs LaTeX.
6. **Templates:** bundle the publisher classes that are on CTAN under LPPL (Elsevier `elsarticle`,
   `IEEEtran`, ACM `acmart`, `apa7`, a blank article); for publishers that distribute only from
   their own sites (Springer Nature `sn-jnl`, SAGE, Taylor & Francis, Wiley, PLOS, MDPI,
   Frontiers) the catalogue links to the publisher page and the user uploads the zip.

## Section 1 — Shape and storage

**A new page, `/write`.** A researcher opens a project (from a template, from an uploaded zip, or a
blank article), edits `.tex`/`.bib` files in a code editor, and sees the compiled PDF beside it.
Everything, including compilation, runs in the tab.

**A project is a folder.** Files (`main.tex`, `refs.bib`, figures, the template's `.cls`/`.bst`)
live in the browser's Origin Private File System (OPFS), one directory per project under
`/margalink-write/<projectId>/`, with `project.json` `{id, name, main, engine: "pdftex"|"xetex",
journalId, templateId, createdAt, updatedAt}`. OPFS persists across sessions on that device and
handles binary files.

**Backup is the user's job, and the page says so.** `.zip` export and import (store-mode zip via
`fflate`); a banner: "Saved in this browser on this device. Download a backup before clearing site
data or switching machines." Autosave on every edit (debounced); `navigator.storage.persist()` is
requested so the browser won't evict the data under pressure.

**Nothing new leaves the device.** No accounts, no sync. The network panel shows bodyless GETs for
the engine, packages and templates, and nothing else.

**Devices:** desktop and laptop browsers. On a phone the page opens a project's last PDF read-only;
editing isn't offered.

## Section 2 — The compiler in the browser

**The engine is BusyTeX, unmodified, hosted by us.** From the `build_wasm_4499aa…` release
(2024-02-16): `busytex.js` (0.3 MB), `busytex.wasm` (30.4 MB), `busytex_worker.js`,
`busytex_pipeline.js`, and the data packages `texlive-basic` (104.6 MB), `ubuntu-texlive-latex-base`
(5.7), `-latex-recommended` (9.1), `-latex-extra` (49.5), `-science` (9.3), `-fonts-recommended`
(10.3), each a `.js` + `.data` pair. Hosted in a Cloudflare R2 bucket under a versioned prefix
(`/busytex/2024-02-16/…`) on our own subdomain with a CORS rule for the site's origins. Cloudflare
Pages' 25 MB per-file cap and jsDelivr's size limits rule out `public/` and the CDN.

**The worker.** `public/texWorker.mjs` (plain JS, un-bundled, like `figureWorker.mjs`) imports the
pipeline from the R2 URL and answers `{type:"compile", id, files, main, engine, bibtex}` with
`{type:"result", id, pdf, log, exitCode, aux}` or `{type:"error", id, code, detail}`; progress
messages report `loading-engine`, `loading-package <name>`, `running <cmd>`. `files` is the
project folder read from OPFS; the pipeline mounts them in MEMFS and runs
`xelatex → bibtex8 → xelatex → xelatex → xdvipdfmx` (or `pdflatex → bibtex8 → pdflatex →
pdflatex`). Data packages load lazily from the paper's `\usepackage` lines. Aux files (`.aux`,
`.bbl`, `.toc`, `.out`) come back and are written to OPFS so later compiles are incremental.

**Errors become something readable.** `texLog.ts` (pure) turns the log into
`{file, line, message, kind: "error"|"warning"|"missing-package"}` entries — `! Undefined control
sequence` + `l.42`, `LaTeX Error: File 'x.sty' not found`, `Citation … undefined`, `Overfull
\hbox` — so the editor marks lines and the raw log stays behind a disclosure.

**Timeouts and memory.** A compile over 90 s terminates the worker (TeX can loop on a bad macro);
the next compile respawns it. The runtime needs ~100 MB of RAM plus the packages; the page states
the first-time download (~140 MB) before it starts.

**Engine per project:** pdfTeX by default; XeTeX where a template needs system fonts (some Springer
Nature ones). LuaTeX exists in the build but isn't offered.

## Section 3 — Editor, preview, templates

**Editor:** CodeMirror 6 with the `stex` legacy mode (both MIT; a new dependency, justified: a
LaTeX editor is the product). Line numbers, bracket matching, search, undo history per file, a
gutter marker per `texLog` error/warning with the message on hover, Ctrl/Cmd+S = save + compile.
A file tree on the left (create/rename/delete files and folders; upload files such as images and
`.bib`); the editor in the middle; the PDF on the right.

**Preview:** the compiled PDF as a blob URL in an `<iframe>` (the browser's own viewer: zoom,
search, print) — no pdf.js page rendering to maintain. The last good PDF stays visible when a
compile fails, with the error list under the editor (click → jump to line). Compile runs on save
and on an explicit button; a status line shows the stage ("Loading TeX (first time, ~140 MB)",
"Running pdflatex (2/3)").

**Templates:** `public/templates/templates.json` lists each template `{id, name, publisher,
engine, main, licence, source, bundled: boolean, publisherUrl}`; bundled ones ship their files
under `public/templates/<id>/` (only what a paper needs: `.cls`, `.bst`, `.sty`, a sample
`main.tex` and `refs.bib`). `templateCatalog.ts` maps a journal (its `host_organization_name` from
`meta.json`) to a template id, so `/write?journal=<id>` (linked from a match result and from
`/journal/[id]`) preselects it. Non-bundled publishers show "Download the template from
<publisher>, then upload the zip here". The blank article template carries the journal's word
limits from `journalRules` as comments when known.

**Import/export:** upload a `.zip` (a publisher template or an Overleaf export) → a new project;
"Download backup" → `.zip` of the project; "Download PDF".

## Section 4 — Figures in, privacy, testing

**Figures from the figure studio:** the studio gains "Add to a paper": pick a project → the
figure's PDF (export at 300 dpi, journal width) is written to `figures/<name>.pdf` in that
project's OPFS folder (same origin, shared storage) with a `\begin{figure}…\includegraphics…`
snippet copied to the clipboard. In the editor, "Insert figure" lists the project's `figures/` and
inserts the snippet at the cursor. No new data path: both pages already live on the device.

**Privacy:** no new exception. `CLAUDE.md` gains a line: `/write` compiles in the browser; the only
requests are bodyless GETs for the engine, packages and templates from our R2 asset host. The
privacy page's "what leaves" section says so, and names the storage promise (on this device only,
export to back up). The network panel on `/write` lists every request, as on `/match`.

**Testing:** selfchecks for `texLog` (real log excerpts), `projectStore` (against an in-memory
directory-handle fake: create/open/list/delete, file round-trips, `project.json`), `zip` (export →
import round-trip incl. a binary file), `templateCatalog` (journal → template, non-bundled →
publisher link), `texRunner` (fake worker: timeouts, stale ids, progress). Smoke `check_write.mjs`
with a persistent browser profile (the ~140 MB engine cached across runs): new project from the
IEEE template → compile → PDF frame present → introduce `\undefinedcommand` → gutter marker on
that line → fix → recompile → export zip → import as a new project → identical file list →
`/write` made zero body-carrying requests. Manual gates: the R2 host serves the engine with CORS
from the deployed site; a Springer Nature zip uploaded by hand compiles with XeTeX; the first-run
download banner appears once.

**Deferred (own specs):** AI writing help (passage-level, consented); real-time co-editing;
sync to the user's own cloud; SyncTeX (click PDF → source); a DOI → BibTeX lookup (a network
request that reveals what you cite, so opt-in); Typst.
