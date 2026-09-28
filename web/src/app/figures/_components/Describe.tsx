"use client";

import { useState } from "react";
import ErrorText from "@/components/ErrorText";
import FigureConsent from "@/components/FigureConsent";
import SignInPanel from "@/components/SignInPanel";
import { refreshAccount, setBalance, useAccount } from "@/components/useAccount";
import { FIGURE_PRICE, NotEnoughCoinsError, SignInRequiredError, WELCOME_COINS } from "@/lib/coins";
import { askClaude, figureConsentGiven, recordFigureConsent, type ClaudeResult } from "@/lib/figure";
import { REQUEST_MAX_CHARS, buildFigurePayload, levelsToSend, type FigureMode } from "@/lib/figureSchema";
import type { FigureSpec } from "@/lib/figureSpec";
import type { Dataset } from "@/lib/spreadsheet";

// "Describe it" → Claude returns a figure description (or a code tweak),
// drawn locally like everything else. The exact request is shown before
// sending; nothing is sent without the consent notice (once per session).
// Each request costs 1 M coin; signed out, the button signs you in here.
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
  const [signingIn, setSigningIn] = useState(false);
  const account = useAccount();
  const balance = account.status === "in" ? account.balance : 0;
  const labels = levelsToSend(dataset);
  const payload = buildFigurePayload(dataset, spec, request, { sendLevels, mode: "spec" });

  async function run(mode: FigureMode) {
    setBusy(mode);
    setError(null);
    setSummary(null);
    try {
      const r = await askClaude(dataset, spec, request, { sendLevels, mode });
      if (r.balance !== null) setBalance(r.balance);
      setSummary(r.summary || null);
      onResult(r);
    } catch (err) {
      if (err instanceof NotEnoughCoinsError) setBalance(err.balance);
      if (err instanceof SignInRequiredError) void refreshAccount();
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

  const button = "clay-btn h-9 px-4 text-sm";
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
          className="clay-input text-ink"
        />
      </label>
      <label className="mt-3 flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-1" checked={sendLevels} onChange={(e) => setSendLevels(e.target.checked)} />
        <span>
          Also send group labels{" "}
          <span className="text-ink-soft">
            ({Object.keys(labels).length ? Object.keys(labels).join(", ") : "no column qualifies"}): lets you name groups (“compare against Placebo”).
            Only columns with at most 30 distinct values; a label can itself be sensitive, so this is off unless you tick it.
          </span>
        </span>
      </label>
      {account.status === "out" ? (
        <div className="mt-3">
          <button type="button" aria-expanded={signingIn} onClick={() => setSigningIn((o) => !o)} className={button}>
            Sign in to ask Claude
          </button>
          {signingIn && (
            <div className="sheet mt-3 max-w-md p-5">
              <SignInPanel
                lead={
                  <p className="text-sm leading-relaxed text-ink-soft">
                    Each request costs {FIGURE_PRICE} M coin; new accounts get {WELCOME_COINS}. Your data and figure stay as they are while you sign in.
                  </p>
                }
              />
            </div>
          )}
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap gap-3">
          <button type="button" disabled={!request.trim() || !!busy || account.status !== "in" || balance < FIGURE_PRICE} onClick={() => ask("spec")} className={button}>
            {busy === "spec" ? "Asking Claude…" : "Ask Claude for a figure"}
          </button>
          <button type="button" disabled={!request.trim() || !spec || !!busy || account.status !== "in" || balance < FIGURE_PRICE} onClick={() => ask("hook")} className={button}>
            {busy === "hook" ? "Asking Claude…" : "Ask for a custom tweak (code)"}
          </button>
        </div>
      )}
      <p className="mt-2 text-xs text-ink-soft">
        {account.status === "in" && `Each request costs ${FIGURE_PRICE} M coin (you have ${balance}); a request that fails is refunded. `}
        {account.status === "in" && balance < FIGURE_PRICE && (
          <>
            <a href="/pricing#packs" target="_blank" rel="noopener" className="text-accent hover:underline">
              Buy coins
            </a>{" "}
            (a new tab; your data stays here).{" "}
          </>
        )}
        Templates, editing and exports are unlimited and never send anything.
      </p>
      {pending && (
        <FigureConsent
          labels={sendLevels ? labels : null}
          balance={balance}
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
        <pre data-testid="figure-payload" className="clay-well mt-2 max-h-72 overflow-auto p-3 text-xs">
          {JSON.stringify(payload, null, 2)}
        </pre>
        <p className="mt-1 text-xs text-ink-soft">The custom-tweak button sends the same, with &quot;mode&quot;: &quot;hook&quot;.</p>
      </details>
    </div>
  );
}
