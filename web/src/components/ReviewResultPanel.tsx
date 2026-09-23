import type { Citation, ReviewResult } from "@/lib/reviewTypes";

// Every citation shown here is a quote that was verified server-side against
// the section it came from (groundExtractOutput in reviewGrounding.ts), and
// cross-section findings can only point at those verified quotes by id
// (validateSynthesisOutput in reviewPasses.ts) — showing the real quote, not
// just a description, is what lets you check a finding yourself at a glance.
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

function coverageLine({ reviewed, failed, skipped }: ReviewResult["coverage"]): string {
  let line = `Reviewed ${reviewed.length} of ${reviewed.length + failed.length} sections`;
  if (failed.length) line += ` — ${failed.map((f) => `${f.title} couldn't be checked (${f.reason})`).join("; ")}`;
  if (skipped.length) line += `. Not reviewed at this depth: ${skipped.map((s) => s.title).join(", ")}`;
  return `${line}.`;
}

export default function ReviewResultPanel({ result, partial = false }: { result: ReviewResult; partial?: boolean }) {
  const fit = result.journalFit;
  const fitColor = fit?.assessment === "good" ? "text-accent" : fit?.assessment === "poor" ? "text-away" : "text-ink-soft";
  return (
    <div className="mt-4 rounded-sm border border-line bg-paper-alt p-4 text-sm">
      <p>
        <span className="font-medium">Journal fit: </span>
        {fit ? (
          <>
            <span className={fitColor}>{fit.assessment}</span> — {fit.explanation}
          </>
        ) : (
          <span className="text-ink-soft">pending cross-check</span>
        )}
      </p>

      {result.summary.length > 0 && (
        <div className="mt-3" data-testid="review-summary">
          <p className="font-medium">Fix these first</p>
          <ol className="mt-1 list-decimal space-y-3 pl-5">
            {result.summary.map((item, i) => (
              <li key={i}>
                <span className={item.severity === "major" ? "text-away" : "text-ink-soft"}>{item.text}</span>
                <CitationList citations={item.citations} />
              </li>
            ))}
          </ol>
        </div>
      )}

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

      <p className="mt-3 text-xs text-ink-soft" data-testid="review-coverage">
        {coverageLine(result.coverage)}
      </p>
      <p className="mt-1 text-xs text-ink-soft">
        LLM-generated — a second opinion to consider, not a guarantee of anything.
        {partial ? " Results so far — the cross-check hasn't run yet." : ""}
      </p>
    </div>
  );
}
