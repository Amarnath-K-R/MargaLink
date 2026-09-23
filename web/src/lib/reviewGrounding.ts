// The security-relevant anti-fabrication check behind functions/api/review.ts
// (imported there via a relative path — Cloudflare Pages routes every file
// inside functions/ as an endpoint, so shared code has to live outside it).
// Pulled out specifically because this had zero test coverage before this
// split, despite being the one thing standing between a model hallucinating
// a quote and that quote reaching the client. See docs/ARCHITECTURE.md's
// "The AI review: what it defends against, and why."
import type { Citation, ReviewResult } from "./reviewTypes.ts";

export function normalize(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

// Real, deterministic check — never trust the model's own claim that a
// quote is verbatim. Fuzzy on whitespace/case only; the substance must
// actually appear in the source, or the finding is dropped before it ever
// reaches the client, not just flagged as suspicious.
export function quoteAppearsInSource(quote: string, source: string): boolean {
  const q = normalize(quote);
  if (q.length < 8) return false; // too short to be a meaningful citation
  return normalize(source).includes(q);
}

export function filterGrounded(result: ReviewResult, sourceText: string): ReviewResult {
  const groundCitations = (citations: Citation[]) => citations.filter((c) => quoteAppearsInSource(c.quote, sourceText));

  return {
    ...result,
    inconsistencies: result.inconsistencies
      .map((f) => ({ ...f, citations: groundCitations(f.citations) }))
      .filter((f) => f.citations.length > 0),
    statisticalReporting: result.statisticalReporting
      .map((f) => ({ ...f, citations: groundCitations(f.citations) }))
      .filter((f) => f.citations.length > 0),
  };
}
