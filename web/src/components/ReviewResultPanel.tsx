import type { Citation, ReviewResult } from "@/lib/review";

// Every citation shown here already passed a server-side check that its
// quote actually appears in the paper (see filterGrounded in
// functions/api/review.ts) — showing the real quote, not just a
// description, is what lets you verify a finding yourself at a glance.
function CitationList({ citations }: { citations: Citation[] }) {
  if (citations.length === 0) return null;
  return (
    <ul className="mt-1 space-y-1">
      {citations.map((c, i) => (
        <li key={i} className="border-l-2 border-line pl-2 text-xs italic text-ink-soft">
          &ldquo;{c.quote}&rdquo; <span className="not-italic">— {c.section}</span>
        </li>
      ))}
    </ul>
  );
}

export default function ReviewResultPanel({ result }: { result: ReviewResult }) {
  const fitColor =
    result.journalFit.assessment === "good"
      ? "text-accent"
      : result.journalFit.assessment === "poor"
        ? "text-away"
        : "text-ink-soft";
  return (
    <div className="mt-2 rounded-sm border border-line bg-paper-alt p-4 text-sm">
      <p>
        <span className="font-medium">Journal fit: </span>
        <span className={fitColor}>{result.journalFit.assessment}</span> — {result.journalFit.explanation}
      </p>

      {result.inconsistencies.length > 0 && (
        <div className="mt-3">
          <p className="font-medium">Inconsistencies</p>
          <ul className="mt-1 list-disc space-y-3 pl-5 text-ink-soft">
            {result.inconsistencies.map((item, i) => (
              <li key={i}>
                {item.description}
                <CitationList citations={item.citations} />
              </li>
            ))}
          </ul>
        </div>
      )}

      {result.statisticalReporting.length > 0 && (
        <div className="mt-3">
          <p className="font-medium">Statistical reporting</p>
          <ul className="mt-1 list-disc space-y-3 pl-5 text-ink-soft">
            {result.statisticalReporting.map((item, i) => (
              <li key={i}>
                <span className={item.severity === "major" ? "text-away" : ""}>{item.description}</span>
                <CitationList citations={item.citations} />
              </li>
            ))}
          </ul>
        </div>
      )}

      {result.otherObservations.length > 0 && (
        <div className="mt-3">
          <p className="font-medium">Other observations</p>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-ink-soft">
            {result.otherObservations.map((obs, i) => (
              <li key={i}>{obs}</li>
            ))}
          </ul>
        </div>
      )}

      <p className="mt-3 text-xs text-ink-soft">
        LLM-generated — a second opinion to consider, not a guarantee of anything.
      </p>
    </div>
  );
}
