"use client";

import dynamic from "next/dynamic";
import { BarChart3, Command as CommandIcon, FileText, Quote } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { autosaver, type ProjectMeta, type ProjectStore } from "@/lib/write/projectStore";
import { compileProject, TexCompileError, type TexStage } from "@/lib/write/texRunner";
import { packsFor } from "@/lib/write/texEngine";
import type { TexDiagnostic } from "@/lib/write/texLog";
import { findJournalRules } from "@/lib/journals/journalRules";
import type { Template } from "@/lib/write/templateCatalog";
import { bibEntries, paperFiles, texOutline, citeSnippet, figureSnippet, nextFigurePath, refSnippet, SNIPPETS, texLabels, texWordCount } from "@/lib/write/texSource";
import type { Recipe } from "@/app/figures/_components/RecipeImportExport.tsx";
import type { NetworkCall } from "@/app/write/_components/NetworkTrace";
import Dialog from "@/components/ui/Dialog";
import ErrorText from "@/components/ui/ErrorText";
import type { Journal } from "../page.tsx";
import FileTree from "./FileTree.tsx";
import LatexEditor, { type EditorHandle, type LineMark } from "./LatexEditor.tsx";
import PdfPane from "./PdfPane.tsx";
import Diagnostics from "./Diagnostics.tsx";
import StorageBanner from "./StorageBanner.tsx";
import Toolbar, { type Tool, type View } from "./Toolbar.tsx";
import StatusBar from "./StatusBar.tsx";
import EditorFormatBar from "./EditorFormatBar.tsx";
import Outline from "./Outline.tsx";
import Shortcuts from "./Shortcuts.tsx";
import CommandPalette, { type Command } from "./CommandPalette.tsx";
import { useChecks } from "./useChecks.ts";
import { useMatch } from "@/app/match/_components/useMatch.ts";
import { useReview } from "@/app/review/_components/useReview.ts";
import { useFigures } from "@/app/figures/_components/useFigures.ts";
import { downloadBytes, safeName } from "./download.ts";

// Each window's body loads only when it opens, so the tools' code (pdf.js,
// the matching model, the figure studio) stays out of the page until asked for.
const loading = () => <p className="text-sm text-ink-soft">Loading…</p>;
const ChecksWindow = dynamic(() => import("./ChecksWindow.tsx"), { ssr: false, loading });
const JournalWindow = dynamic(() => import("./JournalWindow.tsx"), { ssr: false, loading });
const MatchWindow = dynamic(() => import("./MatchWindow.tsx"), { ssr: false, loading });
const ReviewWindow = dynamic(() => import("./ReviewWindow.tsx"), { ssr: false, loading });
const FiguresWindow = dynamic(() => import("./FiguresWindow.tsx"), { ssr: false, loading });

const TEXT = /\.(tex|bib|cls|sty|bst|txt|md|def|cfg|json)$/i;
const IMAGE = /\.(png|jpe?g|pdf|eps)$/i;
const FIRST_RUN_KEY = "margalink-tex-cached";
const SPLIT_KEY = "margalink-write-split";
const VIEW_KEY = "margalink-write-view";
const FILES_KEY = "margalink-write-files";
const AUTO_KEY = "margalink-write-autocompile";
const TIPS_KEY = "margalink-write-tips";

// A choice remembered in this browser, read once when the workspace opens.
function useStored<T extends string>(key: string, fallback: T, allowed: readonly T[]) {
  const [value, setValue] = useState<T>(() => {
    try {
      const v = localStorage.getItem(key) as T | null;
      return v && allowed.includes(v) ? v : fallback;
    } catch {
      return fallback;
    }
  });
  const set = useCallback(
    (next: T) => {
      setValue(next);
      try {
        localStorage.setItem(key, next);
      } catch {
        // private window or blocked storage: the choice lasts this visit
      }
    },
    [key],
  );
  return [value, set] as const;
}

// The md+ grid for each view, with and without the files column.
const GRID: Record<`${View}:${"open" | "closed"}`, string> = {
  "split:open": "md:grid-cols-[13.5rem_minmax(0,var(--split))_0.5rem_minmax(0,1fr)]",
  "split:closed": "md:grid-cols-[minmax(0,var(--split))_0.5rem_minmax(0,1fr)]",
  "source:open": "md:grid-cols-[13.5rem_minmax(0,1fr)]",
  "source:closed": "md:grid-cols-[minmax(0,1fr)]",
  "pdf:open": "md:grid-cols-[13.5rem_minmax(0,1fr)]",
  "pdf:closed": "md:grid-cols-[minmax(0,1fr)]",
};
const clampSplit = (v: number) => Math.min(0.75, Math.max(0.25, v));

