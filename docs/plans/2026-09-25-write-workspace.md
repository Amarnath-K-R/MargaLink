# Paper-writing workspace (`/write`) — Implementation Plan

> **For agentic workers:** executed natively (superpowers:executing-plans), one commit per task,
> `cd web && npm run check` green before every commit. Steps use `- [ ]` checkboxes.

**Goal:** a `/write` page where a researcher writes a LaTeX paper in the browser — from a journal's
template, an uploaded zip, or a blank article — with a code editor, an in-browser TeX Live
compiler, a PDF preview, per-device storage with zip backup, and figures dropped in from the
figure studio. Nothing from the manuscript leaves the tab.

**Architecture:** OPFS holds each project as a folder (`projectStore.ts`). A Worker
(`public/texWorker.mjs`) loads the unmodified, MIT-licensed BusyTeX engine from our Cloudflare R2
asset host and compiles a project's files in memory (`texRunner.ts` owns its lifecycle;
`texLog.ts` turns the log into line-anchored errors). CodeMirror edits; an `<iframe>` shows the
PDF. A template catalogue maps journals to bundled LPPL templates or to the publisher's page.

**Tech stack:** Next.js static export, OPFS (`navigator.storage.getDirectory`), CodeMirror 6 +
`@codemirror/legacy-modes` (stex), `fflate` (zip), BusyTeX WASM (busytex.wasm + TeX Live data
packs) on Cloudflare R2, Playwright smoke, `node`-run `*.selfcheck.ts`.

**Spec:** `docs/superpowers/specs/2026-09-25-write-workspace-design.md`.

## Global Constraints

- Privacy rule 1: no request on `/write` carries any project file, text or PDF; every request is a
  bodyless GET for the engine, a data package or a template. `useNetworkTrace` proves it on the page.
- No AGPL code: only the MIT BusyTeX release assets and its MIT `busytex_pipeline.js`; never
  `texlyre-busytex`, never SwiftLaTeX.
- Engine assets live on R2 under a versioned prefix; nothing over 25 MB enters `public/`.
- New npm deps limited to `codemirror`, `@codemirror/*` (incl. `legacy-modes`) and `fflate`.
- `src/lib/` flat, camelCase, `.ts` imports; every pure module has a `*.selfcheck.ts`; browser-only
  modules (OPFS, Worker) take their platform objects as parameters so the selfcheck can pass fakes.
- Storage is per device: the page always shows the "saved in this browser" banner with an export.
- Commits: `Write (n/9): <what>`; push; never merge to `main`.

## Review Focus

1. **Clearing site data or a browser eviction loses every project** → the banner is always visible,
   `navigator.storage.persist()` was requested, and an unsaved edit is never lost (autosave within
   1 s of typing stops). Pinned in Task 3 (store selfcheck: autosave debounce writes the last
   content) and the smoke (banner present).
2. **A compile that never ends** (a looping macro) → terminated at 90 s, the editor usable again,
   the next compile succeeds on a fresh worker. Pinned in Task 4 (runner selfcheck with a fake
   worker).
3. **A template zip with a nested top-level folder** (`elsarticle-template/main.tex`) → import
   flattens one level and finds the main file (`\documentclass` line) instead of failing. Pinned in
   Task 5 (zip/import selfcheck).
4. **A paper whose packages aren't in the loaded packs** (`\usepackage{siunitx}` → science pack)
   → the missing package is named in the error list with the pack that would provide it, and the
   next compile loads it. Pinned in Task 2 (texLog: `File 'siunitx.sty' not found` →
   `missing-package`) and Task 4 (worker passes the pack list).
5. **A figure added from the studio while the editor has the file open** → the file tree refreshes
   and "Insert figure" lists it; no overwrite of an unsaved edit in another file. Pinned in Task 7.

---

## File structure

