"use client";

import { useState } from "react";
import { BarChart3, BookOpen, ChevronDown, FileCheck2, ListChecks, ScanSearch } from "lucide-react";
import type { ProjectMeta } from "@/lib/projectStore";

export type Tool = "match" | "review" | "figures" | "checks" | "journal" | "palette";
export type InsertGroup = { label: string; items: { value: string; label: string }[] };

const TOOLS: { id: Tool; label: string; Icon: typeof ScanSearch }[] = [
  { id: "match", label: "Match", Icon: ScanSearch },
  { id: "review", label: "Review", Icon: FileCheck2 },
  { id: "figures", label: "Figures", Icon: BarChart3 },
  { id: "checks", label: "Checks", Icon: ListChecks },
  { id: "journal", label: "Journal", Icon: BookOpen },
];

// The workspace's top row: back, the project's name (click to rename), its
// target journal, the Insert menu, the tools, the engine, Compile, ⌘K.
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
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
      <button type="button" onClick={onBack} className="text-accent hover:underline">
        ← All projects
      </button>
      <h2 className="font-serif text-xl font-medium">
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
            className="w-64 rounded-sm border border-line bg-paper px-1.5 py-0.5 font-serif text-xl"
          />
        ) : (
          <button type="button" onClick={() => setRenaming(true)} title="Rename" className="rounded-sm text-left hover:bg-paper-alt">
            {project.name}
          </button>
        )}
      </h2>
      <button
        type="button"
        aria-label="Target journal"
        onClick={() => onTool("journal")}
        className="inline-flex items-center gap-1.5 rounded-sm border border-line bg-paper-alt px-2.5 py-1 text-xs hover:border-accent"
      >
        <BookOpen size={13} strokeWidth={1.8} />
        <span className="max-w-56 truncate">{journalLabel}</span>
        <ChevronDown size={13} strokeWidth={1.8} className="text-ink-soft" />
      </button>
      <select
        aria-label="Insert"
        value=""
        disabled={insertDisabled}
        title={insertDisabled ? "Open a .tex file to insert into it" : undefined}
        onChange={(e) => e.target.value && onInsert(e.target.value)}
        className="rounded-sm border border-line bg-paper px-1.5 py-1 text-xs text-ink disabled:opacity-60"
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
      <div className="hidden items-center gap-1 md:flex" role="group" aria-label="Tools">
        {TOOLS.map(({ id, label, Icon }) => (
          <button key={id} type="button" onClick={() => onTool(id)} className="inline-flex items-center gap-1.5 rounded-sm px-2 py-1 text-xs hover:bg-paper-alt">
            <Icon size={14} strokeWidth={1.8} className="text-accent" />
            {label}
          </button>
        ))}
      </div>
      <div className="ml-auto flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-1.5 text-ink-soft">
          Engine
          <select aria-label="TeX engine" value={project.engine} onChange={(e) => onEngine(e.target.value as ProjectMeta["engine"])} className="rounded-sm border border-line bg-paper px-1.5 py-1">
            <option value="pdftex">pdfLaTeX</option>
            <option value="xetex">XeLaTeX</option>
          </select>
        </label>
        <button
          type="button"
          onClick={onCompile}
          disabled={busy}
          className="rounded-sm border border-line bg-paper-alt px-4 py-1.5 hover:border-accent disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? "Compiling…" : "Compile"}
        </button>
        <button type="button" onClick={() => onTool("palette")} aria-label="Commands" title="Commands (⌘K)" className="rounded-sm border border-line px-2 py-1 font-mono text-xs text-ink-soft hover:border-accent">
          ⌘K
        </button>
      </div>
    </div>
  );
}
