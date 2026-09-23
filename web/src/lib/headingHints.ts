// Recovers a paper's own heading structure — what the author or typesetter
// marked as a heading — so the review's sections follow the document instead
// of a word list. Pure: extract.ts gathers per-line font data from pdf.js /
// mammoth HTML and hands it here. Heuristics are grounded in real papers
// (BMC: GillSans-Bold sections + BoldItalic subsections; JACC: one dedicated
// heading font at 8pt vs 7.7pt body; JCSM: a ".B" font, UPPERCASE top level,
// 11pt subsections; a Word review with Heading 1/Heading 2 styles).
import { vocabKind } from "./reviewSections.ts";
import type { HeadingHint } from "./reviewTypes.ts";

// One extracted line: its dominant (by character count) real font name and
// max font size, and whether every non-space character used that one font.
export type LineFontInfo = { text: string; font: string; size: number; wholeLine: boolean };

const sig = (l: LineFontInfo) => `${l.font}@${l.size}`;
const ITALIC_ONLY = (font: string) => /italic|oblique|\.I$/i.test(font) && !/bold|black|heavy|\.B\b/i.test(font);
const CAPTION = /^(?:table|figure|fig\.?|supplementary (?:table|figure))\s*[A-Z]?\d/i;

function headingShaped(l: LineFontInfo, body: string): boolean {
  const t = l.text.trim();
  if (!l.wholeLine || sig(l) === body || t.length < 2 || t.length > 90) return false;
  if (!/^[\p{L}\d]/u.test(t) || /[.,;]$/.test(t) || CAPTION.test(t) || ITALIC_ONLY(l.font)) return false;
  const letters = (t.match(/\p{L}/gu) ?? []).length;
  return letters >= Math.max(2, t.replace(/\s/g, "").length / 2); // not a row of numbers
}

export function pickPdfHeadings(lines: LineFontInfo[]): HeadingHint[] {
  const nonEmpty = lines.filter((l) => l.text.trim());
  if (nonEmpty.length === 0) return [];
  const chars = new Map<string, number>();
  for (const l of nonEmpty) chars.set(sig(l), (chars.get(sig(l)) ?? 0) + l.text.trim().length);
  const body = [...chars.entries()].sort((a, b) => b[1] - a[1])[0][0];

  // A heading is followed by body text — directly, or via one more heading
  // ("Methods" → "Study criteria" → prose). Figure labels, table headers and
  // bold reference fragments are followed by more of their own font instead.
  const followedByBody = (i: number, hops: number): boolean => {
    const next = nonEmpty[i + 1];
    if (!next) return false;
    if (sig(next) === body) return true;
    return hops > 0 && headingShaped(next, body) && followedByBody(i + 1, hops - 1);
  };
  const candidates = nonEmpty.map((l, i) => ({ l, i })).filter(({ l, i }) => headingShaped(l, body) && followedByBody(i, 1));

  // A heading style is used more than once; a one-off (the paper's title, a
  // journal banner) is not structure.
  const bySig = new Map<string, LineFontInfo[]>();
  for (const { l } of candidates) bySig.set(sig(l), [...(bySig.get(sig(l)) ?? []), l]);
  const styles = [...bySig.entries()].filter(([, ls]) => ls.length >= 2);
  if (styles.length === 0) return [];

  // Level 1 = the style that carries Methods/Results/… most often; failing
  // that, the largest size (tie: more UPPERCASE lines).
  const score = ([, ls]: [string, LineFontInfo[]]) => ls.filter((l) => vocabKind(l.text.trim(), { prefix: false })).length;
  const upper = ([, ls]: [string, LineFontInfo[]]) => ls.filter((l) => l.text === l.text.toUpperCase()).length;
  const ranked = [...styles].sort((a, b) => score(b) - score(a) || b[1][0].size - a[1][0].size || upper(b) - upper(a));
  const level1 = ranked[0][0];
  const kept = new Set(styles.map(([s]) => s));

  let hints: HeadingHint[] = candidates
    .filter(({ l }) => kept.has(sig(l)))
    .map(({ l }) => ({ text: l.text.trim(), level: sig(l) === level1 ? (1 as const) : (2 as const) }));
  // Anything before the first recognizable section heading is front matter
  // (title lines, banners) even if it shares a heading font.
  const firstVocab = hints.findIndex((h) => h.level === 1 && vocabKind(h.text, { prefix: false }));
  if (firstVocab > 0) hints = hints.slice(firstVocab);
  return hints;
}

const decode = (s: string) =>
  s
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();

// mammoth's HTML: Word's Heading 1 → <h1>, Heading 2–6 → <h2>–<h6>. Only when
// the author used no heading styles at all do whole-bold short paragraphs
// outside tables count — as subsections, since bold alone is a weak signal.
export function pickDocxHeadings(html: string): HeadingHint[] {
  const styled = [...html.matchAll(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/g)]
    .map((m) => ({ text: decode(m[2]), level: m[1] === "1" ? (1 as const) : (2 as const) }))
    .filter((h) => h.text.length > 0 && h.text.length <= 200);
  if (styled.length > 0) return styled;

  const noTables = html.replace(/<table[\s\S]*?<\/table>/g, "");
  const paras = [...noTables.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)].map((m) => m[1]);
  const hints: HeadingHint[] = [];
  paras.forEach((p, i) => {
    const wholeBold = /^<strong>[^<]*<\/strong>$/.test(p.trim());
    const next = paras[i + 1];
    const text = decode(p);
    if (wholeBold && text.length >= 2 && text.length <= 90 && !/[.,;]$/.test(text) && next && !/^<strong>/.test(next.trim())) {
      hints.push({ text, level: 2 });
    }
  });
  return hints;
}

// pdf.js text items for one page → one LineFontInfo per extracted line, built
// with the same item joining extract.ts uses for fullText (so hint text
// matches the lines the sectioner later reads). `realFont` maps pdf.js's
// internal font id to the embedded font's real name ("GillSans-Bold").
type TextItemLike = { str: string; hasEOL: boolean; fontName: string; transform: number[] };
export function linesFromTextItems(items: TextItemLike[], realFont: (id: string) => string): LineFontInfo[] {
  const lines: LineFontInfo[] = [];
  let text = "";
  let size = 0;
  let fonts = new Map<string, number>();
  const flush = () => {
    const dominant = [...fonts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
    lines.push({ text: text.replace(/[ \t]+/g, " "), font: dominant, size, wholeLine: fonts.size <= 1 });
    text = "";
    size = 0;
    fonts = new Map();
  };
  for (const it of items) {
    text += it.str + (it.hasEOL ? "" : " ");
    const n = it.str.replace(/\s/g, "").length;
    if (n) {
      // Drop the per-subset tag ("PNOJNK+GillSans-Bold"): the same face is
      // re-subset per page, and one heading style must stay one signature.
      const font = realFont(it.fontName).replace(/^[A-Z]{6}\+/, "");
      fonts.set(font, (fonts.get(font) ?? 0) + n);
      size = Math.max(size, Math.round(Math.hypot(it.transform[2], it.transform[3]) * 10) / 10);
    }
    if (it.hasEOL) flush();
  }
  if (text.trim()) flush();
  return lines;
}
