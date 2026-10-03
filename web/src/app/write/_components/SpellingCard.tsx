"use client";

import { useEffect, useRef } from "react";

// A spelling or grammar mark's fixes in a Word document, shown under the
// caret when it sits in a marked word (the LaTeX editor shows the same in
// CodeMirror's hover card). Non-modal: typing goes on, Alt+Enter moves the
// keyboard to its buttons, Escape closes it (back to the editor), and
// pressing a button with the mouse keeps the editor's caret where it was.
export default function SpellingCard({
  left,
  top,
  message,
  kind,
  replacements,
  readOnly,
  onReplace,
  onAdd,
  onIgnore,
  onClose,
}: {
  left: number;
  top: number;
  message: string;
  kind: "spelling" | "grammar";
  replacements: string[];
  readOnly: boolean; // another tab holds the project: only Ignore
  onReplace: (text: string) => void;
  onAdd: (() => void) | null; // "Add to dictionary", for a single misspelt word
  onIgnore: () => void;
  onClose: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.altKey && e.key === "Enter") {
        e.preventDefault(); // before the editor sees it
        e.stopPropagation();
        box.current?.querySelector("button")?.focus();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);
  return (
    <div
      ref={box}
      data-testid="spelling-card"
      role="group"
      aria-label={kind === "spelling" ? "Spelling" : "Grammar"}
      onMouseDown={(e) => e.preventDefault()}
      className="clay fixed z-40 w-72 max-w-[calc(100vw-2rem)] rounded-xl px-3.5 py-3 text-xs"
      style={{ left: Math.max(8, Math.min(left, window.innerWidth - 300)), top: Math.min(top, window.innerHeight - 140) }}
    >
      <p className="text-ink" aria-live="polite">
        {message}
        <span className="sr-only"> Alt+Enter for the fixes.</span>
      </p>
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        {!readOnly &&
          replacements.slice(0, 3).map((r) => (
            <button key={r || "remove"} type="button" onClick={() => onReplace(r)} className="clay-chip h-6 px-2.5 text-accent">
              {r || "Remove"}
            </button>
          ))}
        {!readOnly && onAdd && (
          <button type="button" onClick={onAdd} className="clay-chip h-6 px-2.5">
            Add to dictionary
          </button>
        )}
        <button type="button" onClick={onIgnore} className="h-6 px-2 text-ink-soft hover:text-ink">
          Ignore
        </button>
      </div>
    </div>
  );
}
