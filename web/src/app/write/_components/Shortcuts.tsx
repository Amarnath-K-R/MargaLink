"use client";

import { useSyncExternalStore } from "react";

// Every keyboard shortcut the workspace has, grouped. ⌘ on a Mac, Ctrl
// elsewhere (the editor's Mod key follows the same rule).
const GROUPS: { title: string; keys: { combo: string[]; what: string }[] }[] = [
  {
    title: "Anywhere",
    keys: [
      { combo: ["Mod", "K"], what: "Commands: every action, searchable" },
      { combo: ["Esc"], what: "Close a window" },
    ],
  },
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
];

const isMac = () => /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

export default function Shortcuts() {
  const mac = useSyncExternalStore(
    () => () => {},
    isMac,
    () => true,
  );
  const label = (k: string) => (k === "Mod" ? (mac ? "⌘" : "Ctrl") : k === "Alt" && mac ? "⌥" : k === "Shift" && mac ? "⇧" : k);
  return (
    <div className="space-y-6 text-sm">
      {GROUPS.map((g) => (
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
