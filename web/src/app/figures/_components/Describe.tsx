"use client";

import { useState } from "react";
import ErrorText from "@/components/ErrorText";
import FigureConsent from "@/components/FigureConsent";
import { askClaude, figureConsentGiven, figuresRemaining, recordFigureConsent, type ClaudeResult } from "@/lib/figure";
import { REQUEST_MAX_CHARS, buildFigurePayload, levelsToSend, type FigureMode } from "@/lib/figureSchema";
import type { FigureSpec } from "@/lib/figureSpec";
import type { Dataset } from "@/lib/spreadsheet";

// "Describe it" → Claude returns a figure description (or a code tweak),
// drawn locally like everything else. The exact request is shown before
// sending; nothing is sent without the consent notice (once per session).
export default function Describe({
  dataset,
  spec,
  onResult,
}: {
  dataset: Dataset;
  spec: FigureSpec | null;
  onResult: (r: ClaudeResult) => void;
}) {
  const [request, setRequest] = useState("");
  const [sendLevels, setSendLevels] = useState(false);
  const [pending, setPending] = useState<FigureMode | null>(null); // awaiting consent
  const [busy, setBusy] = useState<FigureMode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const labels = levelsToSend(dataset);
  const payload = buildFigurePayload(dataset, spec, request, { sendLevels, mode: "spec" });
  const remaining = figuresRemaining();

  async function run(mode: FigureMode) {
    setBusy(mode);
    setError(null);
    setSummary(null);
    try {
      const r = await askClaude(dataset, spec, request, { sendLevels, mode });
      setSummary(r.summary || null);
      onResult(r);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }
  function ask(mode: FigureMode) {
    // Labels are never sent on the session's earlier consent: the notice
    // listing them shows every time the box is ticked.
    if (figureConsentGiven() && !sendLevels) void run(mode);
    else setPending(mode);
  }

  const button = "rounded-sm border border-line bg-paper-alt px-4 py-2 text-sm hover:border-accent disabled:cursor-not-allowed disabled:opacity-60";
  return (
    <div data-testid="describe">
      <label className="flex flex-col gap-1 text-sm text-ink-soft">
        Describe the figure you want
        <textarea
          aria-label="Describe the figure"
          rows={3}
          maxLength={REQUEST_MAX_CHARS}
          value={request}
          onChange={(e) => setRequest(e.target.value)}
          placeholder="e.g. Two panels: change by arm as bars with points and Welch brackets against Placebo; dose against change with a regression line."
          className="rounded-sm border border-line bg-paper px-3 py-2 text-ink"
        />
      </label>
      <label className="mt-3 flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-1" checked={sendLevels} onChange={(e) => setSendLevels(e.target.checked)} />
        <span>
          Also send group labels{" "}
          <span className="text-ink-soft">
            ({Object.keys(labels).length ? Object.keys(labels).join(", ") : "no column qualifies"}) — lets you name groups (“compare against Placebo”).
            Only columns with at most 30 distinct values; a label can itself be sensitive, so this is off unless you tick it.
          </span>
        </span>
      </label>
      <div className="mt-3 flex flex-wrap gap-3">
        <button type="button" disabled={!request.trim() || !!busy || remaining <= 0} onClick={() => ask("spec")} className={button}>
          {busy === "spec" ? "Asking Claude…" : "Ask Claude for a figure"}
        </button>
        <button type="button" disabled={!request.trim() || !spec || !!busy || remaining <= 0} onClick={() => ask("hook")} className={button}>
          {busy === "hook" ? "Asking Claude…" : "Ask for a custom tweak (code)"}
        </button>
      </div>
      <p className="mt-2 text-xs text-ink-soft">
        {remaining > 0 ? `${remaining} of 5 free Claude requests left on this device.` : "No free Claude requests left on this device."} Templates, editing and
        exports are unlimited and never send anything.
      </p>
      {pending && (
        <FigureConsent
          labels={sendLevels ? labels : null}
          onConfirm={() => {
            recordFigureConsent();
            const mode = pending;
            setPending(null);
            void run(mode);
          }}
          onCancel={() => setPending(null)}
        />
      )}
      {error && <ErrorText>{error}</ErrorText>}
      {summary && <p className="mt-3 text-sm" data-testid="claude-summary">Claude: {summary}</p>}
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer text-accent">Exactly what would be sent</summary>
        <pre data-testid="figure-payload" className="mt-2 max-h-72 overflow-auto rounded-sm border border-line bg-paper-alt p-3 text-xs">
          {JSON.stringify(payload, null, 2)}
        </pre>
        <p className="mt-1 text-xs text-ink-soft">The custom-tweak button sends the same, with &quot;mode&quot;: &quot;hook&quot;.</p>
      </details>
    </div>
  );
}
