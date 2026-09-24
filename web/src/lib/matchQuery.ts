// What the matcher reads from a paper: its title, its real abstract, its
// keywords, and its reference list — instead of "the first 3,000 characters",
// which for most PDFs is a title page of authors and affiliations. Pure and
// local; the page shows the result ("What we read") so a bad read is visible.
import { extractAbstract } from "./formatCheck.ts";

export type PaperQuery = {
  title: string;
  abstract: string | null;
  keywords: string[];
  queryText: string; // what gets embedded
  source: "abstract" | "fallback" | "pasted";
  references: string | null; // the reference list's text, for references.ts
};

// Lines that are never the title and never belong in the query: author
// affiliations, contact lines, dates, licences, journal banners.
const NOT_CONTENT =
  /@|\buniversit|\bdepartment\b|\bdept\b|\binstitut|\bhospital\b|\bschool of\b|\bfaculty\b|\bcollege\b|\bcorrespond|\borcid\b|\breceived\b|\baccepted\b|\bpublished\b|\bdoi\b|©|\bcopyright\b|\blicen[cs]e\b|\bvol(?:ume)?\.?\s*\d|\bissn\b|https?:|www\./i;
const MOSTLY_SYMBOLS = /^[\d\s,.*†‡§¶#|–-]+$/;

export function stripAffiliations(text: string): string {
  return text
    .split("\n")
    .filter((l) => !NOT_CONTENT.test(l) && !MOSTLY_SYMBOLS.test(l.trim()))
    .join("\n")
    .trim();
}

function findTitle(head: string): string {
  const lines = head.split("\n").map((l) => l.trim());
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (l.length < 20 || l.length > 300 || NOT_CONTENT.test(l) || /^(abstract|summary)\b/i.test(l)) continue;
    // "Original research article" banners and all-caps journal names aren't titles.
    if (l === l.toUpperCase() && /[A-Z]/.test(l) && l.split(" ").length <= 6) continue;
    // A title wrapped onto a second line that continues it in lower case.
    const next = lines[i + 1] ?? "";
    return !/[.:?!]$/.test(l) && /^[a-z]/.test(next) && !NOT_CONTENT.test(next) ? `${l} ${next}` : l;
  }
  return "";
}

function findKeywords(head: string): string[] {
  const m = head.match(/^\s*key\s*words?\s*[:—-]?\s*(.+)$/im);
  return m ? m[1].split(/[;,·•]/).map((k) => k.trim()).filter((k) => k.length > 1 && k.length < 80).slice(0, 10) : [];
}

// Everything after the paper's last reference-list heading ("References",
// "5. References", "Bibliography", or typeset letter-spaced "R E F E R E N C E S").
const REF_HEADING = /^\s*(?:[ivx]+\.|\d+\.?)?\s*(?:references|reference list|bibliography|literature cited|works cited)\s*:?\s*$/i;
function findReferences(fullText: string): string | null {
  const lines = fullText.split("\n");
  let at = -1;
  lines.forEach((l, i) => {
    const squeezed = /^\s*(?:[A-Za-z] ){3,}[A-Za-z]\s*$/.test(l) ? l.replace(/ /g, "") : l;
    if (REF_HEADING.test(squeezed)) at = i;
  });
  const text = at >= 0 ? lines.slice(at + 1).join("\n").trim() : "";
  return text || null;
}

export function buildQuery(paper: { fullText: string }): PaperQuery {
  const { fullText } = paper;
  const head = fullText.slice(0, 6000);
  const title = findTitle(head);
  const found = extractAbstract(fullText)?.text ?? "";
  const abstract = found.length >= 200 ? found : null;
  const keywords = findKeywords(head);
  const references = findReferences(fullText);
  if (abstract) {
    const kw = keywords.length ? `\n\n${keywords.join("; ")}` : "";
    return { title, abstract, keywords, queryText: `${title}\n\n${abstract}${kw}`.trim(), source: "abstract", references };
  }
  return { title, abstract: null, keywords, queryText: stripAffiliations(fullText.slice(0, 3000)), source: "fallback", references };
}

// The paste box: first line is the title when there's more than one line.
export function queryFromPasted(text: string): PaperQuery {
  const lines = text.trim().split("\n");
  const multi = lines.length > 1;
  const title = multi ? lines[0].trim() : "";
  const abstract = (multi ? lines.slice(1).join("\n") : text).trim();
  return { title, abstract, keywords: [], queryText: text.trim(), source: "pasted", references: null };
}
