"use client";

import { useState } from "react";
import type { PaperQuery } from "@/lib/matchQuery";
import type { TopicEstimate } from "@/lib/rank";

// What the matcher actually read — shown so a bad read is visible, with the
// paste box as the fix. All of it stays in this tab.
export default function WhatWeRead({
  query,
  refs,
  topics,
  busy,
  onCorrect,
}: {
  query: PaperQuery;
  refs: { entries: number; matched: number } | null;
  topics: TopicEstimate[];
  busy: boolean;
  onCorrect: (text: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const abstract = query.abstract ?? "";
  return (
    <section data-testid="what-we-read" className="mt-10 rounded-sm border border-line bg-paper-alt p-4 text-sm">
      <h2 className="font-medium">What we read</h2>
      {query.source === "fallback" && (
        <p className="mt-2 text-ink-soft">
          We couldn&apos;t find an abstract heading, so we matched on the start of the paper with author and contact lines removed.
          Pasting your abstract below will usually match better.
        </p>
      )}
      {query.title && <p className="mt-2 font-serif text-base">{query.title}</p>}
      {abstract && (
        <p className="mt-1 text-ink-soft">
          {open || abstract.length <= 300 ? abstract : `${abstract.slice(0, 300)}…`}{" "}
          {abstract.length > 300 && (
            <button type="button" onClick={() => setOpen(!open)} className="text-accent hover:underline">
              {open ? "Less" : "More"}
            </button>
          )}
        </p>
      )}
      <dl className="mt-3 grid gap-1 text-xs text-ink-soft sm:grid-cols-[auto_1fr] sm:gap-x-4">
        {query.keywords.length > 0 && (
          <>
            <dt>Keywords</dt>
            <dd>{query.keywords.join("; ")}</dd>
          </>
        )}
        <dt>References</dt>
        <dd data-testid="refs-line">
          {query.source === "pasted" && !refs
            ? "Pasted text: no reference list, so the citation signal is off"
            : refs && refs.entries > 0
              ? `${refs.entries} found · ${refs.matched} name a journal we know`
              : "None found"}
        </dd>
        {topics.length > 0 && (
          <>
            <dt>Reads as</dt>
            <dd data-testid="paper-topics">
              {topics.slice(0, 3).map((t, i) => (
                <span key={t.id}>
                  {i > 0 && " · "}
                  {t.name} <span className="tabular-nums">({Math.round(t.share * 100)}%)</span>
                </span>
              ))}
            </dd>
          </>
        )}
      </dl>
      <details className="mt-3">
        <summary className="cursor-pointer text-accent">Not right? Paste your title and abstract</summary>
        <form
          className="mt-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (text.trim().length >= 50) onCorrect(text);
          }}
        >
          <textarea
            aria-label="Corrected title and abstract"
            rows={6}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={"Title on the first line\nthen the abstract"}
            className="w-full rounded-sm border border-line bg-paper px-3 py-2"
          />
          <button
            type="submit"
            disabled={busy || text.trim().length < 50}
            className="mt-2 rounded-sm border border-line bg-paper px-3 py-1.5 hover:border-accent disabled:cursor-not-allowed disabled:opacity-60"
          >
            Use this instead
          </button>
          <span className="ml-3 text-xs text-ink-soft">Your file&apos;s reference list still counts.</span>
        </form>
      </details>
    </section>
  );
}
