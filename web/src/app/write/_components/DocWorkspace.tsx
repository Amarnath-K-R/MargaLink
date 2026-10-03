"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { Download } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DOCX_MAIN, DOCX_MIME, autosaver, type ProjectMeta, type ProjectStore } from "@/lib/write/projectStore";
import { countWords } from "@/lib/checks/formatCheck";
import { sentCount, type NetworkCall } from "@/app/write/_components/useNetworkTrace";
import ErrorText from "@/components/ui/ErrorText";
import Toolbar, { type Tool } from "./Toolbar.tsx";
import StatusBar from "./StatusBar.tsx";
import StorageBanner from "./StorageBanner.tsx";
import type { Command } from "./CommandPalette.tsx";
import { HubWindows, hubCommands, useHub } from "./Hub.tsx";
import { LOCKED_OUT, useProjectSession } from "./useProjectSession.ts";
import { downloadBytes, safeName } from "./download.ts";
import type { DocHandle } from "./DocEditor.tsx";
import { addWord, DEFAULT_SPELLING, removeWord, type Spelling } from "@/lib/writing/spelling";

// The Word editor is most of a megabyte: it loads when a Word project opens.
const DocEditor = dynamic(() => import("./DocEditor.tsx"), { ssr: false, loading: () => <p className="p-6 text-sm text-ink-soft">Opening the document…</p> });

const SAVE_FAILED = "Couldn't save your last edit (is the disk full?). It's tried again as you edit; download the document to keep a copy.";

