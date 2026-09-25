"use client";

import type { TexDiagnostic } from "@/lib/texLog";

// What the compiler reported, newest compile only: errors first, each a link
// to its file and line. The full log stays behind a disclosure.
export default function Diagnostics({
  items,
  log,
  onOpen,
}: {
  items: TexDiagnostic[];
  log: string;
  onOpen: (file: string | null, line: number | null) => void;
}) {
  const sorted = [...items].sort((a, b) => (a.kind === "warning" ? 1 : 0) - (b.kind === "warning" ? 1 : 0));
  return (
    <div data-testid="diagnostics" className="text-sm">
      {sorted.length === 0 ? (
        <p className="text-ink-soft">No errors or warnings from the last compile.</p>
      ) : (
        <ul className="space-y-1">
          {sorted.slice(0, 50).map((d, i) => (
            <li key={i}>
              <button type="button" onClick={() => onOpen(d.file, d.line)} className="text-left hover:underline">
                <span className={d.kind === "warning" ? "text-ink-soft" : "text-red-700 dark:text-red-400"}>
                  {d.kind === "missing-package" ? "Missing package" : d.kind === "error" ? "Error" : "Warning"}
                </span>{" "}
                <span className="font-mono text-xs text-ink-soft">
                  {d.file ?? "?"}
                  {d.line ? `:${d.line}` : ""}
                </span>{" "}
                {d.message}
                {d.pack ? ` (in the ${d.pack} pack)` : ""}
              </button>
            </li>
          ))}
        </ul>
      )}
      {log && (
        <details className="mt-2">
          <summary className="cursor-pointer text-ink-soft">Full log</summary>
          <pre className="mt-1 max-h-64 overflow-auto rounded-sm border border-line bg-paper-alt p-2 text-xs">{log}</pre>
        </details>
      )}
    </div>
  );
}
