// Splits a prepared (stripped + normalized) paper into headed sections and
// bounded chunks for the review's per-section extract passes. Pure — no
// window, no fetch — so the orchestrator's selfcheck can drive it. The
// heading vocab is deliberately conservative: a missed heading only means a
// coarser chunk label, while a false one mislabels a whole span.
import { countWords } from "./formatCheck.ts";
import type { Chunk, PaperMap, Section, SectionKind } from "./reviewTypes.ts";

export const CHUNK_CHARS = 16_000;
export const MIN_SECTION_CHARS = 300;
export const HEAD_CHARS = 6_000; // an abstract heading past this is a later "Summary", not the abstract
const MAX_HEADING_CHARS = 90;

// Same optional numbering prefix formatCheck.ts uses three times (1./I./A.).
const NUMBERING = String.raw`(?:[ivx]+\.|[a-z]\.|\d+\.?)?`;
const HEADING_VOCAB: [SectionKind, string][] = [
  ["abstract", String.raw`abstract|summary`],
  ["introduction", String.raw`introduction|background|background and objectives`],
  ["methods", String.raw`methods?|materials and methods|methodology|patients and methods|subjects and methods|study design|experimental (?:procedures?|section|setup)|materials`],
  ["results", String.raw`results?|findings|results and discussion`],
  ["discussion", String.raw`discussion|general discussion|conclusions?|concluding remarks|limitations|implications`],
  ["references", String.raw`references|reference list|bibliography|works cited|literature cited`],
  ["supplement", String.raw`(?:supplementary|supplemental) (?:material|materials|information|data|methods|figures|tables)|supporting information|appendix|appendices`],
  ["other", String.raw`keywords?|key words?|acknowledge?ments?|funding|conflicts? of interest|competing interests?|declarations?(?: of interest)?|data availability|availability of data and materials|author contributions|ethics (?:statement|approval)|consent for publication|abbreviations|highlights`],
];
const HEADING_RES = HEADING_VOCAB.map(([kind, vocab]) => [kind, new RegExp(String.raw`^\s*${NUMBERING}\s*(?:${vocab})\s*:?\s*$`, "i")] as const);
// For lines already known to be headings (hints): the vocab word may start a
// longer title — "Appendix: All 54 Papers", "Discussion and implications".
const HEADING_PREFIX_RES = HEADING_VOCAB.map(([kind, vocab]) => [kind, new RegExp(String.raw`^\s*${NUMBERING}\s*(?:${vocab})\b`, "i")] as const);

export function vocabKind(heading: string, opts: { prefix: boolean }): SectionKind | null {
  const line = LETTER_SPACED.test(heading) ? heading.replace(/ /g, "") : heading;
  for (const [kind, re] of opts.prefix ? HEADING_PREFIX_RES : HEADING_RES) if (re.test(line)) return kind;
  return null;
}
// "3.2 Secondary outcomes" — a subsection line, used only to pick chunk
// boundaries. Capital start and no commas/parens/colons: a wrapped prose line
// like "79.3 years), with equal numbers of men and women," (seen in a real
// JACC PDF) must not become a chunk title.
const SUBSECTION_LINE = /^\s*\d{1,2}\.\d{1,2}(?:\.\d{1,2})*\.?\s+[A-Z][^.,;:()\n]{0,80}$/;
// Journal typesetting sometimes letter-spaces headings ("R E F E R E N C E S").
const LETTER_SPACED = /^\s*(?:[A-Za-z] ){3,}[A-Za-z]\s*$/;
// The heading word must start with a capital: a line that is just "methods"
// is a wrapped prose fragment, not a heading (seen in a real PDF).
const CAPITAL_START = /^\s*(?:[ivxIVX]+\.|[a-zA-Z]\.|\d+\.?)?\s*[A-Z]/;

function headingKind(rawLine: string, offset: number): SectionKind | null {
  if (rawLine.length > MAX_HEADING_CHARS) return null;
  const line = LETTER_SPACED.test(rawLine) ? rawLine.replace(/ /g, "") : rawLine;
  if (!CAPITAL_START.test(line)) return null;
  for (const [kind, re] of HEADING_RES) {
    if (!re.test(line)) continue;
    return kind === "abstract" && offset > HEAD_CHARS ? "other" : kind;
  }
  return null;
}

