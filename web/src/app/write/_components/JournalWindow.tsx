"use client";

import { useEffect, useMemo, useState } from "react";
import { findJournalRules, REQUIRED_STATEMENT_LABELS } from "@/lib/journalRules";
import { shortId, webLink } from "@/lib/journalUrl";
import { loadMeta, type JournalMeta } from "@/lib/match";
import { loadTopicNames } from "@/lib/topics";
import { templateForJournal, type Template } from "@/lib/templateCatalog";
import { errorMessage } from "@/lib/errorMessage";
import ErrorText from "@/components/ErrorText";
import JournalDetail from "@/components/JournalDetail";
import type { Journal } from "../page.tsx";

const SHOWN = 20;

// The Journal window: the project's target journal — its details, its
// hand-verified rules where they exist, its publisher's template — and a
// search to change it. The index is the same public file /journals reads.
export default function JournalWindow({
  journalId,
  journalName,
  templates,
  currentTemplateId,
  onChange,
  onNewFromTemplate,
  onOpenMatch,
}: {
  journalId: string | null;
  journalName: string | null;
  templates: Template[];
  currentTemplateId: string | null;
  onChange: (journal: Journal | null) => void;
  onNewFromTemplate: (t: Template, journal: Journal) => void;
  onOpenMatch: () => void;
}) {
  const [all, setAll] = useState<JournalMeta[] | null>(null);
  const [topicNames, setTopicNames] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    loadMeta().then(setAll, (err) => setError(errorMessage(err)));
    loadTopicNames().then(setTopicNames, () => {});
  }, []);

  const journal = useMemo(() => (journalId && all ? all.find((m) => shortId(m.id) === shortId(journalId)) ?? null : null), [journalId, all]);
  const rules = journalId ? findJournalRules(journalId) : undefined;
  const template = journal ? templateForJournal(journal.host_organization_name ?? null, templates) : null;
  const asJournal = (m: JournalMeta): Journal => ({ id: m.id, display_name: m.display_name, host: m.host_organization_name ?? null });
  const matches = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return needle && all ? all.filter((m) => m.display_name.toLowerCase().includes(needle)).slice(0, SHOWN) : [];
  }, [q, all]);

  return (
    <div className="text-sm">
      {error && <ErrorText>{error}</ErrorText>}
      {journalId ? (
        <>
          <h3 className="font-serif text-lg font-medium">{journal?.display_name ?? journalName ?? "Target journal"}</h3>
          {journal ? <JournalDetail journal={journal} topicNames={topicNames} /> : all ? <p className="mt-2 text-ink-soft">This journal isn&apos;t in this build&apos;s index.</p> : <p className="mt-2 text-ink-soft">Loading the index…</p>}

          <section className="mt-8 border-t border-line pt-6">
            <h4 className="font-medium">Rules</h4>
            {rules ? (
              <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-6 gap-y-1">
                <dt className="text-ink-soft">Article type</dt>
                <dd>{rules.articleTypeLabel}</dd>
                <dt className="text-ink-soft">Word limit</dt>
                <dd>{rules.wordLimit != null ? rules.wordLimit.toLocaleString() : "No limit stated"}</dd>
                <dt className="text-ink-soft">References</dt>
                <dd>{rules.referenceStyle === "bracket-numbered" ? "Numbered [1]" : rules.referenceStyle === "author-year" ? "Author–year" : "Not stated"}</dd>
                <dt className="text-ink-soft">Required statements</dt>
                <dd>{rules.requiredStatements.length ? rules.requiredStatements.map((k) => REQUIRED_STATEMENT_LABELS[k]).join(", ") : "None stated"}</dd>
                <dt className="text-ink-soft">Guidelines</dt>
                <dd>
                  <a href={rules.guidelinesUrl} target="_blank" rel="noopener noreferrer nofollow" className="text-accent hover:underline">
                    The journal&apos;s own page
                  </a>{" "}
                  <span className="text-ink-soft">(as published {rules.asOf})</span>
                </dd>
              </dl>
            ) : (
              <p className="mt-1 text-ink-soft">
                No hand-verified rules for this journal yet.
                {webLink(journal?.homepage_url) && (
                  <>
                    {" "}
                    <a href={webLink(journal?.homepage_url)!} target="_blank" rel="noopener noreferrer nofollow" className="text-accent hover:underline">
                      Its website
                    </a>{" "}
                    has its author instructions.
                  </>
                )}
              </p>
            )}
          </section>

          <section className="mt-8 border-t border-line pt-6">
            <h4 className="font-medium">Template</h4>
            {!journal ? (
              <p className="mt-1 text-ink-soft">Once the index has loaded, its publisher&apos;s template shows here.</p>
            ) : !template ? (
              <p className="mt-1 text-ink-soft">No template for this publisher is bundled. Start from the plain article, or import the publisher&apos;s own.</p>
            ) : template.id === currentTemplateId ? (
              <p className="mt-1 text-ink-soft">This paper already uses the {template.name} template.</p>
            ) : template.bundled ? (
              <p className="mt-1 text-ink-soft">
                This publisher&apos;s template is {template.name}.{" "}
                <button type="button" onClick={() => onNewFromTemplate(template, asJournal(journal))} className="text-accent hover:underline">
                  Start a new paper from it
                </button>
                <span> (this one stays as it is).</span>
              </p>
            ) : (
              <p className="mt-1 text-ink-soft">
                The publisher&apos;s template is {template.name}:{" "}
                {template.publisherUrl ? (
                  <a href={template.publisherUrl} target="_blank" rel="noopener noreferrer nofollow" className="text-accent hover:underline">
                    get it from the publisher
                  </a>
                ) : (
                  "get it from the publisher"
                )}
                , then Import a .zip from the project list.
              </p>
            )}
          </section>
        </>
      ) : (
        <p className="text-ink-soft">
          No target journal yet. Search for one below, or{" "}
          <button type="button" onClick={onOpenMatch} className="text-accent hover:underline">
            match your draft
          </button>{" "}
          to see which fit.
        </p>
      )}

      <section className="mt-8 border-t border-line pt-6">
        <h4 className="font-medium">{journalId ? "Change the target journal" : "Choose a target journal"}</h4>
        <input
          aria-label="Search journals"
          placeholder={all ? "Journal name…" : "Loading the index…"}
          disabled={!all}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="mt-2 w-full rounded-sm border border-line bg-paper px-3 py-1.5 disabled:opacity-60"
        />
        {matches.length > 0 && (
          <ul className="mt-2 divide-y divide-line border-y border-line">
            {matches.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(asJournal(m));
                    setQ("");
                  }}
                  className="w-full py-1.5 text-left hover:text-accent"
                >
                  {m.display_name}
                  {m.field && <span className="ml-2 text-xs text-ink-soft">{m.field}</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
        {q.trim() && all && matches.length === 0 && <p className="mt-2 text-ink-soft">No journal in this index matches.</p>}
        {journalId && (
          <button type="button" onClick={() => onChange(null)} className="mt-3 text-ink-soft hover:text-ink">
            Clear target
          </button>
        )}
      </section>
    </div>
  );
}
