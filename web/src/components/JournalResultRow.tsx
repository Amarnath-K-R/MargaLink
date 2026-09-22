"use client";

import Link from "next/link";
import { journalHref, isPrerendered } from "@/lib/journalUrl";
import type { JournalMeta } from "@/lib/match";

// Shared between /journals and /match's result lists: the
// prerendered-link-vs-expand-button title, and the metadata chip row. Two
// pieces, not one component, because the surrounding layout genuinely
// differs — match wraps the title in a rank-number + relevance-score row
// that journals doesn't have, so it can't share a single wrapping element
// with journals' plainer layout. Each page still owns its own <li>, and
// the (nearly identical, 3-line) expanded JournalDetail panel that follows.
//
// Unifying the chip row is a deliberate, small behavior change: match
// already showed a publication_time_weeks chip that journals didn't,
// despite both having the data — journals now shows it too.

export function JournalResultTitle({
  journal,
  expanded,
  onToggleExpand,
}: {
  journal: JournalMeta;
  expanded: boolean;
  onToggleExpand: () => void;
}) {
  if (isPrerendered(journal)) {
    return (
      <Link href={journalHref(journal.id)} className="hover:underline">
        {journal.display_name}
      </Link>
    );
  }
  // No dedicated static page for this one (outside the top ~2,000 by
  // output volume — see build_index.py's mark_prerendered); expand its
  // details right here instead of linking to a page that wouldn't exist
  // under static export.
  return (
    <button type="button" onClick={onToggleExpand} className="text-left hover:underline" aria-expanded={expanded}>
      {journal.display_name}
    </button>
  );
}

export function JournalResultChips({ journal, indent = false }: { journal: JournalMeta; indent?: boolean }) {
  if (
    !journal.field &&
    !journal.is_in_doaj &&
    !journal.medline_indexed &&
    journal.apc_usd == null &&
    journal.publication_time_weeks == null
  ) {
    return null;
  }
  return (
    <div className={`mt-1 flex flex-wrap gap-3 text-xs text-ink-soft${indent ? " pl-6" : ""}`}>
      {journal.field && <span>{journal.field}</span>}
      {journal.is_in_doaj && <span className="text-accent">Open access (DOAJ)</span>}
      {journal.medline_indexed && <span className="text-accent">MEDLINE</span>}
      {journal.apc_usd != null && <span>${journal.apc_usd.toLocaleString()} fee</span>}
      {journal.publication_time_weeks != null && <span>~{journal.publication_time_weeks}wk to publish</span>}
    </div>
  );
}
