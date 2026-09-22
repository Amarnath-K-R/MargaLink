import type { FormatCheckResult } from "@/lib/formatCheck";
import CheckRow from "@/components/CheckRow";

export default function FormatCheckPanel({ result }: { result: FormatCheckResult }) {
  return (
    <section className="mt-12 border-t border-line pt-8">
      <h2 className="font-serif text-xl font-medium">Format check</h2>
      <p className="mt-1 text-sm text-ink-soft">
        General structure, detected from your paper&apos;s text — not yet
        checked against your chosen journal&apos;s specific limits.
      </p>

      <dl className="mt-6">
        <CheckRow label="Word count" value={result.wordCount.toLocaleString()} />
        <CheckRow
          label="Abstract"
          value={
            result.abstract.found
              ? `Found, ${result.abstract.wordCount ?? "?"} words${result.abstract.structured ? " (structured)" : ""}`
              : "Not detected"
          }
          detected={result.abstract.found}
        />
        <CheckRow
          label="Ethics statement"
          value={result.requiredSections.ethics ? "Detected" : "Not detected"}
          detected={result.requiredSections.ethics}
        />
        <CheckRow
          label="Funding statement"
          value={result.requiredSections.funding ? "Detected" : "Not detected"}
          detected={result.requiredSections.funding}
        />
        <CheckRow
          label="Conflicts of interest"
          value={result.requiredSections.conflictsOfInterest ? "Detected" : "Not detected"}
          detected={result.requiredSections.conflictsOfInterest}
        />
        <CheckRow
          label="Data availability statement"
          value={result.requiredSections.dataAvailability ? "Detected" : "Not detected"}
          detected={result.requiredSections.dataAvailability}
        />
        <CheckRow
          label="References (approximate)"
          value={result.referenceCount != null ? String(result.referenceCount) : "Not detected"}
          detected={result.referenceCount != null}
        />
        <CheckRow label="Figures referenced" value={String(result.figureCount)} />
        <CheckRow label="Tables referenced" value={String(result.tableCount)} />
      </dl>
    </section>
  );
}
