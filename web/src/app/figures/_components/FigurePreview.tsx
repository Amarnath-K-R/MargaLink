"use client";

import ErrorText from "@/components/ui/ErrorText";
import type { ProgressStage, RenderMeta } from "@/lib/figures/figureRunner";

export type PreviewState = {
  png: string | null;
  meta: RenderMeta | null;
  error: { message: string; traceback: string } | null;
  stage: ProgressStage | null;
  busy: boolean;
  hookWarning: string | null;
};

const STAGE_LABEL: Record<ProgressStage, string> = {
  "loading-runtime": "Loading the Python runtime (first time only)…",
  "loading-packages": "Loading plotting libraries…",
  "loading-scipy": "Loading the statistics library (first test only)…",
  "loading-fonts": "Loading fonts…",
  rendering: "Drawing…",
  exporting: "Exporting…",
};

// The live figure. A failed render keeps the last good image on screen with
// the reason under it; the Python traceback stays behind a disclosure and
// is never sent anywhere (it can quote a cell value).
export default function FigurePreview({ state, problem }: { state: PreviewState; problem: string | null }) {
  const tests = state.meta?.panels.flatMap((p, i) => p.tests.map((t) => ({ ...t, panel: i }))) ?? [];
  return (
    <div data-testid="figure-preview" data-busy={state.busy} data-panels={state.meta?.panels.length ?? 0}>
      <div className="sheet relative min-h-40 bg-white p-3">
        {state.png ? (
          // eslint-disable-next-line @next/next/no-img-element -- a runtime data: URI; images are unoptimized in this static export
          <img data-testid="figure-image" src={`data:image/png;base64,${state.png}`} alt="Figure preview" className={`mx-auto max-w-full ${state.busy ? "opacity-60" : ""}`} />
        ) : (
          <p className="p-6 text-center text-sm text-ink-soft">{state.busy ? "Drawing your figure…" : "Pick a starting point to see your figure here."}</p>
        )}
        {state.busy && state.stage && (
          <p className="absolute bottom-3 left-3 flex items-center gap-2 rounded-full bg-paper/90 px-3 py-1 text-xs text-ink-soft shadow-[0_1px_3px_rgba(58,44,28,.15)]">
            <span aria-hidden className="pulse-dot h-1.5 w-1.5 rounded-full bg-accent" />
            {STAGE_LABEL[state.stage]}
          </p>
        )}
      </div>
      <p className="mt-2.5 text-xs text-ink-soft">Rendered on this device. No request is made for previews or exports.</p>
      {problem && <ErrorText>{problem}</ErrorText>}
      {state.hookWarning && <p className="mt-2 text-sm text-ink-soft" data-testid="hook-warning">{state.hookWarning}</p>}
      {state.error && (
        <div data-testid="render-error">
          <ErrorText>{state.error.message}</ErrorText>
          {state.error.traceback && (
            <details className="mt-1 text-xs">
              <summary className="cursor-pointer text-ink-soft">Technical details (stays on this device)</summary>
              <pre className="clay-well mt-1 max-h-60 overflow-auto p-3">{state.error.traceback}</pre>
            </details>
          )}
        </div>
      )}
      {tests.length > 0 && (
        <table data-testid="test-results" className="mt-3 text-xs">
          <tbody>
            {tests.map((t, i) => (
              <tr key={i}>
                {state.meta!.panels.length > 1 && <td className="pr-3 text-ink-soft">Panel {t.panel + 1}</td>}
                <td className="pr-3">{t.pair}</td>
                <td className="pr-3 text-ink-soft">{t.test}</td>
                <td className="tabular-nums">p = {t.p === null ? "n/a" : t.p < 0.001 ? t.p.toExponential(1) : t.p.toFixed(3)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
