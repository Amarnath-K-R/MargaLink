"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { autosaver, type ProjectMeta, type ProjectStore } from "@/lib/projectStore";
import { compileProject, TexCompileError, type TexStage } from "@/lib/texRunner";
import { packsFor } from "@/lib/texEngine";
import type { TexDiagnostic } from "@/lib/texLog";
import FileTree from "./FileTree.tsx";
import LatexEditor, { type EditorHandle, type LineMark } from "./LatexEditor.tsx";
import PdfPane from "./PdfPane.tsx";
import Diagnostics from "./Diagnostics.tsx";
import StorageBanner from "./StorageBanner.tsx";
import { downloadBytes, safeName } from "./download.ts";

const TEXT = /\.(tex|bib|cls|sty|bst|txt|md|def|cfg)$/i;
const IMAGE = /\.(png|jpe?g|pdf|eps)$/i;
const FIRST_RUN_KEY = "margalink-tex-cached";

const STAGE_TEXT: Record<TexStage, (d?: string) => string> = {
  "loading-engine": () => "Loading TeX…",
  "loading-package": (d) => (d === "all" ? "This template needs more of TeX Live — loading it (about 110 MB, once)…" : "Loading TeX packages…"),
  running: (d) => `Running ${d ?? "TeX"}…`,
};

