"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { extractFromFile } from "@/lib/extract";
import { embed } from "@/lib/embed";
import { loadManifest } from "@/lib/manifest";
import { matchJournals, getAvailableFields, type MatchResult, type JournalFilters } from "@/lib/match";
import { checkFormat, type FormatCheckResult } from "@/lib/formatCheck";
import { findJournalRules } from "@/lib/journalRules";
import { checkRules, type RulesCheckResult } from "@/lib/rulesCheck";
import { errorMessage } from "@/lib/errorMessage";
import { NetworkTracePanel, useNetworkTrace } from "@/components/NetworkTrace";
import PageHeader from "@/components/PageHeader";
import PaperDropzone from "@/components/PaperDropzone";
import MatchFilters from "./_components/MatchFilters.tsx";
import MatchResults from "./_components/MatchResults.tsx";
import FormatCheckPanel from "./_components/FormatCheckPanel.tsx";
import ProcessingTrace from "./_components/ProcessingTrace.tsx";

type Stage = "idle" | "reading" | "embedding" | "matching" | "done" | "error";

export default function MatchPage() {
  const [stage, setStage] = useState<Stage>("idle");
  const [trace, setTrace] = useState<string[]>([]);
  const { calls, resetCalls } = useNetworkTrace();
  const [results, setResults] = useState<MatchResult[] | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [queryVector, setQueryVector] = useState<Float32Array | null>(null);
  const [availableFields, setAvailableFields] = useState<string[]>([]);
  const [filters, setFilters] = useState<JournalFilters>({});
  const [formatResult, setFormatResult] = useState<FormatCheckResult | null>(null);
  const [expandedResultId, setExpandedResultId] = useState<string | null>(null);
  const [paperText, setPaperText] = useState<string | null>(null);
  const [rulesChecks, setRulesChecks] = useState<Record<string, RulesCheckResult>>({});
  const [openRulesCheckId, setOpenRulesCheckId] = useState<string | null>(null);
  const [journalCount, setJournalCount] = useState<number | null>(null);
  // Guards against out-of-order matchJournals() results: the filter
  // controls are interactable as soon as queryVector is set, which is
  // before the initial (unfiltered) match finishes — so a filter change can
  // race process()'s own match call. Whichever call's result lands, only
  // apply it if it's still the most recently *started* one.
  const matchSeq = useRef(0);

  const log = useCallback((line: string) => setTrace((t) => [...t, line]), []);

  useEffect(() => {
    loadManifest()
      .then((manifest) => setJournalCount(manifest.journal_count))
      .catch(() => {});
  }, []);

  // The extract -> embed -> match pipeline, kept as one function rather
  // than hoisted to lib/: it interleaves ~8 setState calls with async
  // steps, and matchSeq (the out-of-order guard above) has to move with
  // this state, not get separated from it.
  const process = useCallback(
    async (file: File) => {
      setStage("reading");
      setTrace([]);
      setResults(null);
      setErrorMsg(null);
      resetCalls();
      setQueryVector(null);
      setFilters({});
      setFormatResult(null);
      setPaperText(null);
      setRulesChecks({});
      setOpenRulesCheckId(null);
      setExpandedResultId(null);

      try {
        log(`Reading ${file.name} (${(file.size / 1024).toFixed(0)} KB)`);
        const { text, fullText } = await extractFromFile(file);
        log(`Extracted ${text.length} characters — stays in this tab`);
        if (text.trim().length < 50) {
          throw new Error(
            "Couldn't find readable text in this file. If it's a scanned PDF (no text layer), text extraction won't work on it — try a PDF exported directly from Word or LaTeX instead."
          );
        }
        setFormatResult(checkFormat(fullText));
        setPaperText(fullText);

        setStage("embedding");
        log("Loading the embedding model (cached after first run)");
        const vector = await embed(text);
        log(`Computed a ${vector.length}-dimension vector on this device`);
        setQueryVector(vector);

        setStage("matching");
        log("Ranking journals locally against the vector");
        const mySeq = ++matchSeq.current;
        const matches = await matchJournals(vector, 10);
        log(`Found ${matches.length} candidate journals`);
        void getAvailableFields().then(setAvailableFields);

        if (mySeq === matchSeq.current) setResults(matches);
        setStage("done");
      } catch (err) {
        setErrorMsg(errorMessage(err));
        setStage("error");
      }
    },
    [log, resetCalls]
  );

  const busy = stage === "reading" || stage === "embedding" || stage === "matching";

  // Re-rank locally (no re-extract/re-embed, no network call — the index is
  // already cached) whenever a filter control changes on an already-run paper.
  const applyFilters = useCallback(
    (next: JournalFilters) => {
      setFilters(next);
      if (!queryVector) return;
      const mySeq = ++matchSeq.current;
      matchJournals(queryVector, 10, next)
        .then((matches) => {
          if (mySeq === matchSeq.current) setResults(matches);
        })
        .catch((err) => {
          if (mySeq !== matchSeq.current) return;
          setErrorMsg(errorMessage(err));
          setStage("error");
        });
    },
    [queryVector]
  );

  const toggleRulesCheck = useCallback(
    (journalId: string) => {
      if (openRulesCheckId === journalId) {
        setOpenRulesCheckId(null);
        return;
      }
      if (!rulesChecks[journalId] && paperText) {
        const rules = findJournalRules(journalId);
        if (rules) {
          setRulesChecks((prev) => ({ ...prev, [journalId]: checkRules(paperText, rules) }));
        }
      }
      setOpenRulesCheckId(journalId);
    },
    [openRulesCheckId, rulesChecks, paperText]
  );

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-14 sm:py-20">
      <PageHeader
        width="4xl"
        links={[
          { href: "/", label: "← Back" },
          { href: "/privacy", label: "How privacy works" },
        ]}
        title="Find the right journal."
        subtitle={<p className="mt-3 max-w-md text-lg text-ink-soft">Nothing about your paper leaves this tab.</p>}
      />

      <div className="grid gap-8 sm:grid-cols-[1fr_1.1fr]">
        <PaperDropzone busy={busy} onFile={(file) => void process(file)} />
        <ProcessingTrace trace={trace} busy={busy} showError={stage === "error"} errorMsg={errorMsg} />
      </div>

      <NetworkTracePanel calls={calls}>
        {calls.filter((c) => c.hadBody).length === 0
          ? "None of these carried your paper's text — they fetch the public model and index files."
          : "Warning: a request above carried a body — this should never happen for matching."}
      </NetworkTracePanel>

      {queryVector && (
        <section className="mt-12">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
            <h2 className="font-serif text-xl font-medium">Best matches</h2>
            <MatchFilters filters={filters} availableFields={availableFields} onChange={applyFilters} />
          </div>

          <MatchResults
            results={results ?? []}
            expandedResultId={expandedResultId}
            onToggleExpand={(id) => setExpandedResultId(expandedResultId === id ? null : id)}
            rulesChecks={rulesChecks}
            openRulesCheckId={openRulesCheckId}
            onToggleRulesCheck={toggleRulesCheck}
          />
        </section>
      )}

      {formatResult && <FormatCheckPanel result={formatResult} />}

      <footer className="mt-20 border-t border-line pt-6 text-sm text-ink-soft">
        <p>
          {journalCount != null
            ? `This build matches against ${journalCount.toLocaleString()} journals — embedded entirely on-device.`
            : "Matching runs against the full journal index — embedded entirely on-device."}{" "}
          <Link href="/privacy" className="text-accent hover:underline">
            How privacy works
          </Link>
        </p>
      </footer>
    </main>
  );
}
