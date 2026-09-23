// Client side of "Ask Claude" on /figures — the second feature in the app
// that sends something off the device (the AI review sends paper text; this
// sends a description of the spreadsheet and the figure, never a value — see
// figureSchema.ts). Callers MUST get explicit consent (FigureConsent.tsx)
// before calling askClaude(); this module does the sending, limiting and
// response checking once consent exists.
import { buildFigurePayload, type FigureMode } from "./figureSchema.ts";
import { checkLabels, checkSpecAgainstColumns, mergeTextFields, validateFigureSpec, type FigureSpec } from "./figureSpec.ts";
import { isCodeSafeToRun } from "./figurePrompt.ts";
import type { Dataset } from "./spreadsheet.ts";

const USAGE_KEY = "margalink-figure-uses";
// Higher than the review's 3 — a figure is a fraction of the review's
// token cost, and iterating on chart type/columns is the expected
// workflow. Local edits, renders and exports never count — only a call.
export const FREE_FIGURES_PER_DEVICE = 5;

export function figuresUsed(): number {
  try {
    return Number(localStorage.getItem(USAGE_KEY) ?? "0");
  } catch {
    return 0; // storage blocked (private browsing etc.) — treat as unused rather than block the feature
  }
}

export function figuresRemaining(): number {
  return Math.max(0, FREE_FIGURES_PER_DEVICE - figuresUsed());
}

function recordFigureUsed(): void {
  try {
    localStorage.setItem(USAGE_KEY, String(figuresUsed() + 1));
  } catch {
    // ignore — worst case the per-device counter under-counts
  }
}

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

export class FigureLimitError extends Error {}
export class FigureCapacityError extends Error {}

export type ClaudeResult = { kind: "spec"; spec: FigureSpec; summary: string } | { kind: "hook"; hook: string; summary: string };

// One call to /api/figure. `spec` is the current figure (or null to start
// fresh); `endpoint` is overridable for tests. Everything Claude returns is
// checked again here before the page may render it.
export async function askClaude(
  dataset: Dataset,
  spec: FigureSpec | null,
  request: string,
  opts: { sendLevels: boolean; mode: FigureMode; endpoint?: string },
): Promise<ClaudeResult> {
  if (figuresRemaining() <= 0) {
    throw new FigureLimitError(`You've used all ${FREE_FIGURES_PER_DEVICE} free Claude requests on this device. Templates and editing still work.`);
  }
  // buildFigurePayload is the only thing allowed to construct this body.
  const payload = buildFigurePayload(dataset, spec, request, opts);
  const res = await fetch(opts.endpoint ?? "/api/figure", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (res.status === 429) throw new FigureCapacityError("This pilot is fully booked for today — try again tomorrow.");
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(detail && res.status < 500 ? detail : `Claude request failed (${res.status})${detail ? `: ${detail}` : ""}`);
  }
  const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  const summary = typeof data?.summary === "string" ? data.summary : "";
  recordFigureUsed();

  if (opts.mode === "hook") {
    const hook = typeof data?.hook === "string" ? data.hook : "";
    if (!hook.includes("def customize(")) throw new Error("Claude's tweak didn't define customize(fig, axes, df).");
    const unsafe = isCodeSafeToRun(hook);
    if (unsafe) throw new Error(unsafe);
    return { kind: "hook", hook, summary };
  }
  const returned = validateFigureSpec(data?.spec);
  if (typeof returned === "string") throw new Error(`Claude's figure description wasn't valid: ${returned}`);
  const merged = spec ? mergeTextFields(spec, returned) : returned;
  const problem = checkSpecAgainstColumns(dataset.columns, merged) ?? checkLabels(merged, payload.levels);
  if (problem) throw new Error(`Claude's figure description didn't fit your data: ${problem}`);
  return { kind: "spec", spec: merged, summary };
}
