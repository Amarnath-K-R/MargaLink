import Link from "next/link";
import type { MatchResult } from "@/lib/match/match";
import { findJournalRules, type JournalRules } from "@/lib/journals/journalRules";
import { shortId } from "@/lib/journals/journalUrl";
import type { RulesCheckResult } from "@/lib/checks/rulesCheck";
import JournalDetail from "@/components/journals/JournalDetail";
import WhyThisJournal from "./WhyThisJournal.tsx";
import { JournalResultTitle, JournalResultChips } from "@/components/journals/JournalResultRow";
import RulesCheckPanel from "@/components/checks/RulesCheckPanel";

// The ranked list. On /match each row links on to the review and writing
// pages; inside the writing workspace's Match window the callbacks below
// keep everything on the page (`onReview` opens its Review window,
// `onSetTarget` makes the journal the project's target, `expandOnly` shows
// details inline instead of leaving for the journal page).
export default function MatchResults({
  results,
  expandedResultId,
  onToggleExpand,
  rulesChecks,
  openRulesCheckId,
  onToggleRulesCheck,
  openWhyId,
  onToggleWhy,
  topicNames,
  onReview,
  onSetTarget,
  targetJournalId,
  expandOnly = false,
}: {
  results: MatchResult[];
  expandedResultId: string | null;
  onToggleExpand: (id: string) => void;
  rulesChecks: Record<string, RulesCheckResult>;
  openRulesCheckId: string | null;
  onToggleRulesCheck: (id: string) => void;
  openWhyId: string | null;
  onToggleWhy: (id: string) => void;
  topicNames: Record<string, string>;
  onReview?: (journalId: string) => void;
  onSetTarget?: (id: string, name: string) => void;
  targetJournalId?: string | null;
  expandOnly?: boolean;
}) {
  if (results.length === 0) {
    return <p className="clay-well px-5 py-6 text-center text-ink-soft">No journals match these filters. Try widening them.</p>;
  }

  return (
    <ol data-testid="results" className="space-y-3">
      {results.map((r, i) => {
        const expanded = expandedResultId === r.id;
        const journalRules: JournalRules | undefined = findJournalRules(r.id);
        const rulesOpen = openRulesCheckId === r.id;
        const rulesResult = rulesChecks[r.id];
        return (
          <li key={r.id} className="clay rounded-[18px] px-4 py-4 sm:px-5">
            <div className="flex items-start gap-4">
              <span aria-hidden className="bead mt-0.5 h-7 w-7 shrink-0 font-mono text-xs" style={{ background: i < 3 ? "#cfe0e1" : "#ebe8df" }}>
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-4">
                  <span className="font-serif text-lg leading-snug">
                    <JournalResultTitle journal={r} expanded={expanded} onToggleExpand={() => onToggleExpand(r.id)} expandOnly={expandOnly} />
                  </span>
                  <FitBadge r={r} />
                </div>
                <JournalResultChips journal={r} />
                {expanded && (
                  <div className="sheet mt-4 p-5 text-sm">
                    <JournalDetail journal={r} topicNames={topicNames} />
                  </div>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" onClick={() => onToggleWhy(r.id)} className="clay-chip" aria-expanded={openWhyId === r.id}>
                    {openWhyId === r.id ? "Hide why" : "Why this journal"}
                  </button>
                  {journalRules && (
                    <button type="button" onClick={() => onToggleRulesCheck(r.id)} className="clay-chip" aria-expanded={rulesOpen}>
                      {rulesOpen ? "Hide" : "Check against"} {journalRules.journalName}&apos;s rules
                    </button>
                  )}
                  {journalRules &&
                    (onReview ? (
                      <button type="button" onClick={() => onReview(r.id)} className="clay-chip">
                        AI review available for {journalRules.journalName} →
                      </button>
                    ) : (
                      <Link href="/review" className="clay-chip">
                        AI review available for {journalRules.journalName} →
                      </Link>
                    ))}
                  {onSetTarget ? (
                    <button type="button" onClick={() => onSetTarget(r.id, r.display_name)} aria-pressed={targetJournalId === r.id} className="clay-chip">
                      {targetJournalId === r.id ? "Target journal ✓" : "Set as target journal"}
                    </button>
                  ) : (
                    !onReview && (
                      <Link href={`/write?journal=${shortId(r.id)}`} className="clay-chip">
                        Write for this journal →
                      </Link>
                    )
                  )}
                </div>
                {openWhyId === r.id && <WhyThisJournal r={r} />}
                {rulesOpen && rulesResult && <RulesCheckPanel result={rulesResult} />}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

// "Fit 78 · strong": how this match compares with real published pairings
// (see eval_match.ts). An unfitted build shows the raw similarity, not a
// made-up percentage.
function FitBadge({ r }: { r: MatchResult }) {
  if (r.fit === null) {
    return (
      <span data-fit="unfitted" className="font-mono text-xs text-ink-soft" title="This index build hasn't been calibrated yet">
        similarity {r.signals.emb.toFixed(2)}
      </span>
    );
  }
  const tone =
    r.band === "strong"
      ? "bg-accent text-white shadow-[inset_0_1px_0_rgba(255,255,255,.25),0_2px_6px_-1px_rgba(44,95,111,.4)]"
      : r.band === "possible"
        ? "bg-[#ecdcc0] text-ink shadow-[inset_0_1px_0_rgba(255,255,255,.6),0_1px_3px_rgba(58,44,28,.15)]"
        : "bg-[#ebe8df] text-ink-soft";
  return (
    <span data-fit={r.band} className={`mt-0.5 shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-xs tabular-nums ${tone}`}>
      Fit {Math.round(r.fit * 100)} · {r.band}
    </span>
  );
}
