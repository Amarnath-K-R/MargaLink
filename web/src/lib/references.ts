// Which journals a paper cites, from its own reference list — computed in the
// browser, never sent anywhere. A strong matching signal: authors cite the
// journals they write for. Pure, so the selfcheck and the harness can drive it.
//
// Journal names are ordinary words often enough ("Science", "Cell", "Blood")
// that matching any occurrence would credit a journal for a paper title. So a
// name counts only where a journal name sits in a reference: directly followed
// by a year or a volume/page, and — for one-word names — right after the end
// of the title (a full stop or comma).

export type NameEntry = { tokens: string[]; ids: string[]; oneWord: boolean };
export type NameIndex = { byFirstToken: Map<string, NameEntry[]> };

// Single words too generic to be a journal on their own, whatever the index says.
const STOP_NAMES = new Set(["journal", "review", "reviews", "letters", "proceedings", "research", "reports", "annals", "bulletin", "advances", "science and technology", "medicine", "nursing", "chemistry", "physics", "biology"]);

const stripDiacritics = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");

// "N. Engl. J. Med." → "n engl j med"; "The Lancet" → "lancet"; "A & B" → "a and b".
export function normalizeName(s: string): string {
  return stripDiacritics(s)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/^the /, "");
}

// The entry keeps digits and ;:() for the guard; full stops and commas become
// a "|" boundary marker so "the end of the title" is still visible.
function normalizeEntry(s: string): string {
  return stripDiacritics(s)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[.,]/g, " | ")
    .replace(/[^a-z0-9;:()|\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildNameIndex(journals: { id: string; display_name: string; names?: string[] }[]): NameIndex {
  const byName = new Map<string, Set<string>>();
  for (const j of journals) {
    for (const raw of [j.display_name, ...(j.names ?? [])]) {
      const n = normalizeName(raw);
      // Short names only when they're acronyms (BMJ, PNAS); "Gut" or "Ann" would match noise.
      const acronym = /^[A-Z]{3,}$/.test(raw.trim());
      if (!n || STOP_NAMES.has(n) || (n.length < 4 && !acronym)) continue;
      if (!byName.has(n)) byName.set(n, new Set());
      byName.get(n)!.add(j.id);
    }
  }
  const byFirstToken = new Map<string, NameEntry[]>();
  for (const [n, ids] of byName) {
    const tokens = n.split(" ");
    const entry = { tokens, ids: [...ids], oneWord: tokens.length === 1 };
    if (!byFirstToken.has(tokens[0])) byFirstToken.set(tokens[0], []);
    byFirstToken.get(tokens[0])!.push(entry);
  }
  // Longest first, so "journal of physics a" wins over "journal of physics".
  for (const list of byFirstToken.values()) list.sort((a, b) => b.tokens.length - a.tokens.length);
  return { byFirstToken };
}

const NUMBERED = /^\s*(?:\[\d{1,3}\]|\d{1,3}[.)])\s+/;
const APA_START = /^[A-Z][\p{L}'’-]+,\s+(?:[A-Z]\.|[A-Z][a-z]+)/u;

export function splitReferences(text: string): string[] {
  const lines = text.split("\n").map((l) => l.trim());
  const join = (starts: (l: string) => boolean) => {
    const out: string[] = [];
    for (const l of lines) {
      if (!l) continue;
      if (starts(l) || out.length === 0) out.push(l);
      else out[out.length - 1] += ` ${l}`;
    }
    return out;
  };
  if (lines.filter((l) => NUMBERED.test(l)).length >= 3) return join((l) => NUMBERED.test(l)).filter((e) => NUMBERED.test(e));
  const paragraphs = text.split(/\n\s*\n/).map((p) => p.replace(/\s*\n\s*/g, " ").trim()).filter(Boolean);
  if (paragraphs.length >= 3) return paragraphs;
  if (lines.filter((l) => APA_START.test(l)).length >= 3) return join((l) => APA_START.test(l));
  return lines.filter(Boolean);
}

const AFTER = /^[|\s:;]*(?:\(?(?:19|20)\d{2}\b|\d{1,4}\s*(?:[(:;]|\|?\s*\d))/;

function matchesIn(entry: string, index: NameIndex): string[] | null {
  const norm = normalizeEntry(entry);
  const tokens = [...norm.matchAll(/[a-z0-9]+/g)].map((m) => ({ t: m[0], start: m.index!, end: m.index! + m[0].length }));
  let found: string[] | null = null;
  for (let i = 0; i < tokens.length; i++) {
    for (const cand of index.byFirstToken.get(tokens[i].t) ?? []) {
      const n = cand.tokens.length;
      if (i + n > tokens.length || !cand.tokens.every((t, k) => tokens[i + k].t === t)) continue;
      const after = norm.slice(tokens[i + n - 1].end);
      if (!AFTER.test(after)) continue;
      if (cand.oneWord && !/\|\s*$/.test(norm.slice(0, tokens[i].start))) continue;
      // The journal name comes after the title, so the last guarded match wins.
      found = cand.ids;
      i += n - 1;
      break;
    }
  }
  return found;
}

export function countCitedJournals(referencesText: string, index: NameIndex): { counts: Map<string, number>; entries: number; matched: number } {
  const entries = splitReferences(referencesText);
  const counts = new Map<string, number>();
  let matched = 0;
  for (const e of entries) {
    const ids = matchesIn(e, index);
    if (!ids) continue;
    matched++;
    // A name several journals share splits its credit.
    for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1 / ids.length);
  }
  return { counts, entries: entries.length, matched };
}