| File | Responsibility |
|---|---|
| `web/scripts/publish_busytex.sh` (new) | Downloads the BusyTeX WASM release assets and uploads them to the R2 bucket under `/busytex/<release>/` (`wrangler r2 object put`); prints the public base URL. |
| `web/src/lib/texEngine.ts` (new) | `ENGINE_BASE_URL`, `ENGINE_RELEASE`, `DATA_PACKS` (name → js/data files, approximate size), `packsFor(usepackages)`. Pure. |
| `web/src/lib/texLog.ts` (new) | `parseTexLog(log): TexDiagnostic[]`. Pure. |
| `web/src/lib/zip.ts` (new) | `zipFiles(entries)` / `unzipFiles(bytes)` via fflate; `flattenSingleRoot`. Pure. |
| `web/src/lib/projectStore.ts` (new) | Projects in OPFS: list/create/open/delete, read/write/rename/delete files, `project.json`, `exportZip`, `importZip`, `findMainTex`. Takes a `DirectoryHandle`-shaped interface. |
| `web/src/lib/texRunner.ts` (new) | Worker lifecycle: `compileProject(files, opts, onProgress)`, timeouts, stale-id drops, `TexCompileError`. |
| `web/public/texWorker.mjs` (new) | Loads `busytex_pipeline.js` from R2, mounts files, runs the pipeline, returns pdf/log/aux. |
| `web/src/lib/templateCatalog.ts` (new) | `loadTemplates()`, `templateForJournal(meta)`, `starterProject(template, journal)`. |
| `web/public/templates/templates.json`, `web/public/templates/<id>/…` (new) | Catalogue + bundled LPPL templates (`elsarticle`, `ieeetran`, `acmart`, `apa7`, `article`). |
| `web/src/app/write/page.tsx`, `layout.tsx`, `_components/ProjectList.tsx`, `FileTree.tsx`, `LatexEditor.tsx`, `PdfPane.tsx`, `Diagnostics.tsx`, `TemplatePicker.tsx`, `StorageBanner.tsx` (new) | The page. |
| `web/src/app/figures/_components/AddToPaper.tsx` (new), `ExportBar.tsx` (modify) | "Add to a paper" from the figure studio. |
| `web/scripts/check_write.mjs` (new) | Smoke. |
| `web/src/app/privacy/page.tsx`, `CLAUDE.md`, `docs/ARCHITECTURE.md`, `README.md` | Docs. |

## Contracts

