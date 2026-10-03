"use client";

import Link from "next/link";
import PageHeader from "@/components/layout/PageHeader";
import MatchFilters from "./_components/MatchFilters.tsx";
import MatchResults from "./_components/MatchResults.tsx";
import FormatCheckPanel from "../../components/checks/FormatCheckPanel.tsx";
import ProcessingTrace from "./_components/ProcessingTrace.tsx";
import PaperInput from "./_components/PaperInput.tsx";
import WhatWeRead from "./_components/WhatWeRead.tsx";
import { useMatch } from "./_components/useMatch.ts";

// The matching page: the run itself lives in useMatch (shared with the
// writing workspace's Match window); this page adds the input, the network
// trace it proves, and the results.
export default function MatchPage() {
  const m = useMatch();

  return (
    <main className="mx-auto w-full max-w-5xl px-6 pt-3 pb-20">
      <PageHeader
        width="4xl" tool="match"
        title="Find the right journal."
        subtitle={<p className="mt-3 max-w-md text-lg text-ink-soft">Nothing about your paper leaves this tab.</p>}
      />

      <section className="clay grid gap-8 p-6 sm:p-8 md:grid-cols-[1.15fr_1fr]">
        <PaperInput
          busy={m.busy}
          onFile={(file) => {
            void m.process(file);
          }}
          onPaste={(text) => {
            void m.processPasted(text, false);
          }}
        />
        <ProcessingTrace trace={m.trace} busy={m.busy} showError={m.stage === "error"} errorMsg={m.errorMsg} />
      </section>


      {m.query && <WhatWeRead query={m.query} refs={m.refs} topics={m.paperTopics} busy={m.busy} onCorrect={(text) => void m.processPasted(text, true)} />}

      {m.matchInput && (
        <section className="mt-14">
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-4">
            <h2 className="font-serif text-2xl font-medium">Best matches</h2>
            {m.results && <span className="text-sm text-ink-soft">{m.results.length} journals, best first</span>}
          </div>
          <div className="mb-5">
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
          />
        </section>
      )}

      {m.formatResult && <FormatCheckPanel result={m.formatResult} />}

      <footer className="mt-16 border-t border-line/80 pt-6 text-sm text-ink-soft">
        <p>
          {m.manifest
            ? `This build matches against ${m.manifest.journal_count.toLocaleString()} journals, embedded entirely on-device.`
            : "Matching runs against the full journal index, embedded entirely on-device."}{" "}
          {m.manifest?.ranking.accuracy && (
            <span data-testid="accuracy">
              Its real journal is in the top 10 for {Math.round(m.manifest.ranking.accuracy.top10 * 100)}% of{" "}
              {m.manifest.ranking.accuracy.n.toLocaleString()} recent papers held out of the index (built{" "}
              {new Date(m.manifest.built_at).toLocaleDateString()}).{" "}
            </span>
          )}
          <Link href="/privacy" className="text-accent hover:underline">
            How privacy works
          </Link>
        </p>
      </footer>
    </main>
  );
}
