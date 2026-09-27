"use client";

import { useState } from "react";
import Dialog from "@/components/Dialog";

export type Command = { id: string; label: string; hint?: string; run: () => void; disabled?: boolean };

// ⌘K: every workspace action in one filterable list. Arrow keys move, Enter
// runs, Escape closes (the dialog's own).
export default function CommandPalette({ open, onClose, commands }: { open: boolean; onClose: () => void; commands: () => Command[] }) {
  const [q, setQ] = useState("");
  const [cursor, setCursor] = useState(0);
  const shown = (open ? commands() : []).filter((c) => c.label.toLowerCase().includes(q.trim().toLowerCase()));
  const at = Math.min(cursor, Math.max(0, shown.length - 1));
  const run = (c: Command | undefined) => {
    if (!c || c.disabled) return;
    onClose();
    c.run();
  };
  return (
    <Dialog open={open} onClose={onClose} title="Commands" size="md">
      <input
        data-autofocus
        aria-label="Search commands"
        placeholder="Type a command…"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setCursor(0);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setCursor((c) => Math.min(c + 1, shown.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setCursor((c) => Math.max(c - 1, 0));
          } else if (e.key === "Enter") {
            e.preventDefault();
            run(shown[at]);
          }
        }}
        className="w-full rounded-sm border border-line bg-paper px-3 py-2 text-sm"
      />
      <ul role="listbox" aria-label="Commands" className="mt-2 max-h-[50vh] overflow-auto text-sm">
        {shown.length === 0 && <li className="px-3 py-2 text-ink-soft">No command matches.</li>}
        {shown.map((c, i) => (
          <li
            key={c.id}
            role="option"
            aria-selected={i === at}
            aria-disabled={c.disabled || undefined}
            onMouseEnter={() => setCursor(i)}
            onClick={() => run(c)}
            className={`flex cursor-pointer items-baseline justify-between gap-4 rounded-sm px-3 py-1.5 ${i === at ? "bg-accent-soft" : ""} ${c.disabled ? "opacity-50" : ""}`}
          >
            <span>{c.label}</span>
            {c.hint && <span className="font-mono text-xs text-ink-soft">{c.hint}</span>}
          </li>
        ))}
      </ul>
    </Dialog>
  );
}