```ts
// texEngine.ts
export const ENGINE_RELEASE = "2024-02-16";
export const ENGINE_BASE_URL = "https://assets.margalink.pages.dev/busytex/2024-02-16"; // set in Task 1
export type DataPack = { name: string; js: string; data: string; mb: number; provides: RegExp };
export const DATA_PACKS: DataPack[]; // texlive-basic (always), latex-base, latex-recommended, latex-extra, science, fonts-recommended
export function packsFor(tex: string): string[]; // names of packs beyond basic that the \usepackage lines need

// texLog.ts
export type TexDiagnostic = { kind: "error" | "warning" | "missing-package"; file: string | null; line: number | null; message: string; pack?: string };
export function parseTexLog(log: string, packs?: DataPack[]): TexDiagnostic[];

// zip.ts
export type ZipEntry = { path: string; data: Uint8Array };
export function zipFiles(entries: ZipEntry[]): Uint8Array;           // store mode is fine (fflate zipSync level 0)
export function unzipFiles(bytes: Uint8Array): ZipEntry[];
export function flattenSingleRoot(entries: ZipEntry[]): ZipEntry[];  // "x/main.tex" → "main.tex" when every entry shares one root folder

// projectStore.ts — platform objects passed in, so node tests use a fake
export type DirHandle = { getDirectoryHandle(name: string, o?: { create?: boolean }): Promise<DirHandle>; getFileHandle(name: string, o?: { create?: boolean }): Promise<FileHandle>; removeEntry(name: string, o?: { recursive?: boolean }): Promise<void>; entries(): AsyncIterable<[string, DirHandle | FileHandle]>; kind: "directory" };
export type FileHandle = { getFile(): Promise<{ arrayBuffer(): Promise<ArrayBuffer>; text(): Promise<string> }>; createWritable(): Promise<{ write(d: Uint8Array | string): Promise<void>; close(): Promise<void> }>; kind: "file" };
export type ProjectMeta = { id: string; name: string; main: string; engine: "pdftex" | "xetex"; journalId: string | null; templateId: string | null; createdAt: string; updatedAt: string };
export class ProjectStore {
  constructor(root: DirHandle);
  static async open(): Promise<ProjectStore>;                      // navigator.storage.getDirectory() → "margalink-write"
  list(): Promise<ProjectMeta[]>;
  create(meta: Omit<ProjectMeta, "id" | "createdAt" | "updatedAt">, files: ZipEntry[]): Promise<ProjectMeta>;
  remove(id: string): Promise<void>;
  files(id: string): Promise<string[]>;                            // paths, recursive
  read(id: string, path: string): Promise<Uint8Array>;
  readText(id: string, path: string): Promise<string>;
  write(id: string, path: string, data: Uint8Array | string): Promise<void>; // touches updatedAt
  rename(id: string, from: string, to: string): Promise<void>;
  deleteFile(id: string, path: string): Promise<void>;
  meta(id: string): Promise<ProjectMeta>; setMeta(id: string, patch: Partial<ProjectMeta>): Promise<void>;
  exportZip(id: string): Promise<Uint8Array>;
  importZip(name: string, bytes: Uint8Array, journalId?: string | null): Promise<ProjectMeta>; // flattens one root; main = findMainTex
}
export function findMainTex(entries: { path: string; text: string | null }[]): string | null; // the .tex containing \documentclass, preferring main.tex

// texRunner.ts
export type CompileRequest = { files: ZipEntry[]; main: string; engine: "pdftex" | "xetex"; bibtex: boolean | null; packs: string[] };
export type CompileResult = { pdf: Uint8Array | null; log: string; exitCode: number; aux: ZipEntry[]; diagnostics: TexDiagnostic[] };
export type TexStage = "loading-engine" | "loading-package" | "running";
export function compileProject(req: CompileRequest, onProgress?: (s: TexStage, detail?: string) => void): Promise<CompileResult | null>; // null = superseded
export const COMPILE_TIMEOUT_MS = 90_000;
export class TexCompileError extends Error { code: "timeout" | "load_failed" | "worker_failed"; }

// worker protocol (public/texWorker.mjs)
// → {type:"compile", id, files:[{path, data:Uint8Array}], main, engine, bibtex, packs}
// ← {type:"progress", id, stage, detail} … {type:"result", id, pdf, log, exitCode, aux:[{path,data}]} | {type:"error", id, code, detail}

// templateCatalog.ts
export type Template = { id: string; name: string; publisher: string; engine: "pdftex" | "xetex"; main: string; licence: string; source: string; bundled: boolean; publisherUrl: string | null; files?: string[] };
export async function loadTemplates(): Promise<Template[]>;
export function templateForJournal(host: string | null, templates: Template[]): Template | null; // "Elsevier BV" → elsarticle, "Institute of Electrical…" → ieeetran, "Association for Computing Machinery" → acmart, else null
export async function starterProject(t: Template, journal: { id: string; display_name: string } | null): Promise<ZipEntry[]>; // fetches bundled files; fills the sample's title/journal comment
```

---

### Task 0: Commit the spec and plan

- [ ] Commit `Write (0/9): design and plan`; push.

### Task 1: Host the engine on R2

**Files:** create `web/scripts/publish_busytex.sh`, `web/src/lib/texEngine.ts`, `web/src/lib/texEngine.selfcheck.ts`.

