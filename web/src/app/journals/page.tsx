"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { loadMeta, getAvailableFields, type JournalMeta } from "@/lib/match";
import { JournalResultTitle, JournalResultChips } from "@/components/JournalResultRow";
import JournalDetail from "@/components/JournalDetail";
import PageHeader from "@/components/PageHeader";

const DISPLAY_CAP = 100;

export default function JournalsPage() {
  const [journals, setJournals] = useState<JournalMeta[] | null>(null);
  const [fields, setFields] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [field, setField] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

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
      <PageHeader
        width="3xl"
        links={[{ href: "/privacy", label: "How privacy works" }]}
        title="Browse journals"
        subtitle={
          <p className="mt-2 text-ink-soft">
            {journals ? `${journals.length.toLocaleString()} journals in this build.` : "Loading…"}{" "}
            Looking to match a specific paper?{" "}
            <Link href="/match" className="text-accent hover:underline">
              Upload it instead
            </Link>
            .
          </p>
        }
      />

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
        {shown.map((j) => {
          const expanded = expandedId === j.id;
          return (
            <li key={j.id} className="border-t border-line py-3 first:border-t-0">
              <JournalResultTitle
                journal={j}
                expanded={expanded}
                onToggleExpand={() => setExpandedId(expanded ? null : j.id)}
              />
              <JournalResultChips journal={j} />
              {expanded && (
                <div className="mt-3 rounded-sm border border-line bg-paper-alt p-4">
                  <JournalDetail journal={j} />
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </main>
  );
}
