// Client side of the figure-generation feature — the second feature in the
// app that sends something off the device (the AI review sends paper
// text; this sends a spreadsheet's column names and chosen chart, never
// its values — see figureSchema.ts). Callers MUST get explicit consent
// (see components/FigureConsent.tsx) before calling requestFigureCode();
// this module doesn't enforce that itself, it just does the sending,
// limiting, and response validation once consent exists. Import types
// from @/lib/figureSchema directly rather than through here.
import { buildFigurePayload, type FigureSpec } from "./figureSchema.ts";
import type { Dataset } from "./spreadsheet.ts";

const USAGE_KEY = "margalink-figure-uses";
// Higher than the review's 3 — a figure is a fraction of the review's
// token cost, and iterating on chart type/columns is the expected
// workflow. A regenerate counts as a use, same as any other generation.
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
// every single generation regardless — see FigureSpecForm.tsx.
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

// `endpoint` is overridable for testing against a local mock instead of
// the real Cloudflare Pages Function. Returns the generated Python code
// as text — figureRunner.ts is what actually runs it, locally, against
// the real dataset.
export async function requestFigureCode(dataset: Dataset, spec: FigureSpec, endpoint = "/api/figure"): Promise<string> {
  if (figuresRemaining() <= 0) {
    throw new FigureLimitError(`You've used all ${FREE_FIGURES_PER_DEVICE} free pilot figures on this device.`);
  }

  // buildFigurePayload is the only thing allowed to construct this body —
  // see figureSchema.ts.
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(buildFigurePayload(dataset, spec)),
  });

  if (res.status === 429) {
    throw new FigureCapacityError("This pilot is fully booked for today — try again tomorrow.");
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Figure request failed (${res.status})${detail ? `: ${detail}` : ""}`);
  }

  const data: unknown = await res.json();
  if (!data || typeof data !== "object" || typeof (data as { code?: unknown }).code !== "string") {
    throw new Error("Figure response didn't match the expected shape");
  }

  recordFigureUsed();
  return (data as { code: string }).code;
}