const STAGE_TEXT: Record<TexStage, (d?: string) => string> = {
  "loading-engine": () => "Loading TeX…",
  "loading-package": (d) => (d === "all" ? "This template needs more of TeX Live: loading it (about 110 MB, once)…" : "Loading TeX packages…"),
  running: (d) => `Running ${d ?? "TeX"}…`,
};

const WINDOWS: { tool: Exclude<Tool, "palette" | "shortcuts">; title: string; size: "lg" | "full" }[] = [
  { tool: "match", title: "Match", size: "lg" },
  { tool: "review", title: "Review", size: "lg" },
  { tool: "figures", title: "Figures", size: "full" },
  { tool: "checks", title: "Checks", size: "lg" },
  { tool: "journal", title: "Journal", size: "lg" },
];

// One open project: the toolbar, files on the left, the source editor and
// the PDF side by side (the split drags), the compiler's diagnostics under
// the editor, a status line, and the other tools as windows over it all.
// `calls` is the page's network trace, for the status line's "sent" count
// (only the review and Ask Claude requests carry text you agreed to send:
// starting a paid review or signing out doesn't);
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
  const [pendingRecipe, setPendingRecipe] = useState<string | null>(null);
  const [leftTab, setLeftTab] = useState<"files" | "outline">("files");
  const [view, setView] = useStored<View>(VIEW_KEY, "split", ["source", "split", "pdf"]);
  const [filesPanel, setFilesPanel] = useStored(FILES_KEY, "open", ["open", "closed"] as const);
  const [auto, setAuto] = useStored(AUTO_KEY, "off", ["on", "off"] as const);
  const [tips, setTips] = useStored(TIPS_KEY, "show", ["show", "done"] as const);
  const autoTimer = useRef<ReturnType<typeof setTimeout> | null>(null); // a .figure.json to reopen in the Figures window
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
    () => (saverRef.current ??= autosaver(write, undefined, undefined, undefined, () => setError("Couldn't save your last edit (is the disk full?). It will be retried; download a backup to be safe."))),
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
  const studio = useFigures();
  const rules = project.journalId ? findJournalRules(project.journalId) : undefined;
  const setTarget = async (j: Journal | null) => {
    await store.setMeta(project.id, { journalId: j?.id ?? null, journalName: j?.display_name ?? null });
    onMeta(await store.meta(project.id));
  };
  // From a match result: the Review window, loaded with this PDF against that
  // journal — unless a review is running, which changing the journal would
  // abort (and it's paid for): then just show it.
  const openReview = (journalId: string) => {
    if (review.reviewLoading) {
      // keep the run
    } else if (pdfFile && review.source !== pdfFile) void review.onFile(pdfFile, { journalId });
    else review.selectJournal(journalId);
    setTool("review");
  };
  // A tool still working after its window was closed: shown on the status bar, click to reopen.
  const running = review.reviewLoading
    ? { label: review.progress ? `Reviewing ${review.progress.done} of ${review.progress.total}…` : "Reviewing…", onOpen: () => setTool("review") }
    : match.busy
      ? { label: "Matching…", onOpen: () => setTool("match") }
      : studio.preview.busy
        ? { label: "Drawing the figure…", onOpen: () => setTool("figures") }
        : null;

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
        setError(result.diagnostics.find((d) => d.kind !== "warning")?.message ?? "The compile failed. See the log below.");
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
    // The outline, suggestions and word count follow the text as it's typed (after a
    // 300 ms pause), not only once it's saved.
    if (wordsTimer.current) clearTimeout(wordsTimer.current);
    wordsTimer.current = setTimeout(() => {
      setSources((s) => ({ ...s, [path]: t }));
      if (/\.tex$/i.test(path)) setWords(texWordCount(t));
    }, 300);
    // Auto-compile: 2 s after the last keystroke, unless one is running.
    if (autoTimer.current) clearTimeout(autoTimer.current);
    if (auto === "on") autoTimer.current = setTimeout(() => !busyRef.current && void compile(), 2000);
  };
  useEffect(() => () => void (autoTimer.current && clearTimeout(autoTimer.current)), []);

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

  // Open a file at a line: the diagnostics' and the review's "jump to source".
  const goto = useCallback(
    async (file: string, line: number | null, near?: string) => {
      const target = files.includes(file) ? file : project.main;
      if (target !== active) await open(target);
      if (line) setTimeout(() => editor.current?.goto(line, near), 0);
    },
    [files, project.main, active, open],
  );

  // The project's citation keys (with titles) and labels, from the files in memory.
  const bib = useMemo(() => {
    const seen = new Set<string>();
    return Object.entries(sources)
      .flatMap(([p, t]) => (/\.bib$/i.test(p) ? bibEntries(t) : []))
      .filter((e) => !seen.has(e.key) && (seen.add(e.key), true));
  }, [sources]);
  const labels = useMemo(() => [...new Set(Object.entries(sources).flatMap(([p, t]) => (/\.tex$/i.test(p) ? texLabels(t) : [])))], [sources]);

  // The paper's headings, following \input from the main file.
  const outline = useMemo(
    () => paperFiles(project.main, sources).flatMap((f) => texOutline(sources[f]).map((o) => ({ ...o, file: f }))),
    [project.main, sources],
  );
  const completionData = useMemo(() => ({ entries: bib, labels }), [bib, labels]);

  // The whole paper's length (the open file counted live), and the target journal's limit.
  const paperWords = useMemo(() => {
    const inPaper = paperFiles(project.main, sources);
    if (inPaper.length === 0) return words;
    return inPaper.reduce((n, f) => n + (f === active && words !== null ? words : texWordCount(sources[f])), 0);
  }, [project.main, sources, active, words]);
  const wordLimit = rules?.wordLimit ? { limit: rules.wordLimit, journal: rules.journalName } : null;

  const insert = useCallback(
    (value: string) => {
      const [kind, rest] = [value.slice(0, value.indexOf(":")), value.slice(value.indexOf(":") + 1)];
      const snippet =
        kind === "fig" ? figureSnippet(rest) : kind === "snip" ? SNIPPETS[rest as keyof typeof SNIPPETS] : kind === "cite" ? citeSnippet(rest) : refSnippet(rest);
      editor.current?.insert(snippet);
      // The hint looks at every text file: a class (elsarticle, acmart) may load graphicx itself.
      const loadsGraphicx = Object.values(sources).some((t) => /^\s*\\(?:usepackage|RequirePackage)(?:\[[^\]]*\])?\{[^}]*graphicx/m.test(t));
      if (kind === "fig" && !loadsGraphicx) setStatus("Add \\usepackage{graphicx} to the preamble to use the figure.");
    },
    [sources],
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
      { id: "view-source", label: "Show the source only", run: () => setView("source"), disabled: view === "source" },
      { id: "view-split", label: "Show source and PDF side by side", run: () => setView("split"), disabled: view === "split" },
      { id: "view-pdf", label: "Show the PDF only", run: () => setView("pdf"), disabled: view === "pdf" },
      { id: "files", label: filesPanel === "open" ? "Hide the files" : "Show the files", run: () => setFilesPanel(filesPanel === "open" ? "closed" : "open") },
      { id: "auto", label: auto === "on" ? "Turn auto-compile off" : "Turn auto-compile on", run: () => setAuto(auto === "on" ? "off" : "on") },
      { id: "shortcuts", label: "Keyboard shortcuts", run: () => setTool("shortcuts") },
      { id: "projects", label: "All projects", run: onClose },
    ],
    [compile, busy, insert, texOpen, figures, backup, pdfBytes, project.name, project.engine, setEngine, onClose, view, setView, filesPanel, setFilesPanel, auto, setAuto],
  );

  const journalLabel = project.journalName ?? (project.journalId ? "Target journal" : "No target journal");

  // A figure from the window: its PDF and recipe into figures/, the tree
  // refreshed, a figure block at the cursor (or on the clipboard when no
  // .tex is open).
  const insertFigure = async (pdf: Uint8Array, recipe: Recipe) => {
    const path = nextFigurePath(files);
    await store.write(project.id, path, pdf);
    await store.write(project.id, path.replace(/\.pdf$/, ".figure.json"), JSON.stringify(recipe, null, 2));
    await refresh();
    closeTool();
    if (texOpen) setTimeout(() => insert(`fig:${path}`), 0);
    else {
      const copied = await navigator.clipboard.writeText(figureSnippet(path)).then(() => true, () => false);
      setStatus(`Added ${path}.${copied ? " The LaTeX to include it is on your clipboard." : ""}`);
    }
  };

  const windowBody = (t: Tool) => {
    switch (t) {
      case "figures":
        return (
          <FiguresWindow
            figures={studio}
            pendingRecipe={pendingRecipe}
            onRecipeApplied={(note) => {
              setPendingRecipe(null);
              if (note) setStatus(note);
            }}
            compiling={busy}
            onInsert={insertFigure}
          />
        );
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
      case "review":
        return (
          <ReviewWindow
            review={review}
            pdfFile={pdfFile}
            compiling={busy}
            onCompile={() => void compile()}
            pilotId={rules ? project.journalId : null}
            targetName={project.journalName ?? null}
            texFiles={[project.main, active, ...Object.keys(sources)]
              .filter((p, i, all) => /\.tex$/i.test(p) && p in sources && all.indexOf(p) === i)
              .map((path) => ({ path, text: sources[path] }))}
            onGoto={(path, line) => {
              closeTool();
              void goto(path, line);
            }}
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
    // The whole viewport: the page behind it (and its scroll) is out of play.
    <div data-testid="workspace" className="desk fixed inset-0 flex flex-col gap-3 p-3">
      <Toolbar
        project={project}
        onBack={onClose}
        onRename={(name) => void rename(name)}
        journalLabel={journalLabel}
        onTool={setTool}
        view={view}
        onView={setView}
        filesOpen={filesPanel === "open"}
        onToggleFiles={() => setFilesPanel(filesPanel === "open" ? "closed" : "open")}
        busy={busy}
        onCompile={() => void compile()}
      />
      <p className="px-2 text-sm text-ink-soft md:hidden">Editing needs a larger screen. Here is this project&apos;s last compiled PDF.</p>
      <div
        className={`grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)] gap-3 md:gap-x-2 ${GRID[`${view}:${filesPanel}`]}`}
        style={{ "--split": `${split / (1 - split)}fr` } as CSSProperties}
      >
        <aside className={`clay hidden min-h-0 flex-col p-3 md:mr-1 ${filesPanel === "open" ? "md:flex" : ""}`}>
          <div role="tablist" aria-label="Files or outline" className="clay-well mb-3 grid grid-cols-2 gap-1 rounded-full p-1 text-xs">
            {(["files", "outline"] as const).map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={leftTab === t}
                onClick={() => setLeftTab(t)}
                className={`rounded-full py-1.5 transition-colors ${leftTab === t ? "bg-white text-ink shadow-[0_1px_2px_rgba(58,44,28,.14),0_3px_8px_-2px_rgba(58,44,28,.14)]" : "text-ink-soft hover:text-ink"}`}
              >
                {t === "files" ? `Files · ${files.length}` : `Outline · ${outline.length}`}
              </button>
            ))}
          </div>
          {leftTab === "outline" && <Outline items={outline} main={project.main} onOpen={(f, line, title) => void goto(f, line, title)} />}
          <div className={leftTab === "files" ? "flex min-h-0 flex-1 flex-col" : "hidden"}>
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
          <StorageBanner compact onBackup={() => void backup()} />
        </aside>
        {/* Hidden, not unmounted, in the PDF view: the editor keeps its undo history. */}
        <section
          ref={editorCol}
          aria-label="Source"
          className={`hidden min-h-0 min-w-0 flex-col gap-2 ${view === "pdf" ? "" : "md:flex"} ${view === "source" ? "md:mx-auto md:w-full md:max-w-5xl" : ""}`}
        >
          <div className="flex min-h-9 flex-wrap items-center gap-2 px-1.5 text-xs text-ink-soft">
            <FileText size={13} strokeWidth={1.9} className="shrink-0" />
            <span className="truncate font-mono text-ink">{active}</span>
            {texOpen && (
              <span className="ml-auto">
                <EditorFormatBar
                  onWrap={(b, a, ph) => editor.current?.wrap(b, a, ph)}
                  onBlock={(t, sel) => editor.current?.insertBlock(t, sel)}
                  onComment={() => editor.current?.comment()}
                  onInsert={insert}
                  entries={bib}
                  labels={labels}
                  figures={figures}
                  onOpenFigures={() => setTool("figures")}
                />
              </span>
            )}
            {doc?.path === active && /\.figure\.json$/i.test(active) && (
              <span className="ml-auto flex items-center gap-2">
                <span className="hidden lg:inline">A figure&apos;s recipe: its settings, never its data.</span>
                <button
                  type="button"
                  onClick={() => {
                    setPendingRecipe(doc.text);
                    setTool("figures");
                  }}
                  className="clay-btn h-7 px-2.5 text-xs text-accent"
                >
                  Edit in the figure studio
                </button>
              </span>
            )}
          </div>
          <div className="sheet min-h-0 flex-1">
            {!TEXT.test(active) ? (
              <p className="p-6 text-sm text-ink-soft">{active} isn&apos;t a text file; it&apos;s used by your paper as it is.</p>
            ) : doc?.path === active ? (
              <LatexEditor key={doc.path} text={doc.text} marks={marks} onChange={(t) => onEdit(doc.path, t)} onSave={() => void compile()} handleRef={editor} completions={completionData} />
            ) : null}
          </div>
          {error && <ErrorText>{error}</ErrorText>}
          {diagnostics.length > 0 && (
            <div className="clay max-h-[32%] shrink-0 overflow-auto rounded-2xl px-4 py-3">
              <Diagnostics items={diagnostics} log={log} onOpen={(file, line) => void goto(file ?? project.main, line)} />
            </div>
          )}
        </section>
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
          onPointerCancel={() => {
            dragging.current = false;
          }}
          className={`grip hidden ${view === "split" ? "md:block" : ""}`}
        />
        <section ref={pdfCol} aria-label="Preview" className={`min-h-0 min-w-0 ${view === "source" ? "md:hidden" : ""}`}>
          <PdfPane
            url={pdfUrl}
            name={`${safeName(project.name)}.pdf`}
            hint={firstRun && !busy ? "The first compile downloads the TeX engine (about 140 MB). Your browser keeps it, so later compiles take a second or two." : null}
            extra={
              tips === "show" && (
                <div className="clay mt-6 w-full max-w-sm p-4 text-left text-xs leading-relaxed" data-testid="tips">
                  <p className="mb-2 font-serif text-sm font-medium text-ink">Getting around</p>
                  <ul className="space-y-2 text-ink-soft">
                    <li className="flex gap-2.5">
                      <BarChart3 size={14} strokeWidth={2} className="mt-0.5 shrink-0 text-accent" />
                      <span>Match, Review, Figures and Checks open as windows over your paper; the journal chip sets the journal you&apos;re writing for.</span>
                    </li>
                    <li className="flex gap-2.5">
                      <Quote size={14} strokeWidth={2} className="mt-0.5 shrink-0 text-accent" />
                      <span>The bar over the source formats text. Type \cite{"{"} and your references are suggested; the Outline tab jumps between sections.</span>
                    </li>
                    <li className="flex gap-2.5">
                      <CommandIcon size={14} strokeWidth={2} className="mt-0.5 shrink-0 text-accent" />
                      <span>⌘K finds any command; the ? on the status line lists every shortcut.</span>
                    </li>
                  </ul>
                  <button type="button" onClick={() => setTips("done")} className="clay-btn mt-3 h-7 text-xs">
                    Got it
                  </button>
                </div>
              )
            }
          />
        </section>
      </div>

      <StatusBar
        status={status}
        errors={diagnostics.filter((d) => d.kind !== "warning").length}
        warnings={diagnostics.filter((d) => d.kind === "warning").length}
        words={paperWords}
        wordLimit={wordLimit}
        engine={project.engine}
        onEngine={(e) => void setEngine(e)}
        auto={auto === "on"}
        onAuto={(on) => {
          setAuto(on ? "on" : "off");
          if (!on && autoTimer.current) clearTimeout(autoTimer.current);
        }}
        onShortcuts={() => setTool("shortcuts")}
        dirty={dirty}
        running={running}
        sent={calls.filter((c) => c.hadBody && /\/api\/(review|figure)(\?|$)/.test(c.url)).length}
        busy={busy}
      />

      {WINDOWS.map((w) => (
        <Dialog key={w.tool} open={tool === w.tool} onClose={closeTool} title={w.title} size={w.size}>
          {tool === w.tool && windowBody(w.tool)}
        </Dialog>
      ))}
      <CommandPalette open={tool === "palette"} onClose={closeTool} commands={commands} />
      <Dialog open={tool === "shortcuts"} onClose={closeTool} title="Keyboard shortcuts" size="md">
        {tool === "shortcuts" && <Shortcuts />}
      </Dialog>
    </div>
  );
}
