"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { autosaver, type ProjectMeta, type ProjectStore } from "@/lib/projectStore";
import { compileProject, TexCompileError, type TexStage } from "@/lib/texRunner";
import { packsFor } from "@/lib/texEngine";
import type { TexDiagnostic } from "@/lib/texLog";
import { findJournalRules } from "@/lib/journalRules";
import type { Template } from "@/lib/templateCatalog";
import { bibKeys, citeSnippet, figureSnippet, refSnippet, SNIPPETS, texLabels, texWordCount } from "@/lib/texSource";
import type { NetworkCall } from "@/components/NetworkTrace";
import Dialog from "@/components/Dialog";
import ErrorText from "@/components/ErrorText";
import type { Journal } from "../page.tsx";
import FileTree from "./FileTree.tsx";
import LatexEditor, { type EditorHandle, type LineMark } from "./LatexEditor.tsx";
import PdfPane from "./PdfPane.tsx";
import Diagnostics from "./Diagnostics.tsx";
import StorageBanner from "./StorageBanner.tsx";
import Toolbar, { type InsertGroup, type Tool } from "./Toolbar.tsx";
import StatusBar from "./StatusBar.tsx";
import CommandPalette, { type Command } from "./CommandPalette.tsx";
import { useChecks } from "./useChecks.ts";
import { useMatch } from "@/app/match/_components/useMatch.ts";
import { useReview } from "@/app/review/_components/useReview.ts";
import { downloadBytes, safeName } from "./download.ts";

// Each window's body loads only when it opens, so the tools' code (pdf.js,
// the matching model, the figure studio) stays out of the page until asked for.
const loading = () => <p className="text-sm text-ink-soft">Loading…</p>;
const ChecksWindow = dynamic(() => import("./ChecksWindow.tsx"), { ssr: false, loading });
const JournalWindow = dynamic(() => import("./JournalWindow.tsx"), { ssr: false, loading });
const MatchWindow = dynamic(() => import("./MatchWindow.tsx"), { ssr: false, loading });

const TEXT = /\.(tex|bib|cls|sty|bst|txt|md|def|cfg)$/i;
const IMAGE = /\.(png|jpe?g|pdf|eps)$/i;
const FIRST_RUN_KEY = "margalink-tex-cached";
const SPLIT_KEY = "margalink-write-split";
const clampSplit = (v: number) => Math.min(0.75, Math.max(0.25, v));

const STAGE_TEXT: Record<TexStage, (d?: string) => string> = {
  "loading-engine": () => "Loading TeX…",
  "loading-package": (d) => (d === "all" ? "This template needs more of TeX Live — loading it (about 110 MB, once)…" : "Loading TeX packages…"),
  running: (d) => `Running ${d ?? "TeX"}…`,
};

const WINDOWS: { tool: Exclude<Tool, "palette">; title: string; size: "lg" | "full" }[] = [
  { tool: "match", title: "Match", size: "lg" },
  { tool: "review", title: "Review", size: "lg" },
  { tool: "figures", title: "Figures", size: "full" },
  { tool: "checks", title: "Checks", size: "lg" },
  { tool: "journal", title: "Journal", size: "lg" },
];

