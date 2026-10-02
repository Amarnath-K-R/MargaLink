"use client";

import type { MatchApi } from "@/app/match/_components/useMatch";
import MatchFilters from "@/app/match/_components/MatchFilters";
import MatchResults from "@/app/match/_components/MatchResults";
import ProcessingTrace from "@/app/match/_components/ProcessingTrace";
import WhatWeRead from "@/app/match/_components/WhatWeRead";
import CompileFirst from "./CompileFirst.tsx";

// The Match window: the paper (the compiled PDF, or the Word document)
// against the journal index, on this device — the same run as /match, over
// the same hook. A result can become
// the project's target journal, or open the Review window for that journal.
export default function MatchWindow({
  match: m,
  paperFile,
  compiling,
  onCompile,
  targetJournalId,
  onSetTarget,
  onReview,
}: {
  match: MatchApi;
  paperFile: File | null;
  compiling: boolean;
  onCompile: () => void;
  targetJournalId: string | null;
  onSetTarget: (id: string, name: string) => void;
  onReview: (journalId: string) => void;
}) {
  if (!paperFile) return <CompileFirst compiling={compiling} onCompile={onCompile} />;
  const stale = m.results !== null && m.source !== paperFile;
  return (
    <div data-testid="match-window" className="text-sm">
      <div className="flex flex-wrap items-center gap-4">
        <button
          type="button"
          onClick={() => void m.process(paperFile)}
          disabled={m.busy}
          className="rounded-sm border border-line bg-paper-alt px-4 py-1.5 hover:border-accent disabled:cursor-not-allowed disabled:opacity-60"
        >
          {m.busy ? "Matching…" : stale ? "Draft changed: match again" : m.results ? "Match again" : "Find matching journals"}
        </button>
        <span className="text-ink-soft">Matches your paper against the journal index; it never leaves this device.</span>
      </div>

      {m.stage !== "idle" && (
        <div className="mt-6">
          <ProcessingTrace trace={m.trace} busy={m.busy} showError={m.stage === "error"} errorMsg={m.errorMsg} />
        </div>
      )}

      {m.query && <WhatWeRead query={m.query} refs={m.refs} topics={m.paperTopics} busy={m.busy} onCorrect={(text) => void m.processPasted(text, true)} />}

      {m.matchInput && (
        <section className="mt-10">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
            <h3 className="font-serif text-lg font-medium">Best matches</h3>
            <MatchFilters filters={m.filters} availableFields={m.availableFields} onChange={m.applyFilters} />
          </div>
          <MatchResults
            results={m.results ?? []}
            expandedResultId={m.expandedResultId}
            onToggleExpand={m.toggleExpand}
            rulesChecks={m.rulesChecks}
            openRulesCheckId={m.openRulesCheckId}
            onToggleRulesCheck={m.toggleRulesCheck}
            openWhyId={m.openWhyId}
            onToggleWhy={m.toggleWhy}
            topicNames={m.topicNames}
            expandOnly
            onReview={onReview}
            onSetTarget={onSetTarget}
            targetJournalId={targetJournalId}
          />
        </section>
      )}
    </div>
  );
}
