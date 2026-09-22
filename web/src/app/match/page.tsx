"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { extractFromFile } from "@/lib/extract";
import { embed } from "@/lib/embed";
import { loadManifest } from "@/lib/manifest";
import {
  matchJournals,
  getAvailableFields,
  type MatchResult,
  type JournalFilters,
} from "@/lib/match";
import { journalHref, isPrerendered } from "@/lib/journal-url";
import { checkFormat, type FormatCheckResult } from "@/lib/formatCheck";
import { findJournalRules } from "@/lib/journalRules";
import { checkRules, type RulesCheckResult } from "@/lib/rulesCheck";
import JournalDetail from "@/components/JournalDetail";
import PaperDropzone from "@/components/PaperDropzone";
import RulesCheckPanel from "@/components/RulesCheckPanel";
import CheckRow from "@/components/CheckRow";

type Stage = "idle" | "reading" | "embedding" | "matching" | "done" | "error";

type NetworkCall = { method: string; url: string; hadBody: boolean };

const FEE_PRESETS = [
  { label: "Any fee", value: undefined },
  { label: "Free only", value: 0 },
  { label: "Under $1,500", value: 1500 },
  { label: "Under $3,000", value: 3000 },
  { label: "Under $5,000", value: 5000 },
] as const;

const SPEED_PRESETS = [
  { label: "Any speed", value: undefined },
  { label: "Under 8 weeks", value: 8 },
  { label: "Under 16 weeks", value: 16 },
  { label: "Under 26 weeks", value: 26 },
] as const;

