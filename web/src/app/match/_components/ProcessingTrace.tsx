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
    <div className="border-l border-line pl-6">
      <p className="mb-3 text-sm font-medium text-accent">On this device</p>
      <ol className="space-y-2 text-sm" aria-live="polite" role="status">
        {trace.length === 0 && !busy && <li className="text-ink-soft">Upload a paper to see each step run, live.</li>}
        {trace.map((line, i) => (
          <li key={i} className="flex gap-2">
            <span className="text-accent">{i + 1}.</span>
            <span>{line}</span>
          </li>
        ))}
        {busy && <li className="text-ink-soft">Working…</li>}
      </ol>
      {showError && <ErrorText>{errorMsg}</ErrorText>}
    </div>
  );
}