- [ ] Prerequisite (manual, owner): an R2 bucket `margalink-assets` in the Cloudflare account, a public custom domain or `r2.dev` URL, and a CORS rule allowing `GET` from `https://margalink.pages.dev`, `https://*.margalink.pages.dev` and `http://localhost:3000`. `wrangler` is already installed; `wrangler r2 bucket create margalink-assets`.
- [ ] `publish_busytex.sh`: downloads the 17 assets of release `build_wasm_4499aa69fd3cf77ad86a47287d9a5193cf5ad993_7936974349_1` into a scratch dir, verifies sizes, uploads each with `wrangler r2 object put margalink-assets/busytex/2024-02-16/<name> --file … --content-type …` (`application/wasm`, `application/javascript`, `application/octet-stream`), and prints the base URL. Idempotent.
- [ ] `texEngine.ts`: constants + `DATA_PACKS` with `provides` regexes (basic: always; latex-recommended: `\b(geometry|graphicx|hyperref|booktabs|caption|natbib|xcolor|amsmath)\b`; latex-extra: `\b(siunitx|cleveref|todonotes|multirow|algorithm2e|tikz|pgfplots|listings|enumitem|subcaption)\b`; science: `\b(siunitx|physics|chemfig|mhchem)\b`; fonts-recommended: `\b(times|helvet|courier|mathptmx|txfonts|lmodern|fontenc)\b`), `packsFor(tex)` returns the union of matching packs' names (excluding basic). Selfcheck: `packsFor("\\usepackage{siunitx}\n\\usepackage{graphicx}")` → `["latex-recommended","latex-extra","science"]` sorted; a paper with no packages → `[]`.
- [ ] Manual gate: `curl -I https://<base>/busytex/2024-02-16/busytex.wasm` returns 200 with `access-control-allow-origin` for the site; a browser `fetch` from `localhost:3000` succeeds.
- [ ] Commit `Write (1/9): BusyTeX engine hosted on R2; pack resolution`.

### Task 2: `texLog.ts`

- [ ] Failing selfcheck on real log excerpts (four fixtures inline): (1) `! Undefined control sequence.\nl.42 \undefinedcommand` with a preceding `(./main.tex` open-paren → `{kind:"error", file:"main.tex", line:42, message:"Undefined control sequence"}`; (2) `! LaTeX Error: File 'siunitx.sty' not found.` → `{kind:"missing-package", message:"siunitx.sty not found", pack:"science"}` (via `DATA_PACKS`); (3) `LaTeX Warning: Citation 'smith2020' on page 3 undefined on input line 88.` → warning, line 88; (4) `Overfull \hbox (12.3pt too wide) in paragraph at lines 10--12` → warning, line 10; (5) file tracking through nested parens `(./sections/intro.tex … ! Missing $ inserted. … l.7` → file `sections/intro.tex`; (6) `Emergency stop` → error; (7) an empty log → `[]`.
- [ ] Implement: a paren-stack file tracker (push on `(./path`, pop on `)`, ignoring parens inside messages by only counting a `(` that starts a path token), the `!`-line + `l.N` pairing, the warning regexes. Cap at 200 diagnostics.
- [ ] Commit `Write (2/9): TeX log → line-anchored diagnostics`.

### Task 3: `zip.ts` + `projectStore.ts`

**Files:** add deps `fflate`, then the two modules and selfchecks; an in-memory `DirHandle` fake in `projectStore.selfcheck.ts`.

- [ ] `npm i fflate` (MIT, already in the tree). `zip.ts` selfcheck: round-trip of a text file, a binary file (1,000 random bytes) and a nested path; `flattenSingleRoot` strips `paper/` when every entry starts with it and leaves mixed roots alone.
- [ ] `projectStore` selfcheck against the fake: create → list shows it with `createdAt`; `write`/`readText` round-trip; `write` bumps `updatedAt`; nested paths create folders; `rename`, `deleteFile`; `remove` deletes the folder; `exportZip` → `importZip` reproduces the file list and contents; `importZip` with a single root folder flattens it and sets `main` from `findMainTex` (Review Focus 3); `findMainTex` prefers `main.tex`, else the file with `\documentclass`, else null; a debounced `autosave(id, path, text)` helper writes the last value once (Review Focus 1).
- [ ] Implement. `ProjectStore.open()` requests `navigator.storage.persist()` (ignored when unavailable).
- [ ] Commit `Write (3/9): projects in OPFS, zip backup and import`.

### Task 4: `public/texWorker.mjs` + `texRunner.ts`

