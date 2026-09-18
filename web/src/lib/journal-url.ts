// Pure, isomorphic (client + server) helpers for linking to a journal's
// detail page. OpenAlex ids are full URLs (https://openalex.org/S123...) —
// too ugly/unsafe as a route segment, so routes use just the short id.
export function shortId(openAlexId: string): string {
  return openAlexId.split("/").pop() ?? openAlexId;
}

export function journalHref(openAlexId: string): string {
  return `/journal/${shortId(openAlexId)}`;
}
