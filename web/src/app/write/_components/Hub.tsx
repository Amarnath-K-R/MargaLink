"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import type { ProjectMeta, ProjectStore } from "@/lib/write/projectStore";
import { findJournalRules } from "@/lib/journals/journalRules";
import type { Template } from "@/lib/write/templateCatalog";
import type { Recipe } from "@/app/figures/_components/RecipeImportExport";
import Dialog from "@/components/ui/Dialog";
import type { Journal } from "../page.tsx";
import type { Tool } from "./Toolbar.tsx";
import Shortcuts from "./Shortcuts.tsx";
import CommandPalette, { type Command } from "./CommandPalette.tsx";
import { useChecks } from "./useChecks.ts";
import { useMatch } from "@/app/match/_components/useMatch";
import { useReview } from "@/app/review/_components/useReview";
import { useFigures } from "@/app/figures/_components/useFigures";

// The windows over an open project (Match, Review, Figures, Checks,
// Journal, the command palette and the shortcuts) and the tools' state
// behind them, shared by the LaTeX and Word workspaces. Each reads the
// paper from `paperFile`: the compiled PDF, or the saved .docx.

// Each window's body loads only when it opens, so the tools' code (pdf.js,
// the matching model, the figure studio) stays out of the page until asked for.
const loading = () => <p className="text-sm text-ink-soft">Loading…</p>;
const ChecksWindow = dynamic(() => import("./ChecksWindow.tsx"), { ssr: false, loading });
const JournalWindow = dynamic(() => import("./JournalWindow.tsx"), { ssr: false, loading });
const MatchWindow = dynamic(() => import("./MatchWindow.tsx"), { ssr: false, loading });
const ReviewWindow = dynamic(() => import("./ReviewWindow.tsx"), { ssr: false, loading });
const FiguresWindow = dynamic(() => import("./FiguresWindow.tsx"), { ssr: false, loading });

export const WINDOWS: { tool: Exclude<Tool, "palette" | "shortcuts">; title: string; size: "lg" | "full" }[] = [
  { tool: "match", title: "Match", size: "lg" },
  { tool: "review", title: "Review", size: "lg" },
  { tool: "figures", title: "Figures", size: "full" },
  { tool: "checks", title: "Checks", size: "lg" },
  { tool: "journal", title: "Journal", size: "lg" },
];

type Guarded = <A extends unknown[]>(fn: (...args: A) => Promise<void>) => (...args: A) => Promise<void>;