// One open Word project: the toolbar, the document (its own formatting bar
// and outline, from the editor), a status line, and the same windows as a
// LaTeX project over it all. The project's one file is paper.docx; edits are
// saved two seconds after typing pauses, and before anything reads the
// paper (opening a window, downloading, leaving). The windows read the
// document as last saved, so they never see half a keystroke.
export default function DocWorkspace({
  store,
  project,
  calls,
  onClose,
  onMeta,
  pageError,
}: {
  store: ProjectStore;
  project: ProjectMeta;
  calls: NetworkCall[];
  onClose: () => void;
  onMeta: (m: ProjectMeta) => void;
  pageError?: string | null;
}) {
  const router = useRouter();
  const [opened, setOpened] = useState<Uint8Array | null>(null); // as opened: the editor's input, set once
  const [saved, setSaved] = useState<Uint8Array | null>(null); // as last saved: what the windows read
  const [editable, setEditable] = useState<boolean | null>(null); // the lock decided: this tab edits, or reads only
  const [error, setError] = useState<string | null>(null);
  const [words, setWords] = useState<number | null>(null);
  const editor = useRef<DocHandle | null>(null);
  const wordsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // A save asks the editor for the document when it runs, so it always
  // writes the latest edits, whatever queued it. The queue holds the editor
  // itself: a save queued as the project closes still reaches it.
  const saverRef = useRef<ReturnType<typeof autosaver<DocHandle>> | null>(null);
  // Saving now (leaving, a window opening, a download, the tab hidden) asks
  // the editor itself what's unsaved: it reports a change a moment after the
  // keystroke, and a save that waited for that report could miss the last words.
  const saveNowRef = useRef<() => Promise<void>>(async () => {});
  const { lockedOut, mayWrite, guarded, dirty, edited, seq, saved: savedAt } = useProjectSession(project.id, () => saveNowRef.current(), setError, () => editor.current?.pending() ?? false);
  const write = useCallback(
    async (handle: DocHandle) => {
      if (!(await mayWrite.current)) return; // read-only here: another tab has the project
      const at = seq();
      if (!handle.pending()) return savedAt(at); // queued by an edit an earlier save already stored
      const { bytes, written } = await handle.save();
      await store.write(project.id, DOCX_MAIN, bytes);
      written();
      setSaved(bytes);
      savedAt(at);
      setError((e) => (e === SAVE_FAILED ? null : e));
    },
    [mayWrite, seq, savedAt, store, project.id],
  );
  const saver = useCallback(() => (saverRef.current ??= autosaver<DocHandle>((_id, _path, handle) => write(handle), 2000, undefined, undefined, () => setError(SAVE_FAILED))), [write]);
  const flush = useCallback(async () => {
    const handle = editor.current;
    if (handle?.pending()) {
      edited();
      saver()(project.id, DOCX_MAIN, handle);
    }
    await saver().flush();
  }, [saver, edited, project.id]);
  useEffect(() => {
    saveNowRef.current = flush;
  }, [flush]);

  useEffect(() => {
    void store.read(project.id, DOCX_MAIN).then(
      (bytes) => {
        setOpened(bytes);
        setSaved(bytes);
      },
      (err) => setError(`The document couldn't be opened (${err instanceof Error ? err.message : String(err)}). Download a backup from the project list.`),
    );
    // Mount the editor once, editable or not, once the lock is decided.
    void mayWrite.current.then((ok) => setEditable(ok));
    return () => void (wordsTimer.current && clearTimeout(wordsTimer.current));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per project
  }, [project.id]);

  const paperFile = useMemo(() => (saved ? new File([saved.slice()], "paper.docx", { type: DOCX_MIME }) : null), [saved]);
  const focusEditor = useCallback(() => editor.current?.focus(), []);
  const hub = useHub({ store, project, onMeta, guarded, paperFile, focusEditor });
  const { setTool, closeTool, confirmLeave, running, wordLimit } = hub;

  // The word count follows the document (300 ms after it changes).
  const countLater = useCallback(() => {
    if (wordsTimer.current) clearTimeout(wordsTimer.current);
    wordsTimer.current = setTimeout(() => editor.current && setWords(countWords(editor.current.text())), 300);
  }, []);
  const onEdit = useCallback(() => {
    edited();
    if (editor.current) saver()(project.id, DOCX_MAIN, editor.current);
    countLater();
  }, [edited, saver, project.id, countLater]);
  // ⌘S / Ctrl+S saves now (it saves on its own two seconds after typing stops).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void flush().catch(() => {});
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [flush]);

  // A window reads the saved document: save first, then open it.
  const openTool = useCallback(
    async (t: Tool) => {
      await flush().catch(() => {}); // a failed save is shown; the window reads the last good one
      setTool(t);
    },
    [flush, setTool],
  );
  // Every way out saves first: once the editor has closed, there's nothing to save from.
  const leave = useCallback(
    async (go: () => void) => {
      if (!confirmLeave()) return;
      await flush().catch(() => {});
      go();
    },
    [confirmLeave, flush],
  );
  const download = useCallback(async () => {
    setError(null);
    const stored = await flush().then(
      () => true,
      () => false,
    );
    try {
      // Stored: the file as kept. Not (a full disk): the document as it is in the editor.
      const bytes = stored || !editor.current ? await store.read(project.id, DOCX_MAIN) : (await editor.current.save()).bytes;
      downloadBytes(`${safeName(project.name)}.docx`, bytes, DOCX_MIME);
    } catch (err) {
      setError(`The document couldn't be downloaded: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [flush, store, project.id, project.name]);
  const backup = useCallback(async () => {
    await flush().catch(() => {});
    downloadBytes(`${safeName(project.name)}.zip`, await store.exportZip(project.id), "application/zip");
  }, [flush, store, project.id, project.name]);
  // The paper's spelling settings (US English until changed), kept in its project.json.
  const spelling = project.spelling ?? DEFAULT_SPELLING;
  const [spellMarks, setSpellMarks] = useState<number | "failed" | null>(null);
  const setSpelling = guarded(async (next: Spelling) => {
    await store.setMeta(project.id, { spelling: next });
    onMeta(await store.meta(project.id));
  });
  const rename = guarded(async (name: string) => {
    await store.setMeta(project.id, { name });
    onMeta(await store.meta(project.id));
  });

  // Rewrite (Claude, M coins): given once per paper, in this browser; never in a read-only tab.
  const setRewriteConsent = guarded(async (given: boolean) => {
    await store.setMeta(project.id, { rewriteConsent: given ? new Date().toISOString() : undefined });
    onMeta(await store.meta(project.id));
  });

  // Built when the palette opens (it calls this), not on every render.
  const commands = useCallback(
    (): Command[] => [
      { id: "download", label: "Download .docx", run: () => void download() },
      { id: "save", label: "Save now", hint: "⌘S", run: () => void flush().catch(() => {}) },
      { id: "rewrite", label: "Rewrite the selection with Claude", run: () => editor.current?.rewriteMenu(), disabled: !editable },
      { id: "rewrite-off", label: "Turn off Rewrite for this paper", run: () => void setRewriteConsent(false), disabled: !project.rewriteConsent || !editable },
      ...hubCommands(hub, { onBackup: () => void backup(), onProjects: () => void leave(onClose), open: (t) => void openTool(t) }),
    ],
    [download, flush, hub, backup, leave, onClose, openTool, editable, setRewriteConsent, project.rewriteConsent],
  );

  const journalLabel = project.journalName ?? (project.journalId ? "Target journal" : "No target journal");

  // A figure from the Figures window, at the cursor, at the size it was drawn for.
  const insertFigure = async (png: Uint8Array) => {
    if (!(await mayWrite.current)) throw new Error(LOCKED_OUT);
    if (!editor.current) throw new Error("The document isn't open yet.");
    await editor.current.insertImage(png, 300);
    closeTool();
  };
  // A review's quoted passage, selected in the document.
  const jumpToQuote = (quote: string) => {
    const found = editor.current?.showQuote(quote) ?? false;
    if (found) closeTool();
    return found;
  };

  return (
    // The whole viewport: the page behind it (and its scroll) is out of play.
    <div data-testid="doc-workspace" className="desk fixed inset-0 flex flex-col gap-3 p-3">
      <Toolbar
        project={project}
        onBack={() => void leave(onClose)}
        onHome={(e) => {
          if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return; // a new tab or window: this one stays
          e.preventDefault();
          void leave(() => router.push("/"));
        }}
        onRename={(name) => void rename(name)}
        journalLabel={journalLabel}
        onTool={(t) => void (t === "palette" ? setTool(t) : openTool(t))}
        actions={
          <button type="button" onClick={() => void download()} title="Download the document as a .docx" className="clay-btn clay-primary px-4 font-medium">
            <Download size={14} strokeWidth={2.2} />
            Download .docx
          </button>
        }
      />
      <p className="px-2 text-sm text-ink-soft md:hidden">Editing a document works best on a larger screen.</p>
      <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)] gap-3 md:grid-cols-[minmax(0,1fr)_13.5rem] md:gap-x-2">
        <section aria-label="Document" className="flex min-h-0 min-w-0 flex-col gap-2">
          {lockedOut && (
            <p role="status" className="clay-well px-3 py-2 text-xs text-ink-soft">
              {LOCKED_OUT}
            </p>
          )}
          <div data-testid="doc-editor" className="sheet min-h-0 flex-1 overflow-hidden">
            {opened && editable !== null && <DocEditor
                bytes={opened}
                readOnly={!editable}
                onEdit={onEdit}
                onDocument={countLater}
                handleRef={editor}
                spelling={spelling}
                onAddWord={(w) => void setSpelling(addWord(spelling, w))}
                onSpellCount={setSpellMarks}
                rewriting={editable ? { dialect: spelling.dialect, consented: !!project.rewriteConsent, onConsent: () => setRewriteConsent(true) } : null}
              />}
          </div>
          {(error ?? pageError) && <ErrorText>{error ?? pageError}</ErrorText>}
        </section>
        <aside className="hidden min-h-0 flex-col justify-end md:flex">
          <StorageBanner compact onBackup={() => void backup()} />
        </aside>
      </div>

      <StatusBar
        status={null}
        words={words}
        wordLimit={wordLimit}
        onShortcuts={() => setTool("shortcuts")}
        spelling={{ ...spelling, marks: spellMarks, onDialect: (dialect) => void setSpelling({ ...spelling, dialect }), onRemoveWord: (w) => void setSpelling(removeWord(spelling, w)) }}
        dirty={dirty}
        running={running}
        sent={sentCount(calls)}
        busy={false}
      />

      <HubWindows hub={hub} project={project} paperFile={paperFile} figureFormat="png" onInsertFigure={insertFigure} onJump={jumpToQuote} commands={commands} shortcuts="docx" />
    </div>
  );
}
