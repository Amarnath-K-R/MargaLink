// What the matcher reads from a paper: its title, its real abstract and its
// keywords, never its reference list or its main text. Without an abstract,
// the start of the paper with the author and affiliation lines removed (the
// best of what we measured on full texts without one: better than the
// methods). Pure and local; the page shows the result ("What we read") so a
// bad read is visible.
import { extractAbstract } from "../checks/formatCheck.ts";

export type PaperQuery = {
  title: string;
  abstract: string | null;
  keywords: string[];
  queryText: string; // what gets embedded
  source: "abstract" | "fallback" | "pasted";
};

// Lines that are never content, wherever they are: contact details, dates
// of receipt, licences, journal banners.
const META_LINE =
  /@|\borcid\b|^\W*corresponding\b|^\W*correspondence\b|\b(?:received|accepted|revised|published)\b[^.]{0,30}\d{4}|\bdoi\b|©|\bcopyright\b|\blicen[cs]e\b|\bvol(?:ume)?\.?\s*\d|\bissn\b|https?:|www\./i;
// An institution word marks an affiliation only on a line shaped like one
// (a footnote marker first, an address of commas, or the institution first):
// "In-hospital mortality…" is a title, "1 Department of Cardiology, …" isn't.
const INSTITUTION = /\buniversit|\bdepartment\b|\bdept\b|\binstitut|\bhospital\b|\bschool of\b|\bfaculty\b|\bcollege\b/i;
const isAffiliation = (l: string) =>
  INSTITUTION.test(l) && (/^\s*[\d¹²³⁴⁵⁶⁷⁸⁹*†‡§]/.test(l) || (l.match(/,/g)?.length ?? 0) >= 2 || /^\s*(?:the\s+)?(?:universit|department|dept|institut|hospital|school of|faculty|college)/i.test(l));
// "Amir Foroutan1, Jane Doe2*, Ravi Kumar1,3": two or more capitalised names, each with its markers.
const AUTHOR = /^(?:\p{Lu}[\p{L}'’.-]*\s+){0,3}\p{Lu}[\p{L}'’-]+[\d*†‡§¶,\s]*$/u;
const isAuthorLine = (l: string) => {
  const parts = l.split(/,(?!\d)|\band\b|&/).map((p) => p.trim()).filter(Boolean);
  return parts.length >= 2 && parts.every((p) => AUTHOR.test(p));
};
const notContent = (l: string) => META_LINE.test(l) || isAffiliation(l) || isAuthorLine(l);
const MOSTLY_SYMBOLS = /^[\d\s,.*†‡§¶#|–-]+$/;

// The fallback query (no abstract found): the front matter's author and
// affiliation lines go, but only before the first real paragraph, so an
// opening paragraph that mentions a hospital stays.
export function stripAffiliations(text: string): string {
  const lines = text.split("\n");
  const firstParagraph = lines.findIndex((l) => l.trim().length >= 200);
  const front = firstParagraph === -1 ? lines.length : firstParagraph;
  return lines
    .filter((l, i) => !META_LINE.test(l) && !MOSTLY_SYMBOLS.test(l.trim()) && !(i < front && (isAffiliation(l) || isAuthorLine(l))))
    .join("\n")
    .trim();
}

function findTitle(head: string): string {
  const lines = head.split("\n").map((l) => l.trim());
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (l.length < 20 || l.length > 300 || notContent(l) || /^(abstract|summary)\b/i.test(l)) continue;
    // "Original research article" banners and all-caps journal names aren't titles.
    if (l === l.toUpperCase() && /[A-Z]/.test(l) && l.split(" ").length <= 6) continue;
    // A title wrapped onto a second line that continues it in lower case, or a subtitle after its colon.
    const next = lines.slice(i + 1).find((x) => x) ?? ""; // a Word document puts a blank line between paragraphs
    const continues = (!/[.:?!]$/.test(l) && /^[a-z]/.test(next)) || (/:$/.test(l) && next.length >= 10 && next.length <= 300 && !/^(abstract|summary)\b/i.test(next));
    return continues && !notContent(next) ? `${l} ${next}` : l;
  }
  return "";
}

function findKeywords(head: string): string[] {
  const m = head.match(/^\s*key\s*words?\s*[:—-]?\s*(.+)$/im);
  return m ? m[1].split(/[;,·•]/).map((k) => k.trim()).filter((k) => k.length > 1 && k.length < 80).slice(0, 10) : [];
}

export function buildQuery(paper: { fullText: string }): PaperQuery {
  const { fullText } = paper;
  const head = fullText.slice(0, 6000);
  const title = findTitle(head);
  const found = extractAbstract(fullText)?.text ?? "";
  const abstract = found.length >= 200 ? found : null;
  const keywords = findKeywords(head);
  if (abstract) {
    const kw = keywords.length ? `\n\n${keywords.join("; ")}` : "";
    return { title, abstract, keywords, queryText: `${title}\n\n${abstract}${kw}`.trim(), source: "abstract" };
  }
  return { title, abstract: null, keywords, queryText: stripAffiliations(fullText.slice(0, 3000)), source: "fallback" };
}

// The paste box: first line is the title when there's more than one line.
export function queryFromPasted(text: string): PaperQuery {
  const lines = text.trim().split("\n");
  const multi = lines.length > 1;
  const title = multi ? lines[0].trim() : "";
  const abstract = (multi ? lines.slice(1).join("\n") : text).trim();
  return { title, abstract, keywords: [], queryText: text.trim(), source: "pasted" };
}