- [ ] Worker: `importScripts`-free module that `import()`s `${ENGINE_BASE_URL}/busytex_pipeline.js` (it defines `BusytexPipeline`; if the release's pipeline isn't an ES module, load it with a `fetch` + `new Function` shim inside the worker — the file is MIT and unmodified; document which). Constructs the pipeline once with the R2 URLs (`busytex.js`, `busytex.wasm`, all data-pack `.js` URLs, preload `texlive-basic` + `latex-base`); on `compile`, converts `files` to the pipeline's `{path, contents}` form (text for `.tex/.bib/.cls/.sty/.bst`, bytes for the rest), runs `pipeline.compile(files, main, bibtex, "info", driver, packs)` with `driver = engine === "xetex" ? "xetex_bibtex8_dvipdfmx" : "pdftex_bibtex8"`, and replies with `pdf`, `log`, `exitCode` and the aux files read back from MEMFS (`.aux`, `.bbl`, `.blg`, `.toc`, `.out`, `.lof`, `.lot`). Progress from the pipeline's `print` callback mapped to stages. Messages are queued one at a time.
- [ ] Runner: like `figureRunner.ts` — id-routed pending map, `COMPILE_TIMEOUT_MS` armed on `started`, superseded compiles resolve `null`, terminate + respawn on timeout, `TexCompileError` codes, `parseTexLog` applied to the result. Selfcheck with a fake worker: overlapping compiles (older → null), timeout terminates and the next compile gets a fresh worker (Review Focus 2), `load_failed` from the worker becomes a `TexCompileError`, progress stages forwarded, `packs` passed through (Review Focus 4).
- [ ] Browser proof (temporary Playwright script, not committed): compile `\documentclass{article}\begin{document}Hello\end{document}` on `npm run dev` → a PDF of > 1 KB; record first-compile time and download size in the commit message.
- [ ] Commit `Write (4/9): the TeX worker and its runner`.

### Task 5: Template catalogue

**Files:** `web/public/templates/templates.json`, `web/public/templates/{elsarticle,ieeetran,acmart,apa7,article}/…`, `web/scripts/fetch_templates.sh`, `web/src/lib/templateCatalog.ts` (+ selfcheck).

- [ ] `fetch_templates.sh`: downloads from CTAN (`https://mirrors.ctan.org/macros/latex/contrib/<pkg>.zip`) and keeps only `.cls`, `.sty`, `.bst`, `.def`, the licence file and one sample `.tex`/`.bib` per template (elsarticle: `elsarticle.cls`, `elsarticle-num.bst`, `elsarticle-template.tex`; IEEEtran: `IEEEtran.cls`, `IEEEtran.bst`, `bare_jrnl.tex`; acmart: `acmart.cls`, `ACM-Reference-Format.bst`, `sample-acmsmall.tex`; apa7: `apa7.cls`, `apa.bst`, a minimal sample). `article`: a hand-written `main.tex` + `refs.bib`. Each folder ≤ 2 MB; total well under the file count budget.
- [ ] `templates.json`: the five bundled + link-only entries for Springer Nature (`sn-jnl`, `https://www.springernature.com/gp/authors/campaigns/latex-author-support`), SAGE, Taylor & Francis, Wiley, PLOS, MDPI, Frontiers with `bundled:false`, `publisherUrl`, `engine`.
- [ ] `templateCatalog.ts` + selfcheck: `templateForJournal("Elsevier BV")` → elsarticle; `"Institute of Electrical and Electronics Engineers"` → ieeetran; `"Springer Nature"` → the sn-jnl link-only entry; unknown → null; `starterProject` (with a stubbed `fetch`) returns the bundled files plus `main.tex` whose `% Journal: <name>` comment and title placeholder are filled.
- [ ] Commit `Write (5/9): template catalogue with bundled LPPL classes`.

### Task 6: The page

**Files:** `web/src/app/write/page.tsx`, `layout.tsx`, `_components/*` as in the file structure; `npm i codemirror @codemirror/legacy-modes`.