// One open project: the toolbar, files on the left, the source editor and
// the PDF side by side (the split drags), the compiler's diagnostics under
// the editor, a status line, and the other tools as windows over it all.
// `calls` is the page's network trace, for the status line's "sent" count;
// `onCreateFromTemplate` starts a new project (the Journal window offers
// the target's template that way — this project is never rewritten).
export default function Workspace({
  store,
  project,
  calls,
  templates,
  onClose,
  onMeta,
  onCreateFromTemplate,
}: {
  store: ProjectStore;
  project: ProjectMeta;
  calls: NetworkCall[];
  templates: Template[];
  onClose: () => void;
  onMeta: (m: ProjectMeta) => void;
  onCreateFromTemplate: (t: Template, journal: Journal) => void;
}) {
  const [files, setFiles] = useState<string[]>([]);
  const [active, setActive] = useState(project.main);
  // The open file's text as loaded; the editor mounts once it's here.
  const [doc, setDoc] = useState<{ path: string; text: string } | null>(null);
  const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null);
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
  const [tool, setTool] = useState<Tool | null>(null);
  // Every text file's content (the Insert menu's citation keys and labels
  // come from these); refreshed on load, on save, after a compile.
  const [sources, setSources] = useState<Record<string, string>>({});
  const [words, setWords] = useState<number | null>(null);
  const [dirty, setDirty] = useState(false);
  const [split, setSplit] = useState(() => {
    try {
      const v = Number(localStorage.getItem(SPLIT_KEY));
      return v >= 0.25 && v <= 0.75 ? v : 0.5;
    } catch {
      return 0.5;
    }
  });
  const editor = useRef<EditorHandle | null>(null);
  const busyRef = useRef(false); // Ctrl+S bypasses the disabled button: one compile at a time
  const wantedRef = useRef(project.main); // the file most recently asked for; slower reads of others are dropped
  const editSeq = useRef(0); // bumped per keystroke; a save marks clean only if nothing was typed meanwhile
  const wordsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editorCol = useRef<HTMLDivElement>(null);
  const pdfCol = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const write = useCallback(
    async (id: string, path: string, t: string) => {
      const seq = editSeq.current;
      await store.write(id, path, t);
      setSources((s) => ({ ...s, [path]: t }));
      if (editSeq.current === seq) setDirty(false);
    },
    [store],
  );
  // Created on first use (from a handler or the mount effect, never in
  // render); one per project, since Workspace remounts per project.
  const saverRef = useRef<ReturnType<typeof autosaver> | null>(null);
  const saver = useCallback(
    () => (saverRef.current ??= autosaver(write, undefined, undefined, undefined, () => setError("Couldn't save your last edit (is the disk full?). It will be retried — download a backup to be safe."))),
    [write],
  );
  // File operations report what went wrong instead of failing silently.
  const guarded = (fn: () => Promise<void>) => async () => {
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const loadSources = useCallback(
    async (paths: string[]) => {
      const texts = await Promise.all(paths.filter((p) => TEXT.test(p)).map(async (p) => [p, await store.readText(project.id, p)] as const));
      setSources(Object.fromEntries(texts));
    },
    [store, project.id],
  );
  const refresh = useCallback(async () => {
    const paths = await store.files(project.id);
    setFiles(paths);
    await loadSources(paths);
  }, [store, project.id, loadSources]);

  const open = useCallback(
    async (path: string) => {
      await saver().flush().catch(() => {}); // a failed save stays pending and is shown; switching still works
      wantedRef.current = path;
      setActive(path);
      const loaded = TEXT.test(path) ? { path, text: await store.readText(project.id, path) } : null;
      if (wantedRef.current === path) {
        setDoc(loaded);
        setWords(loaded && /\.tex$/i.test(path) ? texWordCount(loaded.text) : null);
      }
    },
    [saver, store, project.id],
  );

  useEffect(() => {
    void store.files(project.id).then((paths) => {
      setFiles(paths);
      void loadSources(paths).catch(() => {});
    }, () => {});
    void store.readText(project.id, project.main).then((text) => {
      setDoc({ path: project.main, text });
      setWords(texWordCount(text));
    });
    void store.lastPdf(project.id).then((pdf) => pdf && setPdfBytes(pdf));
    // A figure added from the figure studio shows up when the page regains focus.
    const onFocus = () => void refresh().catch(() => {});
    window.addEventListener("focus", onFocus);
    const onHide = () => void saver().flush().catch(() => {}); // a failure is shown by onError
    window.addEventListener("pagehide", onHide);
    // Hidden fires earlier than pagehide (and reliably on phones): save then.
    const onVisibility = () => document.visibilityState === "hidden" && onHide();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("pagehide", onHide);
      document.removeEventListener("visibilitychange", onVisibility);
      void saver().flush().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per project
  }, [project.id]);

  // ⌘K / Ctrl+K toggles the command palette from anywhere in the workspace.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setTool((t) => (t === "palette" ? null : "palette"));
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(SPLIT_KEY, String(split));
    } catch {
      // storage blocked — the split just isn't remembered
    }
  }, [split]);

  // The PDF as a blob URL for the preview, and as a File for the tools that read it.
  const pdfUrl = useMemo(() => (pdfBytes ? URL.createObjectURL(new Blob([pdfBytes.slice()], { type: "application/pdf" })) : null), [pdfBytes]);
  useEffect(() => () => void (pdfUrl && URL.revokeObjectURL(pdfUrl)), [pdfUrl]);
  const pdfFile = useMemo(() => (pdfBytes ? new File([pdfBytes.slice()], "paper.pdf", { type: "application/pdf" }) : null), [pdfBytes]);

  // The tools' state lives here, so a window keeps its results when closed.
  const checks = useChecks();
  const match = useMatch();
  const review = useReview();
  const rules = project.journalId ? findJournalRules(project.journalId) : undefined;
  const setTarget = async (j: Journal | null) => {
    await store.setMeta(project.id, { journalId: j?.id ?? null, journalName: j?.display_name ?? null });
    onMeta(await store.meta(project.id));
  };
  // From a match result: the Review window, loaded with this PDF against that journal.
  const openReview = (journalId: string) => {
    if (pdfFile && review.source !== pdfFile) void review.onFile(pdfFile, { journalId });
    else review.selectJournal(journalId);
    setTool("review");
  };

  const compile = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      await saver().flush();
      const paths = await store.files(project.id);
      const entries = await Promise.all(paths.map(async (path) => ({ path, data: await store.read(project.id, path) })));
      const decoder = new TextDecoder();
      setSources(Object.fromEntries(entries.filter((e) => TEXT.test(e.path)).map((e) => [e.path, decoder.decode(e.data)])));
      const mainText = decoder.decode(entries.find((e) => e.path === project.main)?.data ?? new Uint8Array());
      const result = await compileProject(
        { files: entries, main: project.main, engine: project.engine, bibtex: null, packs: project.packs?.length ? project.packs : packsFor(mainText) },
        (stage, detail) => setStatus(STAGE_TEXT[stage](detail)),
      );
      if (!result) return; // a newer compile took over
      setDiagnostics(result.diagnostics);
      setLog(result.log);
      if (result.pdf) {
        setPdfBytes(result.pdf);
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
      busyRef.current = false;
      setBusy(false);
    }
  }, [saver, store, project]);

  const onEdit = (path: string, t: string) => {
    editSeq.current++;
    setDirty(true);
    saver()(project.id, path, t);
    if (wordsTimer.current) clearTimeout(wordsTimer.current);
    wordsTimer.current = setTimeout(() => setWords(texWordCount(t)), 300);
  };

  const marks: LineMark[] = diagnostics
    .filter((d) => d.line && (d.file ?? project.main) === active)
    .map((d) => ({ line: d.line!, message: d.message, severity: d.kind === "warning" ? "warning" : "error" }));

  const figures = files.filter((f) => f.startsWith("figures/") && IMAGE.test(f));
  const texOpen = doc?.path === active && /\.tex$/i.test(active);

  const setEngine = async (engine: ProjectMeta["engine"]) => {
    await store.setMeta(project.id, { engine });
    onMeta(await store.meta(project.id));
  };
  const rename = async (name: string) => {
    await store.setMeta(project.id, { name });
    onMeta(await store.meta(project.id));
  };

  const backup = async () => downloadBytes(`${safeName(project.name)}.zip`, await store.exportZip(project.id), "application/zip");

  // Closing a window hands focus back to the editor (the dialog restores it
  // to the opener; after ⌘K that was the editor too).
  const closeTool = useCallback(() => {
    setTool(null);
    setTimeout(() => editor.current?.focus(), 0);
  }, []);

  const insertGroups = useMemo<InsertGroup[]>(() => {
    const groups: InsertGroup[] = [];
    if (figures.length) groups.push({ label: "Figures", items: figures.map((f) => ({ value: `fig:${f}`, label: f.replace(/^figures\//, "") })) });
    groups.push({
      label: "Structure",
      items: [
        { value: "snip:table", label: "Table" },
        { value: "snip:equation", label: "Equation" },
        { value: "snip:section", label: "Section" },
      ],
    });
    const keys = [...new Set(Object.entries(sources).flatMap(([p, t]) => (/\.bib$/i.test(p) ? bibKeys(t) : [])))];
    if (keys.length) groups.push({ label: "Citations", items: keys.map((k) => ({ value: `cite:${k}`, label: k })) });
    const labels = [...new Set(Object.entries(sources).flatMap(([p, t]) => (/\.tex$/i.test(p) ? texLabels(t) : [])))];
    if (labels.length) groups.push({ label: "Cross-references", items: labels.map((l) => ({ value: `ref:${l}`, label: l })) });
    return groups;
  }, [figures, sources]);

  const insert = useCallback(
    (value: string) => {
      const [kind, rest] = [value.slice(0, value.indexOf(":")), value.slice(value.indexOf(":") + 1)];
      const snippet =
        kind === "fig" ? figureSnippet(rest) : kind === "snip" ? SNIPPETS[rest as keyof typeof SNIPPETS] : kind === "cite" ? citeSnippet(rest) : refSnippet(rest);
      editor.current?.insert(snippet);
      if (kind === "fig" && !/^\s*\\usepackage(\[[^\]]*\])?\{[^}]*graphicx/m.test(sources[project.main] ?? "")) {
        setStatus("Add \\usepackage{graphicx} to the preamble to use the figure.");
      }
    },
    [sources, project.main],
  );

  // Built when the palette opens (it calls this), not on every render.
  const commands = useCallback(
    (): Command[] => [
      { id: "compile", label: "Compile", hint: "⌘S", run: () => void compile(), disabled: busy },
      ...WINDOWS.map((w) => ({ id: w.tool, label: `Open ${w.title}`, run: () => setTool(w.tool) })),
      ...(["table", "equation", "section"] as const).map((s) => ({ id: `snip-${s}`, label: `Insert ${s}`, run: () => insert(`snip:${s}`), disabled: !texOpen })),
      ...figures.map((f) => ({ id: `fig-${f}`, label: `Insert figure ${f.replace(/^figures\//, "")}`, run: () => insert(`fig:${f}`), disabled: !texOpen })),
      { id: "backup", label: "Download backup", run: () => void backup() },
      { id: "pdf", label: "Download PDF", run: () => pdfBytes && downloadBytes(`${safeName(project.name)}.pdf`, pdfBytes, "application/pdf"), disabled: !pdfBytes },
      { id: "pdftex", label: "Switch to pdfLaTeX", run: () => void setEngine("pdftex"), disabled: project.engine === "pdftex" },
      { id: "xetex", label: "Switch to XeLaTeX", run: () => void setEngine("xetex"), disabled: project.engine === "xetex" },
      { id: "projects", label: "All projects", run: onClose },
    ],
    [compile, busy, insert, texOpen, figures, backup, pdfBytes, project.name, project.engine, setEngine, onClose],
  );

  const journalLabel = project.journalName ?? (project.journalId ? "Target journal" : "No target journal");

  const windowBody = (t: Tool) => {
    switch (t) {
      case "match":
        return (
          <MatchWindow
            match={match}
            pdfFile={pdfFile}
            compiling={busy}
            onCompile={() => void compile()}
            targetJournalId={project.journalId}
            onSetTarget={(id, name) => void setTarget({ id, display_name: name, host: null })}
            onReview={openReview}
          />
        );
      case "checks":
        return <ChecksWindow checks={checks} pdfFile={pdfFile} compiling={busy} onCompile={() => void compile()} rules={rules} targetName={project.journalName ?? null} />;
      case "journal":
        return (
          <JournalWindow
            journalId={project.journalId}
            journalName={project.journalName ?? null}
            templates={templates}
            currentTemplateId={project.templateId}
            onChange={(j) => void setTarget(j)}
            onNewFromTemplate={(tmpl, j) => {
              setTool(null);
              onCreateFromTemplate(tmpl, j);
            }}
            onOpenMatch={() => setTool("match")}
          />
        );
      default:
        return <p className="text-sm text-ink-soft">This window is on its way.</p>;
    }
  };

  return (
    <div data-testid="workspace">
      <Toolbar
        project={project}
        onBack={onClose}
        onRename={(name) => void rename(name)}
        journalLabel={journalLabel}
        insertGroups={insertGroups}
        insertDisabled={!texOpen}
        onInsert={insert}
        onTool={setTool}
        onEngine={(e) => void setEngine(e)}
        busy={busy}
        onCompile={() => void compile()}
      />
      <div className="my-3">
        <StorageBanner onBackup={() => void backup()} />
      </div>
      {firstRun && !busy && (
        <p className="mb-3 text-sm text-ink-soft">
          The first compile downloads the TeX engine (about 140 MB). Your browser keeps it, so later compiles take a second or two.
        </p>
      )}

      <p className="mb-3 text-sm text-ink-soft md:hidden">Editing needs a larger screen — here is this project&apos;s last compiled PDF.</p>
      <div className="grid gap-4 md:grid-cols-[12rem_minmax(0,var(--split))_0.375rem_minmax(0,1fr)]" style={{ "--split": `${split / (1 - split)}fr` } as CSSProperties}>
        <div className="hidden md:block">
          <FileTree
            files={files}
            active={active}
            main={project.main}
            onOpen={(p) => void open(p)}
            onCreate={(p) =>
              void guarded(async () => {
                if (await store.exists(project.id, p)) throw new Error(`${p} already exists.`);
                await store.write(project.id, p, "");
                await refresh();
                await open(p);
              })()
            }
            onUpload={(list) =>
              void guarded(async () => {
                // an upload with an existing name replaces that file: a new version of a figure
                for (const f of Array.from(list)) {
                  const path = IMAGE.test(f.name) ? `figures/${f.name}` : f.name;
                  await store.write(project.id, path, new Uint8Array(await f.arrayBuffer()));
                }
                await refresh();
              })()
            }
            onRename={(from, to) =>
              void guarded(async () => {
                await saver().flush();
                await store.rename(project.id, from, to);
                if (from === project.main) {
                  await store.setMeta(project.id, { main: to });
                  onMeta(await store.meta(project.id));
                }
                await refresh();
                if (active === from) await open(to);
              })()
            }
            onDelete={(p) =>
              void guarded(async () => {
                await saver().flush(); // an edit still pending for this file must not write it back
                await store.deleteFile(project.id, p);
                await refresh();
                if (active === p) await open(project.main);
              })()
            }
          />
        </div>
        <div ref={editorCol} className="hidden min-w-0 md:block">
          {!TEXT.test(active) ? (
            <p className="rounded-sm border border-line p-4 text-sm text-ink-soft">{active} isn&apos;t a text file — it&apos;s used by your paper as it is.</p>
          ) : doc?.path === active ? (
            <div className="h-[70vh]">
              <LatexEditor key={doc.path} text={doc.text} marks={marks} onChange={(t) => onEdit(doc.path, t)} onSave={() => void compile()} handleRef={editor} />
            </div>
          ) : (
            <div className="h-[70vh] rounded-sm border border-line" />
          )}
          {error && <ErrorText>{error}</ErrorText>}
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
        {/* ponytail: the split's clamp (25–75 %) is its only minimum; add a px floor if a narrow window ever squeezes the editor */}
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize the editor and the preview"
          aria-valuemin={25}
          aria-valuemax={75}
          aria-valuenow={Math.round(split * 100)}
          tabIndex={0}
          onPointerDown={(e) => {
            dragging.current = true;
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            const a = editorCol.current?.getBoundingClientRect();
            const b = pdfCol.current?.getBoundingClientRect();
            if (dragging.current && a && b) setSplit(clampSplit((e.clientX - a.left) / (b.right - a.left)));
          }}
          onPointerUp={(e) => {
            dragging.current = false;
            e.currentTarget.releasePointerCapture(e.pointerId);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft") setSplit((s) => clampSplit(s - 0.05));
            if (e.key === "ArrowRight") setSplit((s) => clampSplit(s + 0.05));
          }}
          className="hidden h-[70vh] cursor-col-resize rounded-sm bg-line hover:bg-accent focus-visible:bg-accent md:block"
        />
        <div ref={pdfCol} className="h-[70vh] min-w-0">
          <PdfPane url={pdfUrl} name={`${safeName(project.name)}.pdf`} />
        </div>
      </div>

      <StatusBar
        status={status}
        errors={diagnostics.filter((d) => d.kind !== "warning").length}
        warnings={diagnostics.filter((d) => d.kind === "warning").length}
        words={words}
        dirty={dirty}
        running={null}
        sent={calls.filter((c) => c.hadBody).length}
      />

      {WINDOWS.map((w) => (
        <Dialog key={w.tool} open={tool === w.tool} onClose={closeTool} title={w.title} size={w.size}>
          {tool === w.tool && windowBody(w.tool)}
        </Dialog>
      ))}
      <CommandPalette open={tool === "palette"} onClose={closeTool} commands={commands} />
    </div>
  );
}