// The tools' state lives in the workspace, so a window keeps its results when closed.
export function useHub({
  store,
  project,
  onMeta,
  guarded,
  paperFile,
  focusEditor,
}: {
  store: ProjectStore;
  project: ProjectMeta;
  onMeta: (m: ProjectMeta) => void;
  guarded: Guarded;
  paperFile: File | null;
  focusEditor: () => void;
}) {
  const [tool, setTool] = useState<Tool | null>(null);
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

  const checks = useChecks();
  const match = useMatch();
  const review = useReview();
  const studio = useFigures();
  const rules = project.journalId ? findJournalRules(project.journalId) : undefined;
  const setTarget = guarded(async (j: Journal | null) => {
    await store.setMeta(project.id, { journalId: j?.id ?? null, journalName: j?.display_name ?? null });
    onMeta(await store.meta(project.id));
  });
  // From a match result: the Review window, loaded with this paper against
  // that journal — unless a review is running, which changing the journal
  // would abort (and it's paid for): then just show it.
  const openReview = (journalId: string) => {
    if (review.reviewLoading) {
      // keep the run
    } else if (paperFile && review.source !== paperFile) void review.onFile(paperFile, { journalId });
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
  // Leaving the project while a paid review runs stops it; ask first.
  const { reviewLoading, cancel: cancelReview } = review;
  const confirmLeave = useCallback(() => {
    if (!reviewLoading) return true;
    if (!window.confirm("A review is still running. Leaving this project stops it: the sections it already reviewed stay paid, and the rest is refunded automatically. Leave anyway?")) return false;
    cancelReview();
    return true;
  }, [reviewLoading, cancelReview]);
  // Closing a window hands focus back to the editor (the dialog restores it
  // to the opener; after ⌘K that was the editor too).
  const closeTool = useCallback(() => {
    setTool(null);
    setTimeout(focusEditor, 0);
  }, [focusEditor]);
  const wordLimit = rules?.wordLimit ? { limit: rules.wordLimit, journal: rules.journalName } : null;

  return { tool, setTool, checks, match, review, studio, rules, setTarget, openReview, running, confirmLeave, closeTool, wordLimit };
}
export type Hub = ReturnType<typeof useHub>;

// The palette entries both workspaces have: every window, the backup, the shortcuts, back to the projects.
// `open` opens a window (the Word workspace saves first).
export function hubCommands(hub: Hub, { onBackup, onProjects, open = hub.setTool }: { onBackup: () => void; onProjects: () => void; open?: (t: Tool) => void }): Command[] {
  return [
    ...WINDOWS.map((w) => ({ id: w.tool, label: `Open ${w.title}`, run: () => open(w.tool) })),
    { id: "backup", label: "Download backup", run: onBackup },
    { id: "shortcuts", label: "Keyboard shortcuts", run: () => hub.setTool("shortcuts") },
    { id: "projects", label: "All projects", run: onProjects },
  ];
}

export function HubWindows({
  hub,
  project,
  paperFile,
  compiling = false,
  onCompile = () => {},
  figureFormat,
  onInsertFigure,
  onJump,
  templates,
  onNewFromTemplate,
  pendingRecipe = null,
  onRecipeApplied = () => {},
  commands,
  shortcuts = "latex",
}: {
  hub: Hub;
  project: ProjectMeta;
  paperFile: File | null;
  compiling?: boolean; // a LaTeX compile in progress
  onCompile?: () => void;
  figureFormat: "pdf" | "png"; // what Insert into paper asks the figure studio for
  onInsertFigure: (image: Uint8Array, recipe: Recipe) => Promise<void>;
  onJump: (quote: string) => boolean; // a review's quoted passage, found in the paper (true) or not
  templates?: Template[]; // absent: no Template section in the Journal window
  onNewFromTemplate?: (t: Template, journal: Journal) => void;
  pendingRecipe?: string | null;
  onRecipeApplied?: (note: string | null) => void;
  commands: () => Command[];
  shortcuts?: "latex" | "docx"; // which editor's keys the shortcuts window lists
}) {
  const { tool, setTool, closeTool, checks, match, review, studio, rules, setTarget, openReview, confirmLeave } = hub;
  const windowBody = (t: Tool) => {
    switch (t) {
      case "figures":
        return <FiguresWindow figures={studio} pendingRecipe={pendingRecipe} onRecipeApplied={onRecipeApplied} compiling={compiling} format={figureFormat} onInsert={onInsertFigure} />;
      case "match":
        return (
          <MatchWindow
            match={match}
            paperFile={paperFile}
            compiling={compiling}
            onCompile={onCompile}
            targetJournalId={project.journalId}
            onSetTarget={(id, name) => void setTarget({ id, display_name: name, host: null })}
            onReview={openReview}
          />
        );
      case "review":
        return (
          <ReviewWindow
            review={review}
            paperFile={paperFile}
            compiling={compiling}
            onCompile={onCompile}
            pilotId={rules ? project.journalId : null}
            targetName={project.journalName ?? null}
            onJump={onJump}
          />
        );
      case "checks":
        return <ChecksWindow checks={checks} paperFile={paperFile} compiling={compiling} onCompile={onCompile} rules={rules} targetName={project.journalName ?? null} />;
      case "journal":
        return (
          <JournalWindow
            journalId={project.journalId}
            journalName={project.journalName ?? null}
            templates={templates}
            currentTemplateId={project.templateId}
            onChange={(j) => void setTarget(j)}
            onNewFromTemplate={
              onNewFromTemplate &&
              ((tmpl, j) => {
                if (!confirmLeave()) return;
                setTool(null);
                onNewFromTemplate(tmpl, j);
              })
            }
            onOpenMatch={() => setTool("match")}
          />
        );
      default:
        return <p className="text-sm text-ink-soft">This window is on its way.</p>;
    }
  };
  return (
    <>
      {WINDOWS.map((w) => (
        <Dialog key={w.tool} open={tool === w.tool} onClose={closeTool} title={w.title} size={w.size}>
          {tool === w.tool && windowBody(w.tool)}
        </Dialog>
      ))}
      <CommandPalette open={tool === "palette"} onClose={closeTool} commands={commands} />
      <Dialog open={tool === "shortcuts"} onClose={closeTool} title="Keyboard shortcuts" size="md">
        {tool === "shortcuts" && <Shortcuts kind={shortcuts} />}
      </Dialog>
    </>
  );
}
