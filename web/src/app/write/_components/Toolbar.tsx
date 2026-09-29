"use client";

import { useState } from "react";
import Link from "next/link";
import { BarChart3, BookOpen, ChevronDown, Code, Columns2, FileCheck2, FileText, ListChecks, Loader2, PanelLeft, Play, ScanSearch } from "lucide-react";
import type { ProjectMeta } from "@/lib/projectStore";
import { LogoMark } from "@/components/Logo";

export type Tool = "match" | "review" | "figures" | "checks" | "journal" | "palette" | "shortcuts";
export type View = "source" | "split" | "pdf";

// Each tool's bead is a tint from the homepage's clay palette. The Journal
// window opens from the target-journal chip.
const TOOLS: { id: Tool; label: string; Icon: typeof ScanSearch; bead: string }[] = [
  { id: "match", label: "Match", Icon: ScanSearch, bead: "#cfe0e1" },
  { id: "review", label: "Review", Icon: FileCheck2, bead: "#ecdcc0" },
  { id: "figures", label: "Figures", Icon: BarChart3, bead: "#f1d2c2" },
  { id: "checks", label: "Checks", Icon: ListChecks, bead: "#dde6e6" },
];

// The workspace's top tray: home, back, the project's name (click to rename),
// its target journal, the tools, the files toggle and the view (source,
// both, PDF), Compile, ⌘K. Inserting lives on the source's formatting bar;
// the engine on the status line.
const VIEWS: { id: View; label: string; Icon: typeof Code }[] = [
  { id: "source", label: "Source only", Icon: Code },
  { id: "split", label: "Source and PDF", Icon: Columns2 },
  { id: "pdf", label: "PDF only", Icon: FileText },
];
export default function Toolbar({
  project,
  onBack,
  onRename,
  journalLabel,
  onTool,
  view,
  onView,
  filesOpen,
  onToggleFiles,
  busy,
  onCompile,
}: {
  project: ProjectMeta;
  onBack: () => void;
  onRename: (name: string) => void;
  journalLabel: string;
  onTool: (tool: Tool) => void;
  view: View;
  onView: (view: View) => void;
  filesOpen: boolean;
  onToggleFiles: () => void;
  busy: boolean;
  onCompile: () => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const commit = (value: string) => {
    setRenaming(false);
    const name = value.trim();
    if (name && name !== project.name) onRename(name);
  };
  return (
    <header className="clay flex flex-wrap items-center gap-x-2 gap-y-2 px-2.5 py-2 text-sm xl:flex-nowrap">
      <Link
        href="/"
        aria-label="MargaLink home"
        className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px]"
      >
        <LogoMark className="h-8 w-8" />
      </Link>
      <button type="button" onClick={onBack} className="clay-btn shrink-0 text-xs text-ink-soft">
        ← All projects
      </button>
      <h2 className="min-w-0 shrink px-1 font-serif text-lg font-medium tracking-[-0.01em]">
        {renaming ? (
          <input
            aria-label="Project name"
            autoFocus
            defaultValue={project.name}
            onBlur={(e) => commit(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit(e.currentTarget.value);
              if (e.key === "Escape") {
                e.currentTarget.value = project.name; // Chrome blurs a removed input: the blur must find nothing to commit
                setRenaming(false);
              }
            }}
            className="clay-well w-64 px-2.5 py-1 font-serif text-lg outline-none"
          />
        ) : (
          <button type="button" onClick={() => setRenaming(true)} title="Rename" className="block max-w-[22rem] truncate rounded-lg px-1.5 py-0.5 text-left hover:bg-paper-alt xl:max-w-full">
            {project.name}
          </button>
        )}
      </h2>
      <button type="button" aria-label="Target journal" onClick={() => onTool("journal")} className="clay-btn min-w-0 shrink gap-2 pl-2 text-xs">
        <span className="bead h-5 w-5 shrink-0" style={{ background: "#efe3cf" }}>
          <BookOpen size={11} strokeWidth={2} />
        </span>
        <span className="min-w-0 max-w-56 truncate">{journalLabel}</span>
        <ChevronDown size={13} strokeWidth={2} className="shrink-0 text-ink-soft" />
      </button>


      <div className="hidden shrink-0 items-center md:flex" role="group" aria-label="Tools">
        {TOOLS.map(({ id, label, Icon, bead }) => (
          <button key={id} type="button" onClick={() => onTool(id)} className="clay-ghost text-xs">
            <span className="bead" style={{ background: bead }}>
              <Icon size={13} strokeWidth={2} />
            </span>
            {label}
          </button>
        ))}
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-2">
        <div role="group" aria-label="View" className="clay-well hidden items-center gap-0.5 rounded-full p-1 md:flex">
          <button
            type="button"
            aria-label="Files"
            title={filesOpen ? "Hide the files" : "Show the files"}
            aria-pressed={filesOpen}
            onClick={onToggleFiles}
            className="grid h-7 w-8 place-items-center rounded-full text-ink-soft transition-colors hover:text-ink aria-pressed:bg-white aria-pressed:text-ink aria-pressed:shadow-[0_1px_2px_rgba(58,44,28,.14),0_3px_8px_-2px_rgba(58,44,28,.14)]"
          >
            <PanelLeft size={14} strokeWidth={2} />
          </button>
          <span aria-hidden className="mx-0.5 h-4 w-px bg-line" />
          {VIEWS.map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              aria-label={label}
              title={label}
              aria-pressed={view === id}
              onClick={() => onView(id)}
              className="grid h-7 w-8 place-items-center rounded-full text-ink-soft transition-colors hover:text-ink aria-pressed:bg-white aria-pressed:text-accent aria-pressed:shadow-[0_1px_2px_rgba(58,44,28,.14),0_3px_8px_-2px_rgba(58,44,28,.14)]"
            >
              <Icon size={14} strokeWidth={2} />
            </button>
          ))}
        </div>
        <button type="button" onClick={onCompile} disabled={busy} title="Compile (⌘S)" className="clay-btn clay-primary px-4 font-medium">
          {busy ? <Loader2 size={14} strokeWidth={2.2} className="animate-spin" /> : <Play size={13} strokeWidth={2.4} className="fill-current" />}
          {busy ? "Compiling…" : "Compile"}
        </button>
        <button type="button" onClick={() => onTool("palette")} aria-label="Commands" title="Commands (⌘K)" className="clay-key">
          ⌘K
        </button>
      </div>
    </header>
  );
}
