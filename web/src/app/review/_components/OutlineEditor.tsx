"use client";

import { useState } from "react";
import { countWords } from "@/lib/formatCheck";
import type { Section, SectionKind } from "@/lib/reviewTypes";

// The detected outline, editable before consent. Everything here is local —
// the outline decides what is sent (and what never is), it isn't sent itself.
const KIND_OPTIONS: { value: SectionKind | "excluded"; label: string }[] = [
  { value: "abstract", label: "Abstract" },
  { value: "introduction", label: "Introduction" },
  { value: "methods", label: "Methods" },
  { value: "results", label: "Results" },
  { value: "discussion", label: "Discussion / conclusion" },
  { value: "body", label: "Main text" },
  { value: "supplement", label: "Supplementary" },
  { value: "references", label: "References" },
  { value: "other", label: "Front matter / other" },
  { value: "excluded", label: "Don't send" },
];

export type OutlineRow = Section & { excluded: boolean; reviewedAtTier: boolean };

export default function OutlineEditor({
  rows,
  unmatchedHeadings,
  edited,
  onKind,
  onMerge,
  onAddHeading,
  onReset,
}: {
  rows: OutlineRow[];
  unmatchedHeadings: string[];
  edited: boolean;
  onKind: (charStart: number, kind: SectionKind | "excluded") => void;
  onMerge: (charStart: number) => void;
  onAddHeading: (heading: string) => void;
  onReset: () => void;
}) {
  const [heading, setHeading] = useState("");
  const excluded = rows.filter((r) => r.excluded).length;
  return (
    <details className="mt-4 rounded-sm border border-line bg-paper-alt text-sm" data-testid="review-outline">
      <summary className="cursor-pointer px-3 py-2">
        <span className="font-medium">Detected outline</span>{" "}
        <span className="text-ink-soft">
          · {rows.length - excluded} section{rows.length - excluded === 1 ? "" : "s"}
          {excluded > 0 ? ` · ${excluded} excluded` : ""} · check or edit
        </span>
      </summary>
      <div className="border-t border-line px-3 py-3">
        <p className="text-xs text-ink-soft">
          Taken from your document&apos;s own headings where it has them. Fix a section&apos;s type, merge
          a section into the one before it, or mark a section &ldquo;Don&apos;t send&rdquo; — it will
          never leave your device. This outline stays on your device too.
        </p>
        <ul className="mt-3 divide-y divide-line">
          {rows.map((r, i) => (
            <li key={r.charStart} className={`flex flex-wrap items-center gap-2 py-2 ${r.excluded ? "opacity-60" : ""}`}>
              <span className="min-w-0 flex-1 truncate" title={r.title}>
                {r.title}
                <span className="ml-2 text-xs text-ink-soft">
                  {countWords(r.text).toLocaleString()} words
                  {r.excluded ? " · won't be sent" : r.reviewedAtTier ? "" : " · not reviewed at this depth"}
                </span>
              </span>
              <select
                aria-label={`Type of section: ${r.title}`}
                value={r.excluded ? "excluded" : r.kind}
                onChange={(e) => onKind(r.charStart, e.target.value as SectionKind | "excluded")}
                className="rounded-sm border border-line bg-paper px-1 py-0.5 text-xs"
              >
                {KIND_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              {i > 0 && (
                <button type="button" onClick={() => onMerge(r.charStart)} className="text-xs text-accent hover:underline">
                  Merge into previous
                </button>
              )}
            </li>
          ))}
        </ul>
        <form
          className="mt-3 flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (heading.trim()) onAddHeading(heading.trim());
            setHeading("");
          }}
        >
          <label className="text-xs text-ink-soft" htmlFor="outline-add-heading">
            Missing a heading? Type it exactly as it appears:
          </label>
          <input
            id="outline-add-heading"
            value={heading}
            onChange={(e) => setHeading(e.target.value)}
            className="min-w-0 flex-1 rounded-sm border border-line bg-paper px-2 py-1 text-xs"
          />
          <button type="submit" className="text-xs text-accent hover:underline">
            Add heading
          </button>
          {edited && (
            <button type="button" onClick={onReset} className="text-xs text-ink-soft hover:underline">
              Undo all edits
            </button>
          )}
        </form>
        {unmatchedHeadings.length > 0 && (
          <p className="mt-2 text-xs text-away" role="status">
            Couldn&apos;t find {unmatchedHeadings.map((h) => `“${h}”`).join(", ")} as a line in your paper — check the
            exact wording.
          </p>
        )}
      </div>
    </details>
  );
}
