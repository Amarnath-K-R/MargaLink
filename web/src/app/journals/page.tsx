"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { loadMeta, getAvailableFields, type JournalMeta } from "@/lib/match";
import { journalHref } from "@/lib/journal-url";

const DISPLAY_CAP = 100;

export default function JournalsPage() {
  const [journals, setJournals] = useState<JournalMeta[] | null>(null);
  const [fields, setFields] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [field, setField] = useState("");

  useEffect(() => {
    void loadMeta().then(setJournals);
    void getAvailableFields().then(setFields);
  }, []);

  const filtered = useMemo(() => {
    if (!journals) return [];
    const q = query.trim().toLowerCase();
    return journals
      .filter((j) => !field || j.field === field)
      .filter((j) => !q || j.display_name.toLowerCase().includes(q))
      .sort((a, b) => a.display_name.localeCompare(b.display_name));
  }, [journals, query, field]);

  const shown = filtered.slice(0, DISPLAY_CAP);

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-14 sm:py-20">
      <header className="mb-10">
        <div className="mb-8 flex items-baseline justify-between">
          <Link href="/" className="font-serif text-lg font-medium">
            MargaLink
          </Link>
          <Link href="/privacy" className="text-sm text-ink-soft hover:text-ink">
            How privacy works
          </Link>
        </div>
        <h1 className="font-serif text-3xl font-medium sm:text-4xl">Browse journals</h1>
        <p className="mt-2 text-ink-soft">
          {journals ? `${journals.length.toLocaleString()} journals in this build.` : "Loading…"}{" "}
          Looking to match a specific paper?{" "}
          <Link href="/" className="text-accent hover:underline">
            Upload it instead
          </Link>
          .
        </p>
      </header>

      <div className="flex flex-wrap gap-4">
        <label className="flex flex-1 flex-col gap-1" style={{ minWidth: 220 }}>
          <span className="text-sm text-ink-soft">Search by name</span>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g. Nature, IEEE, Cureus…"
            className="rounded-sm border border-line bg-paper px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm text-ink-soft">Field</span>
          <select
            value={field}
            onChange={(e) => setField(e.target.value)}
            className="rounded-sm border border-line bg-paper px-2 py-2"
          >
            <option value="">All fields</option>
            {fields.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </label>
      </div>

      <p className="mt-6 text-sm text-ink-soft">
        {filtered.length === 0 && journals
          ? "No journals match."
          : filtered.length > DISPLAY_CAP
            ? `Showing ${DISPLAY_CAP} of ${filtered.length.toLocaleString()} matches — narrow your search to see more.`
            : `${filtered.length.toLocaleString()} match${filtered.length === 1 ? "" : "es"}.`}
      </p>

      <ol className="mt-4">
        {shown.map((j) => (
          <li key={j.id} className="border-t border-line py-3 first:border-t-0">
            <Link href={journalHref(j.id)} className="hover:underline">
              {j.display_name}
            </Link>
            {(j.field || j.is_in_doaj || j.medline_indexed || j.apc_usd != null) && (
              <div className="mt-1 flex flex-wrap gap-3 text-xs text-ink-soft">
                {j.field && <span>{j.field}</span>}
                {j.is_in_doaj && <span className="text-accent">Open access (DOAJ)</span>}
                {j.medline_indexed && <span className="text-accent">MEDLINE</span>}
                {j.apc_usd != null && <span>${j.apc_usd.toLocaleString()} fee</span>}
              </div>
            )}
          </li>
        ))}
      </ol>
    </main>
  );
}
