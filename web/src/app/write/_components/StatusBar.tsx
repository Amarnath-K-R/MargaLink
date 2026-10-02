"use client";

import type { ProjectMeta } from "@/lib/write/projectStore";

// The line under the editor: the compile's status (the only content of the
// element the smoke reads), what the last compile found, how long the paper
// is (against the target journal's limit, when a pilot journal states
// one), whether the last edit is saved, a tool still working; on the right
// the engine and the auto-compile switch (LaTeX only), and whether anything
// from this paper has left the device.
export default function StatusBar({
  status,
  errors = 0,
  warnings = 0,
  words,
  dirty,
  running,
  sent,
  busy,
  wordLimit,
  engine,
  onEngine,
  auto,
  onAuto,
  onShortcuts,
}: {
  status: string | null;
  errors?: number;
  warnings?: number;
  words: number | null;
  dirty: boolean;
  running: { label: string; onOpen: () => void } | null;
  sent: number;
  busy: boolean;
  wordLimit: { limit: number; journal: string } | null;
  engine?: ProjectMeta["engine"];
  onEngine?: (engine: ProjectMeta["engine"]) => void;
  auto?: boolean;
  onAuto?: (on: boolean) => void;
  onShortcuts: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-2 text-xs text-ink-soft">
      <span className="flex items-center gap-2">
        <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${busy ? "pulse-dot bg-accent" : errors > 0 ? "bg-ink" : "bg-accent/70"}`} />
        <span data-testid="compile-status" aria-live="polite" className="min-h-4">
          {status}
        </span>
      </span>
      {(errors > 0 || warnings > 0) && (
        <span>
          {errors > 0 && <span className={errors ? "text-ink" : ""}>{errors} error{errors === 1 ? "" : "s"}</span>}
          {errors > 0 && warnings > 0 && " · "}
          {warnings > 0 && `${warnings} warning${warnings === 1 ? "" : "s"}`}
        </span>
      )}
      {words !== null &&
        (wordLimit ? (
          <span className="flex items-center gap-2" title={`${wordLimit.journal}'s limit for this article type`}>
            ≈ {words.toLocaleString()} of {wordLimit.limit.toLocaleString()} words
            <span aria-hidden className="h-1.5 w-16 rounded-full bg-[#dcd8ce] shadow-[inset_0_1px_2px_rgba(58,44,28,.15)]">
              <span
                className={`block h-1.5 rounded-full ${words > wordLimit.limit ? "bg-ink" : "bg-accent"}`}
                style={{ width: `${Math.min(100, Math.max(3, Math.round((words / wordLimit.limit) * 100)))}%` }}
              />
            </span>
            {words > wordLimit.limit && <span className="font-medium text-ink">over by {(words - wordLimit.limit).toLocaleString()}</span>}
          </span>
        ) : (
          <span>≈ {words.toLocaleString()} words</span>
        ))}
      <span>{dirty ? "Unsaved edit" : "Saved"}</span>
      {running && (
        <button type="button" onClick={running.onOpen} className="clay-btn h-6 px-2.5 text-xs text-accent">
          {running.label}
        </button>
      )}
      <span className="ml-auto flex items-center gap-3">
        {engine && onEngine && (
        <select aria-label="TeX engine" title="TeX engine" value={engine} onChange={(e) => onEngine(e.target.value as ProjectMeta["engine"])} className="clay-field h-6 text-xs">
          <option value="pdftex">pdfLaTeX</option>
          <option value="xetex">XeLaTeX</option>
        </select>
        )}
        {onAuto && (
        <button type="button" role="switch" aria-checked={auto} onClick={() => onAuto(!auto)} title="Compile 2 seconds after you stop typing" className="flex items-center gap-1.5 hover:text-ink">
          <span aria-hidden className={`relative h-4 w-7 rounded-full transition-colors ${auto ? "bg-accent" : "bg-[#dcd8ce] shadow-[inset_0_1px_2px_rgba(58,44,28,.18)]"}`}>
            <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow-[0_1px_2px_rgba(58,44,28,.3)] transition-[left] ${auto ? "left-3.5" : "left-0.5"}`} />
          </span>
          Auto-compile
        </button>
        )}
      </span>
      <span className={sent > 0 ? "text-away" : ""}>
        {sent === 0 ? "Nothing from this paper has been sent." : `${sent} request${sent === 1 ? "" : "s"} carried text you agreed to send.`}
      </span>
      <button type="button" onClick={onShortcuts} aria-label="Keyboard shortcuts" title="Keyboard shortcuts" className="clay-key h-6 min-w-6 px-1.5 text-[11px]">
        ?
      </button>
    </div>
  );
}
