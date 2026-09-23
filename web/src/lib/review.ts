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
