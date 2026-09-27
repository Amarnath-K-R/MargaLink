import ErrorText from "@/components/ErrorText";

export default function ProcessingTrace({
  trace,
  busy,
  showError,
  errorMsg,
}: {
  trace: string[];
  busy: boolean;
  showError: boolean;
  errorMsg: string | null;
}) {
  return (
    <div className="md:border-l md:border-line/80 md:pl-8">
      <p className="mb-4 flex items-center gap-2 text-sm font-medium text-accent">
        <span aria-hidden className={`h-1.5 w-1.5 rounded-full bg-accent ${busy ? "pulse-dot" : ""}`} />
        On this device
      </p>
      <ol className="relative space-y-3 text-sm" aria-live="polite" role="status">
        {trace.length === 0 && !busy && <li className="text-ink-soft">Upload a paper to see each step run, live.</li>}
        {trace.map((line, i) => (
          <li key={i} className="flex gap-3">
            <span aria-hidden className="bead h-5 w-5 shrink-0 font-mono text-[10px]" style={{ background: "#cfe0e1" }}>
              {i + 1}
            </span>
            <span className="pt-px">{line}</span>
          </li>
        ))}
        {busy && (
          <li className="flex gap-3 text-ink-soft">
            <span aria-hidden className="pulse-dot bead h-5 w-5 shrink-0" style={{ background: "#ebe8df" }} />
            <span className="pt-px">Working…</span>
          </li>
        )}
      </ol>
      {showError && <ErrorText>{errorMsg}</ErrorText>}
    </div>
  );
}