export default function MatchPage() {
  const [stage, setStage] = useState<Stage>("idle");
  const [trace, setTrace] = useState<string[]>([]);
  const [calls, setCalls] = useState<NetworkCall[]>([]);
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

  // Instrument fetch for the page's whole lifetime, not just one matching
  // run — real proof, not a claim, that nothing leaves this tab unlogged,
  // no matter when a request happens to fire.
  useEffect(() => {
    const originalFetch = window.fetch;
    window.fetch = async (...args: Parameters<typeof fetch>) => {
      const [input, init] = args;
      const url = typeof input === "string" ? input : input.toString();
      setCalls((prev) => [...prev, { method: init?.method ?? "GET", url, hadBody: Boolean(init?.body) }]);
      return originalFetch(...args);
    };
    return () => {
      window.fetch = originalFetch;
    };
  }, []);

  useEffect(() => {
    loadManifest()
      .then((manifest) => setJournalCount(manifest.journal_count))
      .catch(() => {});
  }, []);

  const process = useCallback(
    async (file: File) => {
      setStage("reading");
      setTrace([]);
      setResults(null);
      setErrorMsg(null);
      setCalls([]);
      setQueryVector(null);
      setFilters({});
      setFormatResult(null);
      setPaperText(null);
      setRulesChecks({});
      setOpenRulesCheckId(null);

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
        setErrorMsg(err instanceof Error ? err.message : String(err));
        setStage("error");
      }
    },
    [log]
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
          setErrorMsg(err instanceof Error ? err.message : String(err));
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
      <header className="mb-12">
        <div className="mb-8 flex items-baseline justify-between">
          <Link href="/" className="font-serif text-lg font-medium">
            MargaLink
          </Link>
          <nav className="flex gap-5 text-sm text-ink-soft">
            <Link href="/" className="hover:text-ink">
              ← Back
            </Link>
            <Link href="/privacy" className="hover:text-ink">
              How privacy works
            </Link>
          </nav>
        </div>
        <h1 className="font-serif text-4xl font-medium leading-tight sm:text-5xl">
          Find the right journal.
        </h1>
        <p className="mt-3 max-w-md text-lg text-ink-soft">
          Nothing about your paper leaves this tab.
        </p>
      </header>

      <div className="grid gap-8 sm:grid-cols-[1fr_1.1fr]">
        <PaperDropzone busy={busy} onFile={(file) => void process(file)} />

        <div className="border-l border-line pl-6">
          <p className="mb-3 text-sm font-medium text-accent">On this device</p>
          <ol className="space-y-2 text-sm" aria-live="polite" role="status">
            {trace.length === 0 && !busy && (
              <li className="text-ink-soft">Upload a paper to see each step run, live.</li>
            )}
            {trace.map((line, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-accent">{i + 1}.</span>
                <span>{line}</span>
              </li>
            ))}
            {busy && <li className="text-ink-soft">Working…</li>}
          </ol>
          {stage === "error" && (
            <p className="mt-3 text-sm text-away" role="alert">{errorMsg}</p>
          )}
        </div>
      </div>

      {calls.length > 0 && (
        <div className="mt-10 rounded-sm border border-line bg-paper-alt p-4 text-sm">
          <p className="mb-2 font-medium">Network requests made during this run</p>
          <ul className="space-y-1 font-mono text-xs text-ink-soft">
            {calls.map((c, i) => (
              <li key={i}>
                {c.method} {c.url} — {c.hadBody ? "had a body" : "no body sent"}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-ink-soft">
            {calls.filter((c) => c.hadBody).length === 0
              ? "None of these carried your paper's text — they fetch the public model and index files."
              : "Warning: a request above carried a body — this should never happen for matching."}
          </p>
        </div>
      )}

      {queryVector && (
        <section className="mt-12">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
            <h2 className="font-serif text-xl font-medium">Best matches</h2>
            <div className="flex flex-wrap items-end gap-4 text-sm">
              <label className="flex flex-col gap-1">
                <span className="text-ink-soft">Field</span>
                <select
                  value={filters.field ?? ""}
                  onChange={(e) =>
                    applyFilters({ ...filters, field: e.target.value || undefined })
                  }
                  className="rounded-sm border border-line bg-paper px-2 py-1.5"
                >
                  <option value="">All fields</option>
                  {availableFields.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-ink-soft">Fee</span>
                <select
                  value={filters.maxFeeUsd === undefined ? "" : String(filters.maxFeeUsd)}
                  onChange={(e) => {
                    const v = e.target.value;
                    applyFilters({ ...filters, maxFeeUsd: v === "" ? undefined : Number(v) });
                  }}
                  className="rounded-sm border border-line bg-paper px-2 py-1.5"
                >
                  {FEE_PRESETS.map((p) => (
                    <option key={p.label} value={p.value === undefined ? "" : String(p.value)}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-ink-soft">Speed</span>
                <select
                  value={
                    filters.maxPublicationWeeks === undefined
                      ? ""
                      : String(filters.maxPublicationWeeks)
                  }
                  onChange={(e) => {
                    const v = e.target.value;
                    applyFilters({
                      ...filters,
                      maxPublicationWeeks: v === "" ? undefined : Number(v),
                    });
                  }}
                  className="rounded-sm border border-line bg-paper px-2 py-1.5"
                >
                  {SPEED_PRESETS.map((p) => (
                    <option key={p.label} value={p.value === undefined ? "" : String(p.value)}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-2 pb-1.5">
                <input
                  type="checkbox"
                  checked={filters.openAccessOnly ?? false}
                  onChange={(e) =>
                    applyFilters({ ...filters, openAccessOnly: e.target.checked })
                  }
                />
                <span>Open access (DOAJ) only</span>
              </label>
              <label className="flex items-center gap-2 pb-1.5">
                <input
                  type="checkbox"
                  checked={filters.medlineOnly ?? false}
                  onChange={(e) => applyFilters({ ...filters, medlineOnly: e.target.checked })}
                />
                <span>MEDLINE-indexed only</span>
              </label>
            </div>
          </div>

          {results && results.length > 0 ? (
            <ol data-testid="results">
              {results.map((r, i) => {
                const prerendered = isPrerendered(r);
                const expanded = expandedResultId === r.id;
                const journalRules = findJournalRules(r.id);
                const rulesOpen = openRulesCheckId === r.id;
                const rulesResult = rulesChecks[r.id];
                return (
                  <li key={r.id} className="border-t border-line py-3 first:border-t-0">
                    <div className="flex items-baseline justify-between gap-4">
                      <span className="flex gap-3">
                        <span className="text-ink-soft">{i + 1}</span>
                        {prerendered ? (
                          <Link href={journalHref(r.id)} className="hover:underline">
                            {r.display_name}
                          </Link>
                        ) : (
                          // No dedicated static page (outside the top ~2,000 by
                          // output volume) — expand details inline instead.
                          <button
                            type="button"
                            onClick={() => setExpandedResultId(expanded ? null : r.id)}
                            className="text-left hover:underline"
                            aria-expanded={expanded}
                          >
                            {r.display_name}
                          </button>
                        )}
                      </span>
                      <span className="font-mono text-xs text-ink-soft">
                        {(r.score / 127 / 127).toFixed(3)}
                      </span>
                    </div>
                    {(r.field ||
                      r.is_in_doaj ||
                      r.medline_indexed ||
                      r.apc_usd != null ||
                      r.publication_time_weeks != null) && (
                      <div className="mt-1 flex flex-wrap gap-3 pl-6 text-xs text-ink-soft">
                        {r.field && <span>{r.field}</span>}
                        {r.is_in_doaj && <span className="text-accent">Open access (DOAJ)</span>}
                        {r.medline_indexed && <span className="text-accent">MEDLINE</span>}
                        {r.apc_usd != null && <span>${r.apc_usd.toLocaleString()} fee</span>}
                        {r.publication_time_weeks != null && (
                          <span>~{r.publication_time_weeks}wk to publish</span>
                        )}
                      </div>
                    )}
                    {expanded && (
                      <div className="mt-3 rounded-sm border border-line bg-paper-alt p-4 pl-6">
                        <JournalDetail journal={r} />
                      </div>
                    )}
                    {journalRules && (
                      <div className="pl-6">
                        <button
                          type="button"
                          onClick={() => toggleRulesCheck(r.id)}
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
          ) : (
            <p className="text-ink-soft">No journals match these filters. Try widening them.</p>
          )}
        </section>
      )}

      {formatResult && (
        <section className="mt-12 border-t border-line pt-8">
          <h2 className="font-serif text-xl font-medium">Format check</h2>
          <p className="mt-1 text-sm text-ink-soft">
            General structure, detected from your paper&apos;s text — not yet
            checked against your chosen journal&apos;s specific limits.
          </p>

          <dl className="mt-6">
            <CheckRow label="Word count" value={formatResult.wordCount.toLocaleString()} />
            <CheckRow
              label="Abstract"
              value={
                formatResult.abstract.found
                  ? `Found, ${formatResult.abstract.wordCount ?? "?"} words${formatResult.abstract.structured ? " (structured)" : ""}`
                  : "Not detected"
              }
              detected={formatResult.abstract.found}
            />
            <CheckRow
              label="Ethics statement"
              value={formatResult.requiredSections.ethics ? "Detected" : "Not detected"}
              detected={formatResult.requiredSections.ethics}
            />
            <CheckRow
              label="Funding statement"
              value={formatResult.requiredSections.funding ? "Detected" : "Not detected"}
              detected={formatResult.requiredSections.funding}
            />
            <CheckRow
              label="Conflicts of interest"
              value={formatResult.requiredSections.conflictsOfInterest ? "Detected" : "Not detected"}
              detected={formatResult.requiredSections.conflictsOfInterest}
            />
            <CheckRow
              label="Data availability statement"
              value={formatResult.requiredSections.dataAvailability ? "Detected" : "Not detected"}
              detected={formatResult.requiredSections.dataAvailability}
            />
            <CheckRow
              label="References (approximate)"
              value={formatResult.referenceCount != null ? String(formatResult.referenceCount) : "Not detected"}
              detected={formatResult.referenceCount != null}
            />
            <CheckRow label="Figures referenced" value={String(formatResult.figureCount)} />
            <CheckRow label="Tables referenced" value={String(formatResult.tableCount)} />
          </dl>
        </section>
      )}

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
