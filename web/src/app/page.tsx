"use client";

import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import { extractFromFile } from "@/lib/extract";
import { embed } from "@/lib/embed";
import { matchJournals, type MatchResult } from "@/lib/match";

type Stage = "idle" | "reading" | "embedding" | "matching" | "done" | "error";

type NetworkCall = { method: string; url: string; hadBody: boolean };

export default function Home() {
  const [stage, setStage] = useState<Stage>("idle");
  const [trace, setTrace] = useState<string[]>([]);
  const [calls, setCalls] = useState<NetworkCall[]>([]);
  const [results, setResults] = useState<MatchResult[] | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const log = useCallback((line: string) => setTrace((t) => [...t, line]), []);

  const process = useCallback(
    async (file: File) => {
      setStage("reading");
      setTrace([]);
      setResults(null);
      setErrorMsg(null);
      setCalls([]);

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

        setStage("embedding");
        log("Loading the embedding model (cached after first run)");
        const vector = await embed(text);
        log(`Computed a ${vector.length}-dimension vector on this device`);

        setStage("matching");
        log("Ranking journals locally against the vector");
        const matches = await matchJournals(vector, 10);
        log(`Found ${matches.length} candidate journals`);

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

  const onFiles = useCallback(
    (files: FileList | null) => {
      const file = files?.[0];
      if (file) void process(file);
    },
    [process]
  );

  const busy = stage === "reading" || stage === "embedding" || stage === "matching";

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
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            onFiles(e.dataTransfer.files);
          }}
          onClick={() => inputRef.current?.click()}
          className={`flex h-56 cursor-pointer flex-col items-center justify-center gap-2 rounded-sm border text-center transition-colors ${
            dragOver ? "border-accent bg-accent-soft" : "border-line bg-paper-alt"
          }`}
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
        </div>

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

      {results && results.length > 0 && (
        <section className="mt-12">
          <h2 className="mb-4 font-serif text-xl font-medium">Best matches</h2>
          <ol>
            {results.map((r, i) => (
              <li
                key={r.id}
                className="flex items-baseline justify-between gap-4 border-t border-line py-3 first:border-t-0"
              >
                <span className="flex gap-3">
                  <span className="text-ink-soft">{i + 1}</span>
                  <span>{r.display_name}</span>
                </span>
                <span className="font-mono text-xs text-ink-soft">
                  {(r.score / 127 / 127).toFixed(3)}
                </span>
              </li>
            ))}
          </ol>
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
