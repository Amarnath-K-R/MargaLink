"use client";

import { useState } from "react";
import Link from "next/link";
import { BarChart3, BookOpen, ChevronDown, FileCheck2, ListChecks, Loader2, Play, ScanSearch } from "lucide-react";
import type { ProjectMeta } from "@/lib/projectStore";

export type Tool = "match" | "review" | "figures" | "checks" | "journal" | "palette";
export type InsertGroup = { label: string; items: { value: string; label: string }[] };

// Each tool's bead is a tint from the homepage's clay palette. The Journal
// window opens from the target-journal chip.
const TOOLS: { id: Tool; label: string; Icon: typeof ScanSearch; bead: string }[] = [
  { id: "match", label: "Match", Icon: ScanSearch, bead: "#cfe0e1" },
  { id: "review", label: "Review", Icon: FileCheck2, bead: "#ecdcc0" },
  { id: "figures", label: "Figures", Icon: BarChart3, bead: "#f1d2c2" },
  { id: "checks", label: "Checks", Icon: ListChecks, bead: "#dde6e6" },
];

// The workspace's top tray: home, back, the project's name (click to rename),
// its target journal, the Insert menu, the tools, the engine, Compile, ⌘K.
export default function Toolbar({
  project,
  onBack,
  onRename,
  journalLabel,
  insertGroups,
  insertDisabled,
  onInsert,
  onTool,
  onEngine,
  busy,
  onCompile,
}: {
  project: ProjectMeta;
  onBack: () => void;
  onRename: (name: string) => void;
  journalLabel: string;
  insertGroups: InsertGroup[];
  insertDisabled: boolean;
  onInsert: (value: string) => void;
  onTool: (tool: Tool) => void;
  onEngine: (engine: ProjectMeta["engine"]) => void;
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
        className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] bg-accent font-serif text-base font-medium text-white shadow-[inset_0_1px_0_rgba(255,255,255,.3),inset_0_-2px_4px_rgba(0,0,0,.2),0_3px_8px_-2px_rgba(44,95,111,.45)]"
      >
        M
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


      <select
        aria-label="Insert"
        value=""
        disabled={insertDisabled}
        title={insertDisabled ? "Open a .tex file to insert into it" : undefined}
        onChange={(e) => e.target.value && onInsert(e.target.value)}
        className="clay-btn clay-select w-[6.75rem] shrink-0 text-xs"
      >
        <option value="">Insert…</option>
        {insertGroups.map((g) => (
          <optgroup key={g.label} label={g.label}>
            {g.items.map((it) => (
              <option key={it.value} value={it.value}>
                {it.label}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
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
        <select
          aria-label="TeX engine"
          title="TeX engine"
          value={project.engine}
          onChange={(e) => onEngine(e.target.value as ProjectMeta["engine"])}
          className="clay-btn clay-select text-xs text-ink-soft"
        >
          <option value="pdftex">pdfLaTeX</option>
          <option value="xetex">XeLaTeX</option>
        </select>
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
