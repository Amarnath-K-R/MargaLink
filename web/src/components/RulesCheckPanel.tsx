import type { RulesCheckResult } from "@/lib/rulesCheck";
import CheckRow from "./CheckRow";

export default function RulesCheckPanel({ result }: { result: RulesCheckResult }) {
  return (
    <div className="mt-2 rounded-sm border border-line bg-paper-alt p-4">
      <p className="text-sm font-medium">
        {result.journalName} — {result.articleTypeLabel}
      </p>
      <dl className="mt-1">
        <CheckRow
          label="Word count"
          value={
            result.wordLimit != null
              ? `${result.wordCount.toLocaleString()} / ${result.wordLimit.toLocaleString()} limit`
              : `${result.wordCount.toLocaleString()} (no limit stated)`
          }
          detected={result.withinWordLimit ?? undefined}
        />
        {result.referenceStyleChecked && (
          <CheckRow
            label={`Reference style (${result.referenceStyleChecked === "bracket-numbered" ? "numbered [1]" : "author-year"})`}
            value={result.referenceStyleDetected ? "Detected" : "Not detected"}
            detected={result.referenceStyleDetected ?? undefined}
          />
        )}
        {result.statementChecks.map((c) => (
          <CheckRow key={c.key} label={c.label} value={c.found ? "Detected" : "Not detected"} detected={c.found} />
        ))}
      </dl>
      <p className="mt-3 text-xs text-ink-soft">
        Rule-based, not a guarantee — always confirm against the{" "}
        <a href={result.guidelinesUrl} target="_blank" rel="noopener noreferrer nofollow" className="text-accent hover:underline">
          journal&apos;s own current guidelines
        </a>{" "}
        (as published {result.asOf}).
      </p>
    </div>
  );
}
