import Link from "next/link";
import type { MatchResult } from "@/lib/match";
import { findJournalRules, type JournalRules } from "@/lib/journalRules";
import type { RulesCheckResult } from "@/lib/rulesCheck";
import JournalDetail from "@/components/JournalDetail";
import { JournalResultTitle, JournalResultChips } from "@/components/JournalResultRow";
import RulesCheckPanel from "@/components/RulesCheckPanel";

export default function MatchResults({
  results,
  expandedResultId,
  onToggleExpand,
  rulesChecks,
  openRulesCheckId,
  onToggleRulesCheck,
}: {
  results: MatchResult[];
  expandedResultId: string | null;
  onToggleExpand: (id: string) => void;
  rulesChecks: Record<string, RulesCheckResult>;
  openRulesCheckId: string | null;
  onToggleRulesCheck: (id: string) => void;
}) {
  if (results.length === 0) {
    return <p className="text-ink-soft">No journals match these filters. Try widening them.</p>;
  }

  return (
    <ol data-testid="results">
      {results.map((r, i) => {
        const expanded = expandedResultId === r.id;
        const journalRules: JournalRules | undefined = findJournalRules(r.id);
        const rulesOpen = openRulesCheckId === r.id;
        const rulesResult = rulesChecks[r.id];
        return (
          <li key={r.id} className="border-t border-line py-3 first:border-t-0">
            <div className="flex items-baseline justify-between gap-4">
              <span className="flex gap-3">
                <span className="text-ink-soft">{i + 1}</span>
                <JournalResultTitle journal={r} expanded={expanded} onToggleExpand={() => onToggleExpand(r.id)} />
              </span>
              <span className="font-mono text-xs text-ink-soft">{(r.score / 127 / 127).toFixed(3)}</span>
            </div>
            <JournalResultChips journal={r} indent />
            {expanded && (
              <div className="mt-3 rounded-sm border border-line bg-paper-alt p-4 pl-6">
                <JournalDetail journal={r} />
              </div>
            )}
            {journalRules && (
              <div className="pl-6">
                <button
                  type="button"
                  onClick={() => onToggleRulesCheck(r.id)}
                  className="mt-1.5 text-xs text-accent hover:underline"
                  aria-expanded={rulesOpen}
                >
                  {rulesOpen ? "Hide" : "Check against"} {journalRules.journalName}&apos;s rules
                </button>
                {rulesOpen && rulesResult && <RulesCheckPanel result={rulesResult} />}
              </div>
            )}
            {journalRules && (
              <div className="pl-6">
                <Link href="/review" className="mt-1.5 inline-block text-xs text-accent hover:underline">
                  AI review available for {journalRules.journalName} →
                </Link>
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
