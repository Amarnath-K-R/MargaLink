// Pure, isomorphic (client + server) helpers for linking to a journal's
// detail page. OpenAlex ids are full URLs (https://openalex.org/S123...) —
// too ugly/unsafe as a route segment, so routes use just the short id.
export function shortId(openAlexId: string): string {
  return openAlexId.split("/").pop() ?? openAlexId;
}

export function journalHref(openAlexId: string): string {
  return `/journal/${shortId(openAlexId)}`;
}

// Only journals marked `prerendered` have a real static /journal/[id] page
// (see pipeline/build_index.py's mark_prerendered) — everywhere that links
// to one must check this first and fall back to an inline detail view
// otherwise, or the link 404s under static export (no server to render an
// unlisted dynamic route on demand). Missing field = built before this
// existed, when every journal was prerendered — default open, not closed.
export function isPrerendered(journal: { prerendered?: boolean }): boolean {
  return journal.prerendered !== false;
}

// A journal's website and policy links come from OpenAlex and DOAJ, third
// parties: only an http(s) address is rendered as a link, never another
// scheme (React blocks javascript: today; this doesn't rely on it).
export function webLink(url: string | null | undefined): string | null {
  const u = (url ?? "").trim();
  return /^https?:\/\/[^/\s]/i.test(u) ? u : null;
}
