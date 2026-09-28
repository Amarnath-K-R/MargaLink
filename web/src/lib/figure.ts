// Client side of "Ask Claude" on /figures — the second feature in the app
// that sends something off the device (the AI review sends paper text; this
// sends a description of the spreadsheet and the figure, never a value — see
// figureSchema.ts). Callers MUST get explicit consent (FigureConsent.tsx)
// before calling askClaude(); this module does the sending and response
// checking once consent exists. Each call costs 1 M coin, charged (and
// refunded when the answer isn't usable) by the Function.
import { buildFigurePayload, type FigureMode } from "./figureSchema.ts";
import { checkLabels, checkSpecAgainstColumns, mergeTextFields, validateFigureSpec, type FigureSpec } from "./figureSpec.ts";
import { isCodeSafeToRun } from "./figurePrompt.ts";
import type { Dataset } from "./spreadsheet.ts";
import { NotEnoughCoinsError, SignInRequiredError } from "./coins.ts";

// Session-scoped, not per-figure like the review's consent: the disclosed
// payload shape is identical every time and never contains document
// content, so re-confirming per figure would just train people to click
// through notices. The exact payload is still shown on the page before
// every single call regardless — see Describe.tsx. Ticking "also send the
// group labels" is asked afresh each time (it's page state, not stored).
const CONSENT_KEY = "margalink-figure-consent";

export function figureConsentGiven(): boolean {
  try {
    return sessionStorage.getItem(CONSENT_KEY) === "1";
  } catch {
    return false;
  }
}

export function recordFigureConsent(): void {
  try {
    sessionStorage.setItem(CONSENT_KEY, "1");
  } catch {
    // ignore — worst case the consent dialog reappears next generation
  }
}

export class FigureCapacityError extends Error {}

// `balance`: the account's M coins after this request, when the server said.
export type ClaudeResult = ({ kind: "spec"; spec: FigureSpec } | { kind: "hook"; hook: string }) & { summary: string; balance: number | null };

// One call to /api/figure. `spec` is the current figure (or null to start
// fresh); `endpoint` is overridable for tests. Everything Claude returns is
// checked again here before the page may render it.
export async function askClaude(
  dataset: Dataset,
  spec: FigureSpec | null,
  request: string,
  opts: { sendLevels: boolean; mode: FigureMode; endpoint?: string },
): Promise<ClaudeResult> {
  // buildFigurePayload is the only thing allowed to construct this body.
  const payload = buildFigurePayload(dataset, spec, request, opts);
  const res = await fetch(opts.endpoint ?? "/api/figure", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (res.status === 429) throw new FigureCapacityError("Ask Claude is fully booked for today. Try again tomorrow; nothing was charged.");
  if (res.status === 401) throw new SignInRequiredError();
  if (res.status === 402) {
    const { coins, balance } = (await res.json()) as { coins: number; balance: number };
    throw new NotEnoughCoinsError(coins, balance);
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(detail && res.status < 500 ? detail : `Claude request failed (${res.status})${detail ? `: ${detail}` : ""}`);
  }
  const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  const summary = typeof data?.summary === "string" ? data.summary : "";
  const balance = typeof data?.balance === "number" ? data.balance : null;

  if (opts.mode === "hook") {
    const hook = typeof data?.hook === "string" ? data.hook : "";
    if (!hook.includes("def customize(")) throw new Error("Claude's tweak didn't define customize(fig, axes, df).");
    const unsafe = isCodeSafeToRun(hook);
    if (unsafe) throw new Error(unsafe);
    return { kind: "hook", hook, summary, balance };
  }
  const returned = validateFigureSpec(data?.spec);
  if (typeof returned === "string") throw new Error(`Claude's figure description wasn't valid: ${returned}`);
  const merged = spec ? mergeTextFields(spec, returned) : returned;
  const problem = checkSpecAgainstColumns(dataset.columns, merged) ?? checkLabels(merged, payload.levels);
  if (problem) throw new Error(`Claude's figure description didn't fit your data: ${problem}`);
  return { kind: "spec", spec: merged, summary, balance };
}