- [ ] `ProjectList`: projects from the store (name, updated, main), "New from template" (`TemplatePicker`: bundled templates as cards, link-only publishers with their link + "Upload the zip", `?journal=` preselects), "Import zip", open/delete. `StorageBanner` always shown with "Download backup".
- [ ] Workspace: `FileTree` (list, create file/folder, rename, delete, upload file → `write`), `LatexEditor` (CodeMirror 6, stex mode, gutter markers from diagnostics, Ctrl/Cmd+S → save + compile, autosave 1 s), `PdfPane` (`<iframe src=blobUrl>`, last good PDF kept, "Download PDF"), `Diagnostics` (list; click → open file + line; raw log in a `<details>`), a status line for compile stages incl. the first-run "~140 MB" notice, engine select (pdfTeX/XeTeX) in a small settings row, "Insert figure" (lists `figures/*` and inserts the snippet). `useNetworkTrace` + `NetworkTracePanel` with copy: "These fetch the TeX engine, packages and templates. Nothing from your paper is ever sent."
- [ ] Phone (`< 768px`): the project list and each project's last PDF; an "Editing needs a larger screen" note.
- [ ] `check_write.mjs` (persistent profile): new project from `ieeetran` → compile → `iframe[src^="blob:"]` present and the PDF blob > 10 KB → type `\undefinedcommand` into `main.tex` → save → a gutter marker on that line and a Diagnostics entry naming it → remove → recompile clean → "Download backup" → import the zip as a new project → same file list → the storage banner is present → zero body-carrying requests. Manual gate: hand-upload a Springer Nature zip, switch to XeTeX, compile.
- [ ] Commit `Write (6/9): the /write page — editor, preview, diagnostics, templates, backup`.

### Task 7: Figures in

**Files:** `web/src/app/figures/_components/AddToPaper.tsx`, `ExportBar.tsx` (a button next to Export), `write/_components/LatexEditor.tsx` (Insert figure).

- [ ] `AddToPaper`: lists projects from `ProjectStore`; on pick: `exportFigure` at 300 dpi PDF → `store.write(id, "figures/<slug>.pdf", bytes)`; snippet `\begin{figure}[t]\centering\includegraphics[width=\linewidth]{figures/<slug>.pdf}\caption{…}\label{fig:<slug>}\end{figure}` to the clipboard with a toast. The editor's file tree re-reads the folder when the page regains focus (Review Focus 5; no open-file overwrite: only the tree refreshes).
- [ ] Smoke addition (in `check_figures.mjs` or `check_write.mjs`): with a project present, "Add to a paper" writes `figures/figure.pdf`, and `/write` lists it under Insert figure.
- [ ] Commit `Write (7/9): figures from the studio into a paper`.

### Task 8: Docs and privacy copy

- [ ] `CLAUDE.md` (the `/write` line under "In practice"; R2 named as a public-asset origin), `docs/ARCHITECTURE.md` (a "/write" section: engine choice and licence reasoning, R2 hosting, OPFS storage, folder-map rows), `web/src/app/privacy/page.tsx` (writing: compiled in the browser; stored on this device; export to back up), `README.md` row, homepage `PathwaysSection` link.
- [ ] Commit `Write (8/9): docs and privacy copy`.

### Task 9: Whole-branch review

- [ ] Push; one fresh reviewer over `Write (0/9)^..HEAD` with the Review Focus list and the privacy invariant; fix; `npm run check`, `npm run smoke`. Commit `Write (9/9): review fixes`.

## Verification (end to end)

1. `cd web && npm run check` — selfchecks: `texEngine`, `texLog`, `zip`, `projectStore`, `texRunner`, `templateCatalog`.
2. `npm run smoke` — `check_write.mjs` (real engine from R2, cached), the existing suites unchanged.
3. Manual: R2 CORS from the deployed site; first-run download notice; a Springer Nature zip with XeTeX; DevTools shows only GETs on `/write`.

## Risks and deferred

- **First-run size (~140 MB) and RAM (~100 MB):** the page says so before the first compile; a
  metered connection gets the choice. If it proves too heavy in practice, a trimmed `texlive-basic`
  (fonts subset) is the lever.
- **Engine age:** the WASM release is Feb 2024 (TeX Live 2023-era Ubuntu packs). A newer paper's
  package may be missing; the missing-package diagnostic names it. Rebuilding BusyTeX is possible
  (Emscripten) but is its own project.
- **OPFS quirks:** Safari's OPFS writes need `createWritable` support (Safari 17+); the page checks
  and shows "your browser can't save projects" rather than failing silently.
- Deferred: AI writing help; co-editing; cloud sync; SyncTeX; DOI lookup; Typst.
