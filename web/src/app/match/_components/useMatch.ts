"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { extractFromFile } from "@/lib/extract";
import { embed } from "@/lib/embed";
import { loadManifest, type IndexManifest } from "@/lib/manifest";
import { matchJournals, getAvailableFields, estimatePaperTopics, loadNameIndex, type MatchResult, type MatchInput, type JournalFilters } from "@/lib/match";
import { buildQuery, queryFromPasted, type PaperQuery } from "@/lib/matchQuery";
import { countCitedJournals } from "@/lib/references";
import { loadTopicNames } from "@/lib/topics";
import type { TopicEstimate } from "@/lib/rank";
import { checkFormat, type FormatCheckResult } from "@/lib/formatCheck";
import { findJournalRules } from "@/lib/journalRules";
import { checkRules, type RulesCheckResult } from "@/lib/rulesCheck";
import { errorMessage } from "@/lib/errorMessage";

export type MatchStage = "idle" | "reading" | "embedding" | "matching" | "done" | "error";
export type MatchRefs = { entries: number; matched: number; cited: Map<string, number> };

// The whole matching run — file → text → query → vector → topics → rank,
// all on this device — and the state the results UI reads, as one hook so
// the /match page and the writing workspace's Match window share it. It
// knows nothing about the network trace: the page resets that itself.
export function useMatch() {
  const [stage, setStage] = useState<MatchStage>("idle");
  const [trace, setTrace] = useState<string[]>([]);
  const [results, setResults] = useState<MatchResult[] | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [source, setSource] = useState<File | null>(null);
  const [matchInput, setMatchInput] = useState<MatchInput | null>(null);
  const [query, setQuery] = useState<PaperQuery | null>(null);
  const [refs, setRefs] = useState<MatchRefs | null>(null);
  const [paperTopics, setPaperTopics] = useState<TopicEstimate[]>([]);
  const [availableFields, setAvailableFields] = useState<string[]>([]);
  const [filters, setFilters] = useState<JournalFilters>({});
  const [formatResult, setFormatResult] = useState<FormatCheckResult | null>(null);
  const [expandedResultId, setExpandedResultId] = useState<string | null>(null);
  const [openWhyId, setOpenWhyId] = useState<string | null>(null);
  const [paperText, setPaperText] = useState<string | null>(null);
  const [rulesChecks, setRulesChecks] = useState<Record<string, RulesCheckResult>>({});
  const [openRulesCheckId, setOpenRulesCheckId] = useState<string | null>(null);
  const [manifest, setManifest] = useState<IndexManifest | null>(null);
  const [topicNames, setTopicNames] = useState<Record<string, string>>({});
  // Guards against out-of-order matchJournals() results: the filter
  // controls are interactable as soon as matchInput is set, which is
  // before the initial (unfiltered) match finishes — so a filter change can
  // race the run's own match call. Whichever call's result lands, only
  // apply it if it's still the most recently *started* one.
  const matchSeq = useRef(0);

  const log = useCallback((line: string) => setTrace((t) => [...t, line]), []);

  useEffect(() => {
    loadManifest().then(setManifest, () => {});
    loadTopicNames().then(setTopicNames, () => {});
  }, []);

  // query → vector → topics → rank, all on this device. `cited` comes from
  // the file's reference list (none for pasted text).
  const run = useCallback(
    async (q: PaperQuery, found: MatchRefs | null, activeFilters: JournalFilters) => {
      setQuery(q);
      setRefs(found);
      setStage("embedding");
      log(q.source === "abstract" ? `Read title + abstract (${q.queryText.length.toLocaleString()} characters)` : q.source === "pasted" ? "Using the pasted title and abstract" : "No abstract heading found, so using the start of the paper, author lines removed");
      log("Loading the embedding model (cached after first run)");
      const vector = await embed(q.queryText);
      log(`Computed a ${vector.length}-dimension vector on this device`);
      const topics = await estimatePaperTopics(vector);
      setPaperTopics(topics);
      if (topics.length) log(`Estimated topics: ${topics.slice(0, 2).map((t) => t.name).join("; ")}`);
      setStage("matching");
      const input: MatchInput = { vector, paperTopics: topics, cited: found?.cited };
      setMatchInput(input);
      const mySeq = ++matchSeq.current;
      const matches = await matchJournals(input, 10, activeFilters);
      log(`Ranked ${manifest ? manifest.journal_count.toLocaleString() : "all"} journals locally`);
      void getAvailableFields().then(setAvailableFields);
      if (mySeq === matchSeq.current) setResults(matches);
      setStage("done");
    },
    [log, manifest],
  );

  const reset = useCallback(() => {
    setStage("reading");
    setTrace([]);
    setResults(null);
    setErrorMsg(null);
    setMatchInput(null);
    setFormatResult(null);
    setPaperText(null);
    setRulesChecks({});
    setOpenRulesCheckId(null);
    setExpandedResultId(null);
    setOpenWhyId(null);
  }, []);

  const process = useCallback(
    async (file: File) => {
      reset();
      setFilters({});
      setSource(file);
      try {
        log(`Reading ${file.name} (${(file.size / 1024).toFixed(0)} KB)`);
        const { fullText } = await extractFromFile(file);
        if (fullText.trim().length < 50) {
          throw new Error(
            "Couldn't find readable text in this file. If it's a scanned PDF (no text layer), text extraction won't work on it. Try a PDF exported directly from Word or LaTeX instead, or paste your title and abstract.",
          );
        }
        setFormatResult(checkFormat(fullText));
        setPaperText(fullText);
        const q = buildQuery({ fullText });
        let found: MatchRefs | null = null;
        if (q.references) {
          const r = countCitedJournals(q.references, await loadNameIndex());
          found = { entries: r.entries, matched: r.matched, cited: r.counts };
          log(`Read ${r.entries} references; ${r.matched} name a journal in the index`);
        }
        await run(q, found, {});
      } catch (err) {
        setErrorMsg(errorMessage(err));
        setStage("error");
      }
    },
    [log, reset, run],
  );

  // Pasted text: as a first entry (no file), or to correct what we read from
  // a file — then the file's references still count.
  const processPasted = useCallback(
    async (text: string, keepRefs: boolean) => {
      const kept = keepRefs ? refs : null;
      if (!keepRefs) {
        reset();
        setFilters({});
        setSource(null);
      } else {
        setTrace([]);
      }
      try {
        await run(queryFromPasted(text), kept, keepRefs ? filters : {});
      } catch (err) {
        setErrorMsg(errorMessage(err));
        setStage("error");
      }
    },
    [filters, refs, reset, run],
  );

  const busy = stage === "reading" || stage === "embedding" || stage === "matching";

  // Re-rank locally (no re-extract/re-embed, no network call — the index is
  // already cached) whenever a filter control changes on an already-run paper.
  const applyFilters = useCallback(
    (next: JournalFilters) => {
      setFilters(next);
      if (!matchInput) return;
      const mySeq = ++matchSeq.current;
      matchJournals(matchInput, 10, next)
        .then((matches) => {
          if (mySeq === matchSeq.current) setResults(matches);
        })
        .catch((err) => {
          if (mySeq !== matchSeq.current) return;
          setErrorMsg(errorMessage(err));
          setStage("error");
        });
    },
    [matchInput],
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
    [openRulesCheckId, rulesChecks, paperText],
  );

  const toggleExpand = useCallback((id: string) => setExpandedResultId((cur) => (cur === id ? null : id)), []);
  const toggleWhy = useCallback((id: string) => setOpenWhyId((cur) => (cur === id ? null : id)), []);

  return {
    stage,
    busy,
    trace,
    errorMsg,
    source,
    query,
    refs,
    paperTopics,
    matchInput,
    results,
    filters,
    availableFields,
    applyFilters,
    paperText,
    formatResult,
    rulesChecks,
    openRulesCheckId,
    toggleRulesCheck,
    expandedResultId,
    toggleExpand,
    openWhyId,
    toggleWhy,
    topicNames,
    manifest,
    process,
    processPasted,
  };
}

export type MatchApi = ReturnType<typeof useMatch>;
