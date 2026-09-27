"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { loadMeta, getAvailableFields, type JournalMeta } from "@/lib/match";
import { loadTopicNames } from "@/lib/topics";
import { JournalResultTitle, JournalResultChips } from "@/components/JournalResultRow";
import JournalDetail from "@/components/JournalDetail";
import PageHeader from "@/components/PageHeader";
import { Search } from "lucide-react";

const DISPLAY_CAP = 100;

export default function JournalsPage() {
  const [journals, setJournals] = useState<JournalMeta[] | null>(null);
  const [fields, setFields] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [field, setField] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [topicNames, setTopicNames] = useState<Record<string, string>>({});

  useEffect(() => {
    void loadMeta().then(setJournals);
    void getAvailableFields().then(setFields);
    void loadTopicNames().then(setTopicNames);
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
    <main className="mx-auto w-full max-w-5xl px-6 pt-3 pb-20">
      <PageHeader
        width="3xl" tool="journals"
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

      <div className="clay flex flex-wrap items-end gap-4 px-5 py-4">
        <label className="flex flex-1 flex-col gap-1.5" style={{ minWidth: 220 }}>
          <span className="pl-1 text-xs text-ink-soft">Search by name</span>
          <span className="relative">
            <Search aria-hidden size={16} strokeWidth={2} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-soft" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="e.g. Nature, IEEE, Cureus…"
              className="clay-input h-11 w-full pl-10"
            />
          </span>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="pl-1 text-xs text-ink-soft">Field</span>
          <select
            value={field}
            onChange={(e) => setField(e.target.value)}
            className="clay-btn clay-select h-11 w-64 truncate text-sm"
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

      <p className="mt-6 px-1 text-sm text-ink-soft">
        {filtered.length === 0 && journals
          ? "No journals match."
          : filtered.length > DISPLAY_CAP
            ? `Showing ${DISPLAY_CAP} of ${filtered.length.toLocaleString()} matches — narrow your search to see more.`
            : `${filtered.length.toLocaleString()} match${filtered.length === 1 ? "" : "es"}.`}
      </p>

      <ol className="mt-4 grid items-start gap-3 md:grid-cols-2">
        {shown.map((j) => {
          const expanded = expandedId === j.id;
          return (
            <li key={j.id} className={`clay flex gap-3.5 rounded-[18px] px-4 py-4 ${expanded ? "md:col-span-2" : ""}`}>
              <span aria-hidden className="bead mt-0.5 h-8 w-8 shrink-0 font-serif text-sm text-ink" style={{ background: "#efe3cf" }}>
                {j.display_name.replace(/^the\s+/i, "").charAt(0).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <span className="font-serif text-[1.05rem] leading-snug">
                  <JournalResultTitle journal={j} expanded={expanded} onToggleExpand={() => setExpandedId(expanded ? null : j.id)} />
                </span>
                <JournalResultChips journal={j} />
                {expanded && (
                  <div className="sheet mt-4 p-5 text-sm">
                    <JournalDetail journal={j} topicNames={topicNames} />
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </main>
  );
}
