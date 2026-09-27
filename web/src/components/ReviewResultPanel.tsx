import type { Citation, ReviewResult } from "@/lib/reviewTypes";

// Every citation shown here is a quote that was verified server-side against
// the section it came from (groundExtractOutput in reviewGrounding.ts), and
// cross-section findings can only point at those verified quotes by id
// (validateSynthesisOutput in reviewPasses.ts) — showing the real quote, not
// just a description, is what lets you check a finding yourself at a glance.
// `onCitation` (the writing workspace): a "Jump to source" that finds the
// quoted passage in the LaTeX.
function CitationList({ citations, onCitation }: { citations: Citation[]; onCitation?: (c: Citation) => void }) {
  if (citations.length === 0) return null;
  return (
    <ul className="mt-2 space-y-1.5">
      {citations.map((c, i) => (
        <li key={i} className="border-l-2 border-accent/35 pl-3 text-xs italic leading-relaxed text-ink-soft">
          &ldquo;{c.quote}&rdquo; <span className="not-italic">— {c.section}</span>
          {onCitation && (
            <button type="button" onClick={() => onCitation(c)} className="clay-chip ml-2 h-6 not-italic">
              Jump to source
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

function coverageLine({ reviewed, failed, pending, skipped }: ReviewResult["coverage"]): string {
  let line = `Reviewed ${reviewed.length} of ${reviewed.length + failed.length + pending.length} sections`;
  if (failed.length) line += ` — ${failed.map((f) => `${f.title} couldn't be checked (${f.reason})`).join("; ")}`;
  if (pending.length) line += ` — ${pending.length} not reviewed yet`;
  if (skipped.length) line += `. Not reviewed at this depth: ${skipped.map((s) => s.title).join(", ")}`;
  return `${line}.`;
}

export default function ReviewResultPanel({ result, partial = false, onCitation }: { result: ReviewResult; partial?: boolean; onCitation?: (c: Citation) => void }) {
  const fit = result.journalFit;
  const fitTone =
    fit?.assessment === "good" ? "bg-accent text-white" : fit?.assessment === "poor" ? "bg-[#f1d2c2] text-away" : "bg-[#ecdcc0] text-ink";
  return (
    <div className="sheet mt-6 p-6 text-sm sm:p-8">
      <p className="text-xs font-medium text-accent">The review</p>
      <p className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1 leading-relaxed">
        <span className="font-serif text-lg font-medium">Journal fit</span>
        {fit ? (
          <>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${fitTone}`}>{fit.assessment}</span>
            <span className="basis-full text-ink-soft">{fit.explanation}</span>
          </>
        ) : (
          <span className="text-ink-soft">pending cross-check</span>
        )}
      </p>

      {result.summary.length > 0 && (
        <div className="mt-6 border-t border-line/70 pt-5" data-testid="review-summary">
          <p className="font-serif text-lg font-medium">Fix these first</p>
          <ol className="mt-2 list-decimal space-y-4 pl-5 marker:text-ink-soft">
            {result.summary.map((item, i) => (
              <li key={i}>
                <span className={item.severity === "major" ? "text-away" : "text-ink-soft"}>{item.text}</span>
                <CitationList citations={item.citations} onCitation={onCitation} />
              </li>
            ))}
          </ol>
        </div>
      )}

      {result.inconsistencies.length > 0 && (
        <div className="mt-6 border-t border-line/70 pt-5">
          <p className="font-serif text-lg font-medium">Inconsistencies</p>
          <ul className="mt-1 list-disc space-y-3 pl-5 text-ink-soft">
            {result.inconsistencies.map((item, i) => (
              <li key={i}>
                {item.description}
                <CitationList citations={item.citations} onCitation={onCitation} />
              </li>
            ))}
          </ul>
        </div>
      )}

      {result.statisticalReporting.length > 0 && (
        <div className="mt-6 border-t border-line/70 pt-5">
          <p className="font-serif text-lg font-medium">Statistical reporting</p>
          <ul className="mt-1 list-disc space-y-3 pl-5 text-ink-soft">
            {result.statisticalReporting.map((item, i) => (
              <li key={i}>
                <span className={item.severity === "major" ? "text-away" : ""}>{item.description}</span>
                <CitationList citations={item.citations} onCitation={onCitation} />
              </li>
            ))}
          </ul>
        </div>
      )}

      {result.otherObservations.length > 0 && (
        <div className="mt-6 border-t border-line/70 pt-5">
          <p className="font-serif text-lg font-medium">Other observations</p>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-ink-soft">
            {result.otherObservations.map((obs, i) => (
              <li key={i}>{obs}</li>
            ))}
          </ul>
        </div>
      )}

      <p className="mt-6 border-t border-line/70 pt-4 text-xs text-ink-soft" data-testid="review-coverage">
        {coverageLine(result.coverage)}
      </p>
      <p className="mt-1 text-xs text-ink-soft">
        LLM-generated — a second opinion to consider, not a guarantee of anything.
        {partial ? " Results so far — the cross-check hasn't run yet." : ""}
      </p>
    </div>
  );
}