export function splitIntoSections(text: string): Section[] {
  const marks: { title: string; kind: SectionKind; start: number }[] = [];
  let offset = 0;
  for (const line of text.split("\n")) {
    const kind = headingKind(line, offset);
    if (kind) marks.push({ title: line.trim(), kind, start: offset });
    offset += line.length + 1;
  }
  if (marks.length === 0) return [{ id: "s1", title: "Paper", kind: "other", text, charStart: 0, charEnd: text.length }];

  const spans: Omit<Section, "id">[] = [];
  if (text.slice(0, marks[0].start).trim()) spans.push({ title: "Front matter", kind: "other", text: "", charStart: 0, charEnd: marks[0].start });
  marks.forEach((m, i) => spans.push({ title: m.title, kind: m.kind, text: "", charStart: m.start, charEnd: marks[i + 1]?.start ?? text.length }));

  // Merge sections shorter than MIN_SECTION_CHARS: forward when the
  // predecessor is the abstract (so the abstract stays exactly the abstract —
  // it's handed to the model as "the ONLY text that counts as the abstract"),
  // backward otherwise (a lone "Results" table header). The first span is
  // never merged away; a trailing short span merges backward.
  for (let i = 1; i < spans.length; ) {
    const s = spans[i];
    if (s.charEnd - s.charStart >= MIN_SECTION_CHARS) { i++; continue; }
    const prev = spans[i - 1];
    const next = spans[i + 1];
    if (next && prev.kind === "abstract") { next.charStart = s.charStart; spans.splice(i, 1); }
    else { prev.charEnd = s.charEnd; spans.splice(i, 1); }
  }
  return spans.map((s, i) => ({ ...s, id: `s${i + 1}`, text: text.slice(s.charStart, s.charEnd) }));
}

type Span = { title: string | null; text: string };

function splitAtSubsections(text: string): Span[] {
  const spans: Span[] = [];
  let current: Span = { title: null, text: "" };
  for (const line of text.split("\n")) {
    if (SUBSECTION_LINE.test(line) && line.length <= MAX_HEADING_CHARS) {
      if (current.text) spans.push(current);
      current = { title: line.trim(), text: "" };
    }
    current.text += line + "\n";
  }
  if (current.text) spans.push(current);
  // text.split("\n") adds one trailing "\n" the source didn't have
  const last = spans[spans.length - 1];
  if (last) last.text = last.text.slice(0, -1);
  // A short run-in before the first subsection (usually just the section
  // heading) folds into that subsection so the chunk carries its title.
  if (spans.length > 1 && spans[0].title === null && spans[0].text.trim().length < 200) {
    spans[1].text = spans[0].text + spans[1].text;
    spans.shift();
  }
  return spans;
}

// Cut an oversized span so no chunk ever exceeds CHUNK_CHARS: prefer a
// paragraph break, then a line break, then a space — but only in the second
// half of the window, so text with no breaks (or one early break) never
// degenerates into tiny chunks.
function cutOversized(span: Span): Span[] {
  const out: Span[] = [];
  let rest = span.text;
  let title = span.title;
  while (rest.length > CHUNK_CHARS) {
    const window = rest.slice(0, CHUNK_CHARS);
    let at = window.lastIndexOf("\n\n");
    if (at < CHUNK_CHARS / 2) at = window.lastIndexOf("\n");
    if (at < CHUNK_CHARS / 2) at = window.lastIndexOf(" ");
    if (at < CHUNK_CHARS / 2) at = CHUNK_CHARS;
    out.push({ title, text: rest.slice(0, at) });
    rest = rest.slice(at);
    title = null;
  }
  out.push({ title, text: rest });
  return out;
}

function pack(spans: Span[]): Span[] {
  const packed: Span[] = [];
  for (const span of spans.flatMap(cutOversized)) {
    const last = packed[packed.length - 1];
    if (last && last.text.length + span.text.length <= CHUNK_CHARS) last.text += span.text;
    else packed.push({ ...span });
  }
  return packed;
}

export function chunkSections(sections: Section[]): Chunk[] {
  const chunks: Chunk[] = [];
  for (const s of sections) {
    if (s.text.length <= CHUNK_CHARS) {
      chunks.push({ id: s.id, sectionId: s.id, title: s.title, kind: s.kind, part: 1, parts: 1, text: s.text });
      continue;
    }
    const parts = pack(splitAtSubsections(s.text));
    parts.forEach((p, i) =>
      chunks.push({
        id: `${s.id}-p${i + 1}`,
        sectionId: s.id,
        title: p.title ? `${s.title} · ${p.title}` : `${s.title} (part ${i + 1}/${parts.length})`,
        kind: s.kind,
        part: i + 1,
        parts: parts.length,
        text: p.text,
      })
    );
  }
  return chunks;
}

export function buildPaperMap(text: string, sections: Section[]): PaperMap {
  const firstLine = text.split("\n").map((l) => l.trim()).find((l) => l.length > 0) ?? null;
  return {
    title: firstLine && firstLine.length <= 200 ? firstLine : null,
    totalWords: countWords(text),
    sections: sections.map((s) => ({ id: s.id, title: s.title, kind: s.kind, words: countWords(s.text) })),
  };
}
