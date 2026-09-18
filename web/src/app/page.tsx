"use client";

import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import { extractFromFile } from "@/lib/extract";
import { embed } from "@/lib/embed";
import {
  matchJournals,
  getAvailableFields,
  type MatchResult,
  type JournalFilters,
} from "@/lib/match";
import { journalHref } from "@/lib/journal-url";

type Stage = "idle" | "reading" | "embedding" | "matching" | "done" | "error";

type NetworkCall = { method: string; url: string; hadBody: boolean };

const FEE_PRESETS = [
  { label: "Any fee", value: undefined },
  { label: "Free only", value: 0 },
  { label: "Under $1,500", value: 1500 },
  { label: "Under $3,000", value: 3000 },
  { label: "Under $5,000", value: 5000 },
] as const;

export default function Home() {
  const [stage, setStage] = useState<Stage>("idle");
  const [trace, setTrace] = useState<string[]>([]);
  const [calls, setCalls] = useState<NetworkCall[]>([]);
  const [results, setResults] = useState<MatchResult[] | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [queryVector, setQueryVector] = useState<Float32Array | null>(null);
  const [availableFields, setAvailableFields] = useState<string[]>([]);
  const [filters, setFilters] = useState<JournalFilters>({});
  const inputRef = useRef<HTMLInputElement>(null);

  const log = useCallback((line: string) => setTrace((t) => [...t, line]), []);

  const process = useCallback(
    async (file: File) => {
      setStage("reading");
      setTrace([]);
      setResults(null);
      setErrorMsg(null);
      setCalls([]);
      setQueryVector(null);
      setFilters({});

      // Instrument fetch for the duration of this run — real proof, not a
      // claim, that no request during matching carries the paper's text.
      const seen: NetworkCall[] = [];
      const originalFetch = window.fetch;
      window.fetch = async (...args: Parameters<typeof fetch>) => {
        const [input, init] = args;
        const url = typeof input === "string" ? input : input.toString();
        seen.push({
          method: init?.method ?? "GET",
          url,
          hadBody: Boolean(init?.body),
        });
        return originalFetch(...args);
      };

      try {
        log(`Reading ${file.name} (${(file.size / 1024).toFixed(0)} KB)`);
        const { text } = await extractFromFile(file);
        log(`Extracted ${text.length} characters — stays in this tab`);
        if (text.trim().length < 50) {
          throw new Error(
            "Couldn't find readable text in this file. If it's a scanned PDF (no text layer), text extraction won't work on it — try a PDF exported directly from Word or LaTeX instead."
          );
        }

        setStage("embedding");
        log("Loading the embedding model (cached after first run)");
        const vector = await embed(text);
        log(`Computed a ${vector.length}-dimension vector on this device`);
        setQueryVector(vector);

        setStage("matching");
        log("Ranking journals locally against the vector");
        const matches = await matchJournals(vector, 10);
        log(`Found ${matches.length} candidate journals`);
        void getAvailableFields().then(setAvailableFields);

        setResults(matches);
        setStage("done");
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : String(err));
        setStage("error");
      } finally {
        window.fetch = originalFetch;
        setCalls(seen);
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
      if (queryVector) void matchJournals(queryVector, 10, next).then(setResults);
    },
    [queryVector]
  );

  const onFiles = useCallback(
    (files: FileList | null) => {
      // Guard against starting a second run mid-processing — process()
      // temporarily wraps window.fetch, and two overlapping runs would
      // stomp on each other's restore of the original fetch.
      if (busy) return;
      const file = files?.[0];
      if (file) void process(file);
    },
    [process, busy]
  );

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-14 sm:py-20">
      <header className="mb-12">
        <div className="mb-8 flex items-baseline justify-between">
          <span className="font-serif text-lg font-medium">MargaLink</span>
          <Link href="/privacy" className="text-sm text-ink-soft hover:text-ink">
            How privacy works
          </Link>
        </div>
        <h1 className="font-serif text-4xl font-medium leading-tight sm:text-5xl">
          Find the right journal.
        </h1>
        <p className="mt-3 max-w-md text-lg text-ink-soft">
          Nothing about your paper leaves this tab.
        </p>
      </header>

      <div className="grid gap-8 sm:grid-cols-[1fr_1.1fr]">
        <button
          type="button"
          disabled={busy}
          aria-label="Upload a PDF or DOCX paper"
          onDragOver={(e) => {
            if (busy) return;
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            if (!busy) onFiles(e.dataTransfer.files);
          }}
          onClick={() => inputRef.current?.click()}
          className={`flex h-56 flex-col items-center justify-center gap-2 rounded-sm border text-center transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2 ${
            busy ? "cursor-not-allowed opacity-60" : "cursor-pointer"
          } ${dragOver ? "border-accent bg-accent-soft" : "border-line bg-paper-alt"}`}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,.docx"
            className="hidden"
            onChange={(e) => onFiles(e.target.files)}
          />
          <p className="font-medium">Drop a PDF or DOCX</p>
          <p className="text-sm text-ink-soft">or click to choose a file</p>
        </button>

        <div className="border-l border-line pl-6">
          <p className="mb-3 text-sm font-medium text-accent">On this device</p>
          <ol className="space-y-2 text-sm">
            {trace.length === 0 && !busy && (
              <li className="text-ink-soft">Upload a paper to see each step run, live.</li>
            )}
            {trace.map((line, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-accent">{i + 1}.</span>
                <span>{line}</span>
              </li>
            ))}
            {busy && <li className="text-ink-soft">…</li>}
          </ol>
          {stage === "error" && (
            <p className="mt-3 text-sm text-away">{errorMsg}</p>
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
            </div>
          </div>

          {results && results.length > 0 ? (
            <ol data-testid="results">
              {results.map((r, i) => (
                <li key={r.id} className="border-t border-line py-3 first:border-t-0">
                  <div className="flex items-baseline justify-between gap-4">
                    <span className="flex gap-3">
                      <span className="text-ink-soft">{i + 1}</span>
                      <Link href={journalHref(r.id)} className="hover:underline">
                        {r.display_name}
                      </Link>
                    </span>
                    <span className="font-mono text-xs text-ink-soft">
                      {(r.score / 127 / 127).toFixed(3)}
                    </span>
                  </div>
                  {(r.field || r.is_in_doaj || r.apc_usd != null) && (
                    <div className="mt-1 flex flex-wrap gap-3 pl-6 text-xs text-ink-soft">
                      {r.field && <span>{r.field}</span>}
                      {r.is_in_doaj && <span className="text-accent">Open access (DOAJ)</span>}
                      {r.apc_usd != null && <span>${r.apc_usd.toLocaleString()} fee</span>}
                    </div>
                  )}
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-ink-soft">No journals match these filters. Try widening them.</p>
          )}
        </section>
      )}

      <footer className="mt-20 border-t border-line pt-6 text-sm text-ink-soft">
        <p>
          This build matches against 562 journals — the sample used to pick
          the embedding model (82% top-10 accuracy on held-out papers). The
          full index (~20,000 journals) ships in a later phase.{" "}
          <Link href="/privacy" className="text-accent hover:underline">
            How privacy works
          </Link>
        </p>
      </footer>
    </main>
  );
}