const figureSnippet = (path: string) => {
  const label = path.replace(/^.*\//, "").replace(/\.[^.]+$/, "").replace(/[^\w-]/g, "-");
  return `\\begin{figure}[t]\n  \\centering\n  \\includegraphics[width=\\linewidth]{${path}}\n  \\caption{Caption.}\n  \\label{fig:${label}}\n\\end{figure}\n`;
};

// One open project: files on the left, the source editor in the middle, the
// PDF on the right, the compiler's diagnostics under the editor.
export default function Workspace({ store, project, onClose, onMeta }: { store: ProjectStore; project: ProjectMeta; onClose: () => void; onMeta: (m: ProjectMeta) => void }) {
  const [files, setFiles] = useState<string[]>([]);
  const [active, setActive] = useState(project.main);
  // The open file's text as loaded; the editor mounts once it's here.
  const [doc, setDoc] = useState<{ path: string; text: string } | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState<TexDiagnostic[]>([]);
  const [log, setLog] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [firstRun, setFirstRun] = useState(() => {
    try {
      return localStorage.getItem(FIRST_RUN_KEY) !== "1";
    } catch {
      return true;
    }
  });
  const editor = useRef<EditorHandle | null>(null);
  const saver = useMemo(() => autosaver((id, path, t) => store.write(id, path, t)), [store]);

  const refresh = useCallback(async () => setFiles(await store.files(project.id)), [store, project.id]);

  const open = useCallback(
    async (path: string) => {
      await saver.flush();
      setActive(path);
      setDoc(TEXT.test(path) ? { path, text: await store.readText(project.id, path) } : null);
    },
    [saver, store, project.id],
  );

  useEffect(() => {
    void store.files(project.id).then(setFiles);
    void store.readText(project.id, project.main).then((text) => setDoc({ path: project.main, text }));
    void store.lastPdf(project.id).then((pdf) => pdf && setPdfUrl(URL.createObjectURL(new Blob([pdf.slice()], { type: "application/pdf" }))));
    // A figure added from the figure studio shows up when the page regains focus.
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    const onHide = () => void saver.flush();
    window.addEventListener("pagehide", onHide);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("pagehide", onHide);
      void saver.flush();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per project
  }, [project.id]);

  useEffect(() => () => void (pdfUrl && URL.revokeObjectURL(pdfUrl)), [pdfUrl]);

  const compile = useCallback(async () => {
    await saver.flush();
    setBusy(true);
    setError(null);
    try {
      const paths = await store.files(project.id);
      const entries = await Promise.all(paths.map(async (path) => ({ path, data: await store.read(project.id, path) })));
      const mainText = new TextDecoder().decode(entries.find((e) => e.path === project.main)?.data ?? new Uint8Array());
      const result = await compileProject(
        { files: entries, main: project.main, engine: project.engine, bibtex: null, packs: project.packs?.length ? project.packs : packsFor(mainText) },
        (stage, detail) => setStatus(STAGE_TEXT[stage](detail)),
      );
      if (!result) return; // a newer compile took over
      setDiagnostics(result.diagnostics);
      setLog(result.log);
      if (result.pdf) {
        setPdfUrl(URL.createObjectURL(new Blob([result.pdf.slice()], { type: "application/pdf" })));
        void store.saveLastPdf(project.id, result.pdf);
        setStatus("Compiled.");
      } else {
        setStatus(null);
        setError(result.diagnostics.find((d) => d.kind !== "warning")?.message ?? "The compile failed — see the log below.");
      }
      try {
        localStorage.setItem(FIRST_RUN_KEY, "1");
      } catch {
        // storage blocked — the first-run notice just shows again
      }
      setFirstRun(false);
    } catch (err) {
      setStatus(null);
      setError(err instanceof TexCompileError ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [saver, store, project]);

  const marks: LineMark[] = diagnostics
    .filter((d) => d.line && (d.file ?? project.main) === active)
    .map((d) => ({ line: d.line!, message: d.message, severity: d.kind === "warning" ? "warning" : "error" }));

  const figures = files.filter((f) => f.startsWith("figures/") && IMAGE.test(f));

  const setEngine = async (engine: ProjectMeta["engine"]) => {
    await store.setMeta(project.id, { engine });
    onMeta(await store.meta(project.id));
  };

  const backup = async () => downloadBytes(`${safeName(project.name)}.zip`, await store.exportZip(project.id), "application/zip");

  return (
    <div data-testid="workspace">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <button type="button" onClick={onClose} className="text-sm text-accent hover:underline">
          ← All projects
        </button>
        <h2 className="font-serif text-xl font-medium">{project.name}</h2>
        <div className="ml-auto flex flex-wrap items-center gap-3 text-sm">
          <label className="flex items-center gap-1.5 text-ink-soft">
            Engine
            <select aria-label="TeX engine" value={project.engine} onChange={(e) => void setEngine(e.target.value as ProjectMeta["engine"])} className="rounded-sm border border-line bg-paper px-1.5 py-1">
              <option value="pdftex">pdfLaTeX</option>
              <option value="xetex">XeLaTeX</option>
            </select>
          </label>
          <button
            type="button"
            onClick={() => void compile()}
            disabled={busy}
            className="rounded-sm border border-line bg-paper-alt px-4 py-1.5 hover:border-accent disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? "Compiling…" : "Compile"}
          </button>
        </div>
      </div>
      <div className="mb-3">
        <StorageBanner onBackup={() => void backup()} />
      </div>
      {firstRun && !busy && (
        <p className="mb-3 text-sm text-ink-soft">
          The first compile downloads the TeX engine (about 140 MB). Your browser keeps it, so later compiles take a second or two.
        </p>
      )}
      <p data-testid="compile-status" className="mb-2 min-h-5 text-sm text-ink-soft" aria-live="polite">
        {status}
      </p>

      <p className="mb-3 text-sm text-ink-soft md:hidden">Editing needs a larger screen — here is this project&apos;s last compiled PDF.</p>
      <div className="grid gap-4 md:grid-cols-[12rem_minmax(0,1fr)_minmax(0,1fr)]">
        <div className="hidden md:block">
          <FileTree
            files={files}
            active={active}
            main={project.main}
            onOpen={(p) => void open(p)}
            onCreate={async (p) => {
              await store.write(project.id, p, "");
              await refresh();
              void open(p);
            }}
            onUpload={async (list) => {
              for (const f of Array.from(list)) {
                const path = IMAGE.test(f.name) ? `figures/${f.name}` : f.name;
                await store.write(project.id, path, new Uint8Array(await f.arrayBuffer()));
              }
              await refresh();
            }}
            onRename={async (from, to) => {
              await saver.flush();
              await store.rename(project.id, from, to);
              await refresh();
              if (active === from) void open(to);
            }}
            onDelete={async (p) => {
              await store.deleteFile(project.id, p);
              await refresh();
              if (active === p) void open(project.main);
            }}
          />
          {figures.length > 0 && (
            <label className="mt-4 flex flex-col gap-1 text-xs text-ink-soft">
              Insert figure
              <select
                aria-label="Insert figure"
                value=""
                onChange={(e) => e.target.value && editor.current?.insert(figureSnippet(e.target.value))}
                className="rounded-sm border border-line bg-paper px-1.5 py-1 text-sm text-ink"
              >
                <option value="">Choose…</option>
                {figures.map((f) => (
                  <option key={f} value={f}>
                    {f.replace(/^figures\//, "")}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        <div className="hidden min-w-0 md:block">
          {!TEXT.test(active) ? (
            <p className="rounded-sm border border-line p-4 text-sm text-ink-soft">{active} isn&apos;t a text file — it&apos;s used by your paper as it is.</p>
          ) : doc?.path === active ? (
            <div className="h-[70vh]">
              <LatexEditor
                key={doc.path}
                text={doc.text}
                marks={marks}
                onChange={(t) => saver(project.id, doc.path, t)}
                onSave={() => void compile()}
                handleRef={editor}
              />
            </div>
          ) : (
            <div className="h-[70vh] rounded-sm border border-line" />
          )}
          {error && <p className="mt-2 text-sm text-red-700 dark:text-red-400">{error}</p>}
          <div className="mt-3">
            <Diagnostics
              items={diagnostics}
              log={log}
              onOpen={async (file, line) => {
                const target = file ?? project.main;
                if (target !== active && files.includes(target)) await open(target);
                if (line) setTimeout(() => editor.current?.goto(line), 0);
              }}
            />
          </div>
        </div>
        <div className="h-[70vh] min-w-0">
          <PdfPane url={pdfUrl} name={`${safeName(project.name)}.pdf`} />
        </div>
      </div>
    </div>
  );
}
