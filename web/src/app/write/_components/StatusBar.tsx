"use client";

// The line under the editor: the compile's status (the only content of the
// element the smoke reads), what the last compile found, how long the open
// file is, whether the last edit is saved, a tool still working, and — on
// the right — whether anything from this paper has left the device.
export default function StatusBar({
  status,
  errors,
  warnings,
  words,
  dirty,
  running,
  sent,
  busy,
}: {
  status: string | null;
  errors: number;
  warnings: number;
  words: number | null;
  dirty: boolean;
  running: { label: string; onOpen: () => void } | null;
  sent: number;
  busy: boolean;
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
      {words !== null && <span>≈ {words.toLocaleString()} words (this file)</span>}
      <span>{dirty ? "Unsaved edit" : "Saved"}</span>
      {running && (
        <button type="button" onClick={running.onOpen} className="clay-btn h-6 px-2.5 text-xs text-accent">
          {running.label}
        </button>
      )}
      <span className={`ml-auto ${sent > 0 ? "text-away" : ""}`}>
        {sent === 0 ? "Nothing from this paper has been sent." : `${sent} request${sent === 1 ? "" : "s"} carried text you agreed to send.`}
      </span>
    </div>
  );
}
