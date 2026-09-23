// Client side of the LLM review feature — one of two features in the app
// that send something off the device (see CLAUDE.md's privacy rules), and
// the one that sends actual paper text; the other, figure.ts, sends only a
// spreadsheet's schema, never its values. Callers
// MUST get explicit consent (see components/ReviewConsent.tsx) before
// calling requestReview(); this module doesn't enforce that itself, it just
// does the sending, limiting, and response validation once consent exists.
// Types live in reviewTypes.ts — the one file both this client module and
// functions/api/review.ts import from. Import the types you need from
// @/lib/reviewTypes directly rather than through here.
import type { ReviewResult, ReviewTier } from "./reviewTypes.ts";

const USAGE_KEY = "margalink-review-uses";
export const FREE_REVIEWS_PER_DEVICE = 3;

export function reviewsUsed(): number {
  try {
    return Number(localStorage.getItem(USAGE_KEY) ?? "0");
  } catch {
    return 0; // storage blocked (private browsing etc.) — treat as unused rather than block the feature
  }
}

export function reviewsRemaining(): number {
  return Math.max(0, FREE_REVIEWS_PER_DEVICE - reviewsUsed());
}

function recordReviewUsed(): void {
  try {
    localStorage.setItem(USAGE_KEY, String(reviewsUsed() + 1));
  } catch {
    // ignore — worst case the per-device counter under-counts
  }
}

// Best-effort, not a guarantee: strips lines in the first ~500 characters
// that look like a name/affiliation byline or an email address, so at
// minimum the *authors* aren't identifiable in what gets sent, even though
// the paper's substantive content still is. Labeled as best-effort in the
// consent UI — never claim more than this actually does.
export function stripIdentifyingInfo(text: string): string {
  const head = text.slice(0, 500);
  const rest = text.slice(500);
  const cleanedHead = head
    .split("\n")
    .map((line) => {
      if (/[\w.+-]+@[\w-]+\.[\w.-]+/.test(line)) return "[redacted]";
      // A short line, title-cased, comma-separated names — the shape of a
      // byline ("John Smith, Jane Doe") rather than prose.
      if (/^[A-Z][a-zA-Z.'-]+(?:\s+[A-Z][a-zA-Z.'-]+)*(?:\s*,\s*[A-Z][a-zA-Z.'-]+(?:\s+[A-Z][a-zA-Z.'-]+)*)+$/.test(
        line.trim()
      )) {
        return "[redacted]";
      }
      return line;
    })
    .join("\n");
  return cleanedHead + rest;
}

export class ReviewLimitError extends Error {}
export class ReviewCapacityError extends Error {}

function isValidReviewResult(v: unknown): v is ReviewResult {
  if (!v || typeof v !== "object") return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r.journalFit === "object" &&
    r.journalFit !== null &&
    ["good", "possible", "poor"].includes((r.journalFit as Record<string, unknown>).assessment as string) &&
    Array.isArray(r.inconsistencies) &&
    r.inconsistencies.every((f) => Array.isArray((f as { citations?: unknown }).citations)) &&
    Array.isArray(r.statisticalReporting) &&
    r.statisticalReporting.every((f) => Array.isArray((f as { citations?: unknown }).citations)) &&
    Array.isArray(r.otherObservations)
  );
}

// `endpoint` is overridable for testing against a local mock instead of the
// real Cloudflare Pages Function.
export async function requestReview(
  fullText: string,
  journalId: string,
  tier: ReviewTier = "standard",
  endpoint = "/api/review"
): Promise<ReviewResult> {
  if (reviewsRemaining() <= 0) {
    throw new ReviewLimitError(`You've used all ${FREE_REVIEWS_PER_DEVICE} free pilot reviews on this device.`);
  }

  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: stripIdentifyingInfo(fullText), journalId, tier }),
  });

  if (res.status === 429) {
    throw new ReviewCapacityError("This pilot is fully booked for today — try again tomorrow.");
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Review request failed (${res.status})${detail ? `: ${detail}` : ""}`);
  }

  const data: unknown = await res.json();
  if (!isValidReviewResult(data)) {
    throw new Error("Review response didn't match the expected shape");
  }

  recordReviewUsed();
  return data;
}
