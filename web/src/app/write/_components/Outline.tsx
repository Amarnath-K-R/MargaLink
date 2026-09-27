"use client";

import type { OutlineItem } from "@/lib/texSource";

// The paper's headings in reading order (the main file, then what it
// \inputs), indented by level relative to the top level used; a click opens
// the heading's file at its line. Built from the saved text, so a heading
// being typed appears once it's saved (a second or so).
export default function Outline({
  items,
  main,
  onOpen,
}: {
  items: (OutlineItem & { file: string })[];
  main: string;
  onOpen: (file: string, line: number) => void;
}) {
  if (items.length === 0) {
    return (
      <p data-testid="outline" className="px-2 py-3 text-xs leading-relaxed text-ink-soft">
        No headings yet. Each \section, \subsection… you write appears here, in order.
      </p>
    );
  }
  const top = Math.min(...items.map((i) => i.level));
  return (
    <nav aria-label="Outline" data-testid="outline" className="-mx-1 min-h-0 flex-1 overflow-auto px-1 py-0.5">
      <ol className="space-y-0.5">
        {items.map((it, i) => {
          const depth = Math.min(it.level - top, 4);
          return (
            <li key={`${it.file}:${it.line}:${i}`}>
              <button
                type="button"
                onClick={() => onOpen(it.file, it.line)}
                title={`${it.file}, line ${it.line}`}
                style={{ paddingLeft: `${0.5 + depth * 0.75}rem` }}
                className={`flex w-full items-baseline gap-2 rounded-[10px] py-1.5 pr-2 text-left transition-colors hover:bg-white/60 ${
                  depth === 0 ? "text-[13px] font-medium text-ink" : "text-xs text-ink-soft"
                }`}
              >
                <span className="min-w-0 flex-1 truncate">{it.title || "(untitled)"}</span>
                {it.file !== main && <span className="shrink-0 font-mono text-[10px] text-ink-soft/80">{it.file.replace(/\.tex$/, "")}</span>}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
