// Client side of the LLM review feature — one of two features in the app
// that send something off the device (see CLAUDE.md's privacy rules), and
// the one that sends actual paper text; the other, figure.ts, sends only a
// spreadsheet's schema, never its values. This module owns what happens to
// the text before anything is sent (stripping, normalization, the size
// ceiling) and the per-device limit; reviewOrchestrator.ts does the sending.
// Callers MUST get explicit consent (components/ReviewConsent.tsx) before
// calling runReview() — neither module enforces that itself.
import { normalizeText } from "./reviewGrounding.ts";

// Refused before consent, never truncated: past this a paper is almost
// always carrying supplementary material that should be split off.
export const MAX_REVIEW_CHARS = 400_000;

// Strip author lines, then normalize (ligatures, hyphenation, quotes) once,
// so the model's verbatim quotes come back in the same alphabet the server's
// grounding check reads. Newlines survive — sectioning needs them.
export function prepareForReview(fullText: string): string {
  return normalizeText(stripIdentifyingInfo(fullText));
}

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

export function recordReviewUsed(): void {
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
