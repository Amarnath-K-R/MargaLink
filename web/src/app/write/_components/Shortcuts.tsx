"use client";

import { useSyncExternalStore } from "react";

// Every keyboard shortcut the workspace has, grouped: the LaTeX source's, or
// the Word document's. ⌘ on a Mac, Ctrl elsewhere (the editor's Mod key
// follows the same rule).
type Group = { title: string; keys: { combo: string[]; what: string }[] };
const ANYWHERE: Group = {
  title: "Anywhere",
  keys: [
    { combo: ["Mod", "K"], what: "Commands: every action, searchable" },
    { combo: ["Esc"], what: "Close a window" },
  ],
};
const DOCX: Group[] = [
  ANYWHERE,
  {
    title: "In the document",
    keys: [
      { combo: ["Mod", "S"], what: "Save now (it also saves on its own as you type)" },
      { combo: ["Mod", "B"], what: "Bold" },
      { combo: ["Mod", "I"], what: "Italic" },
      { combo: ["Mod", "U"], what: "Underline" },
      { combo: ["Mod", "Z"], what: "Undo" },
      { combo: ["Mod", "Shift", "Z"], what: "Redo" },
      { combo: ["Mod", "F"], what: "Find and replace" },
      { combo: ["Alt", "Enter"], what: "The fixes for a spelling or grammar mark, with the caret in the marked word" },
    ],
  },
];
const LATEX: Group[] = [
  ANYWHERE,
  {
    title: "In the source",
    keys: [
      { combo: ["Mod", "S"], what: "Save and compile" },
      { combo: ["Mod", "B"], what: "Bold" },
      { combo: ["Mod", "I"], what: "Italic" },
      { combo: ["Mod", "/"], what: "Comment or uncomment lines" },
      { combo: ["Ctrl", "Space"], what: "Show suggestions (they also appear as you type \\cite{, \\ref{, \\begin{ or \\)" },
      { combo: ["Tab"], what: "Next field of an inserted command" },
      { combo: ["Mod", "Z"], what: "Undo" },
      { combo: ["Mod", "Shift", "Z"], what: "Redo" },
    ],
  },
  {
    title: "Finding",
    keys: [
      { combo: ["Mod", "F"], what: "Find (and replace) in this file" },
      { combo: ["Mod", "G"], what: "Next match" },
      { combo: ["Mod", "D"], what: "Select the next occurrence too" },
      { combo: ["Mod", "Alt", "G"], what: "Go to line" },
    ],
  },
  {
    title: "Marks",
    keys: [
      { combo: ["F8"], what: "Next spelling, grammar or compiler mark" },
      { combo: ["Mod", "Shift", "M"], what: "All the marks in a list, with their fixes" },
    ],
  },
];

const isMac = () => /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

export default function Shortcuts({ kind = "latex" }: { kind?: "latex" | "docx" }) {
  const mac = useSyncExternalStore(
    () => () => {},
    isMac,
    () => true,
  );
  const label = (k: string) => (k === "Mod" ? (mac ? "⌘" : "Ctrl") : k === "Alt" && mac ? "⌥" : k === "Shift" && mac ? "⇧" : k);
  return (
    <div className="space-y-6 text-sm">
      {(kind === "docx" ? DOCX : LATEX).map((g) => (
        <section key={g.title}>
          <h3 className="mb-2 text-xs font-medium text-accent">{g.title}</h3>
          <dl className="divide-y divide-line/70">
            {g.keys.map((k) => (
              <div key={k.what} className="flex items-center justify-between gap-6 py-2">
                <dt className="text-ink-soft">{k.what}</dt>
                <dd className="flex shrink-0 gap-1">
                  {k.combo.map((c) => (
                    <kbd key={c} className="clay-key h-7 min-w-7 cursor-default px-2 text-[11px] text-ink">
                      {label(c)}
                    </kbd>
                  ))}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}
