// A Word document (Folio's ProseMirror document) read as prose for the
// spelling checker, and the checker's marks mapped back to the document.
// Pure; docText.selfcheck.ts runs it on Folio's own schema.
import { applyFolioDocumentOperations, createFolioAIEditSnapshot, createFolioAITextRangeHandle, type FolioAIEditOperation } from "@stll/folio-core/ai-edits";
import { buildCleanBlockText, type CleanBlockText } from "@stll/folio-core/ai-edits/clean-text";
import { collectNoteReferenceLabels } from "@stll/folio-core/ai-edits/snapshot";
import type { Node } from "prosemirror-model";
import type { EditorState, Transaction } from "prosemirror-state";

export type DocProse = {
  source: string; // every paragraph's text (tracked changes as if accepted), each followed by a blank line
  prose: string; // the same, with citations, content controls and footnote marks blanked: what the checker reads
  blocks: { at: number; clean: CleanBlockText }[]; // where each paragraph starts in `source`
};

/**
 * Every paragraph of the document (table cells included) as Folio's AI
 * features read it: tracked changes as if accepted, a field (a citation, a
 * cross-reference) as the text it shows and a footnote reference as its
 * marker, both blanked in `prose` with the text of content controls (where
 * citation managers also keep citations), so none of them is ever marked.
 */
export function docProse(doc: Node): DocProse {
  const blocks: DocProse["blocks"] = [];
  let source = "";
  let prose = "";
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    const clean = buildCleanBlockText(node, pos, { fieldResults: "text" });
    const out = clean.text.split("");
    const blank = (from: number, to: number) => out.fill(" ", from, to);
    for (const b of clean.structuralBoundaries) if (b.type === "field" || b.type === "noteReference") blank(b.offset, b.offset + b.length);
    node.descendants((child, at) => {
      if (child.type.name !== "sdt") return true;
      const [from, to] = [pos + 1 + at, pos + 1 + at + child.nodeSize];
      clean.offsets.forEach((o, i) => void (i < out.length && o >= from && o < to && (out[i] = " ")));
      return false;
    });
    blocks.push({ at: source.length, clean });
    source += `${clean.text}\n\n`;
    prose += `${out.join("")}\n\n`;
    return false;
  });
  return { source, prose, blocks };
}

/**
 * Where `source[from, to)` is in the document: its characters one after
 * another, so nothing that takes no character of its own (a picture, an
 * equation, a comment's anchor, a bookmark) sits inside or is swallowed at
 * its end. Null across paragraphs or into a field or a footnote mark.
 */
export function docRange(p: DocProse, from: number, to: number): { from: number; to: number } | null {
  let block: DocProse["blocks"][number] | undefined;
  for (const b of p.blocks) {
    if (b.at > from) break;
    block = b;
  }
  if (!block || to > block.at + block.clean.text.length || to <= from) return null;
  const o = block.clean.offsets;
  const [s, e] = [from - block.at, to - block.at];
  if (block.clean.structuralBoundaries.some((b) => "length" in b && s < b.offset + b.length && b.offset < e)) return null;
  for (let k = s; k < e - 1; k++) if (o[k + 1] !== o[k] + 1) return null;
  return { from: o[s], to: o[e - 1] + 1 };
}

/**
 * A mark's fix as one transaction: only the letters that differ change, and
 * the new ones carry the marks of those they replace, so a comment, a link
 * or a tracked insertion on the word stays. Null when the word has changed
 * since it was marked, or something other than text is in its range.
 */
export function fixWord(state: EditorState, m: { from: number; to: number; word: string }, text: string): Transaction | null {
  if (state.doc.textBetween(m.from, m.to) !== m.word) return null;
  let onlyText = true;
  state.doc.nodesBetween(m.from, m.to, (n) => void (n.isInline && !n.isText && (onlyText = false)));
  if (!onlyText) return null;
  const old = m.word;
  let a = 0;
  while (a < old.length && a < text.length && old[a] === text[a]) a++;
  let b = 0;
  while (b < old.length - a && b < text.length - a && old[old.length - 1 - b] === text[text.length - 1 - b]) b++;
  const [from, to, mid] = [m.from + a, m.to - b, text.slice(a, text.length - b)];
  if (!mid) return state.tr.delete(from, to);
  const marks = state.doc.nodeAt(from < to || a === 0 ? from : from - 1)?.marks ?? [];
  return state.tr.replaceWith(from, to, state.schema.text(mid, marks));
}

// --- Rewrite (rewrite.ts): a Word selection as a passage, and the answer put back.

export type WordPassage = {
  passage: string; // the paragraphs joined by blank lines, every object a numbered placeholder ⟦n⟧
  // Each paragraph: where it is, its text when read (as Folio's own edits read it), and the stretches of
  // words between its objects, in that text's offsets (the stretch between two touching objects is empty).
  blocks: { pos: number; text: string; gaps: { start: number; end: number }[] }[];
};
const PLACEHOLDER = /⟦(\d+)⟧/g;

/**
 * Rewrite's passage for the selection [from, to): each paragraph's words,
 * with everything that isn't prose (a citation or other field, a footnote
 * mark, an equation, a picture, a shape, a symbol, a bookmark, a comment's
 * anchor, a tab, a line break) as a placeholder that stays where it is. A
 * paragraph's whitespace at either end stays out. Refused, before anything
 * is sent, over tracked changes, text holding ⟦ or ⟧, or a paragraph Folio
 * reads differently.
 */
export function docPassage(doc: Node, from: number, to: number): WordPassage | string {
  const labels = collectNoteReferenceLabels(doc);
  const snapshot = createFolioAIEditSnapshot(doc);
  const { insertion, deletion } = doc.type.schema.marks;
  const blocks: WordPassage["blocks"] = [];
  const paragraphs: string[] = [];
  let n = 0;
  let refusal: string | null = null;
  doc.nodesBetween(from, to, (node, pos) => {
    if (refusal) return false;
    if (!node.isTextblock) return true;
    const clean = buildCleanBlockText(node, pos, { fieldResults: "text", noteReferences: labels });
    const { text, offsets } = clean;
    const spans = clean.structuralBoundaries.flatMap((b) => (b.type === "field" || b.type === "noteReference" ? [[b.offset, b.offset + b.length]] : []));
    const inSpan = (k: number) => spans.some(([a, b]) => a <= k && k < b);
    // The selection's part of the paragraph, an object it starts or ends in taken whole, its whitespace left out.
    let s = 0;
    while (s < text.length && offsets[s] < from) s++;
    let e = text.length;
    while (e > s && offsets[e - 1] >= to) e--;
    for (const [a, b] of spans) {
      if (a < s && s < b) s = a;
      if (a < e && e < b) e = b;
    }
    while (s < e && /\s/.test(text[s])) s++;
    while (e > s && /\s/.test(text[e - 1])) e--;
    if (s >= e) return false;
    if (snapshot.blocks.find((b) => snapshot.anchors[b.id]?.from === pos)?.text !== text) refusal = "This paragraph can't be rewritten here: Folio reads it differently.";
    else if (/[⟦⟧]/.test(text.slice(s, e))) refusal = "This selection holds ⟦ or ⟧, which Rewrite uses itself.";
    else if (doc.rangeHasMark(offsets[s], offsets[e - 1] + 1, insertion) || doc.rangeHasMark(offsets[s], offsets[e - 1] + 1, deletion))
      refusal = "This selection has tracked changes. Accept or reject them first.";
    if (refusal) return false;
    // The objects inside: fields and footnote marks, tabs and line breaks, and what takes no character (a jump in position).
    const objects: [number, number][] = [];
    for (const b of clean.structuralBoundaries) {
      if (b.type === "field" || b.type === "noteReference") {
        if (s <= b.offset && b.offset + b.length <= e) objects.push([b.offset, b.offset + b.length]);
      } else if (s < b.offset && b.offset < e) objects.push([b.offset, b.offset]);
    }
    for (let k = s; k < e; k++) if ((text[k] === "\t" || text[k] === "\n") && !inSpan(k)) objects.push([k, k + 1]);
    for (let k = s + 1; k < e; k++) if (offsets[k] > offsets[k - 1] + 1 && !inSpan(k - 1) && !inSpan(k)) objects.push([k, k]);
    objects.sort((x, y) => x[0] - y[0] || x[1] - y[1]);
    const gaps: { start: number; end: number }[] = [];
    let at = s;
    let paragraph = "";
    for (const [a, b] of objects) {
      gaps.push({ start: at, end: a });
      paragraph += `${text.slice(at, a)}⟦${++n}⟧`;
      at = b;
    }
    gaps.push({ start: at, end: e });
    paragraph += text.slice(at, e);
    blocks.push({ pos, text, gaps });
    paragraphs.push(paragraph);
    return false;
  });
  if (refusal) return refusal;
  if (!blocks.length) return "Select some text to rewrite.";
  return { passage: paragraphs.join("\n\n"), blocks };
}

// The document's objects in order (pictures, fields, footnote marks...), to see that an edit kept them all.
function objectsOf(doc: Node): string {
  const seen: string[] = [];
  doc.descendants((n) => {
    if (n.isInline && !n.isText) seen.push(n.type.name);
    else if (n.isText && n.marks.some((m) => m.type.name === "footnoteRef")) seen.push("footnoteRef");
  });
  return seen.join(" ");
}

/**
 * A checked answer (rewrite.ts) put back as one edit, one undo step: each
 * stretch of words that changed is replaced in place, the objects between
 * them untouched, all at once or not at all. "stale" when a paragraph
 * changed since it was sent; "refused" when the answer doesn't fit the
 * passage or Folio couldn't place it without moving an object.
 */
export function applyDocRewrite(view: { state: EditorState; dispatch: (tr: Transaction) => void }, p: WordPassage, text: string): "applied" | "stale" | "refused" {
  const doc = view.state.doc;
  const paragraphs = text.split("\n\n");
  if (paragraphs.length !== p.blocks.length) return "refused";
  const snapshot = createFolioAIEditSnapshot(doc);
  const operations: FolioAIEditOperation[] = [];
  let n = 0;
  for (let k = 0; k < p.blocks.length; k++) {
    const b = p.blocks[k];
    const block = snapshot.blocks.find((x) => snapshot.anchors[x.id]?.from === b.pos);
    if (!block || block.text !== b.text) return "stale";
    const parts = paragraphs[k].split(PLACEHOLDER).filter((_, i) => i % 2 === 0);
    const marks = [...paragraphs[k].matchAll(PLACEHOLDER)].map((m) => Number(m[1]));
    if (parts.length !== b.gaps.length || marks.some((m) => m !== ++n)) return "refused";
    for (let j = 0; j < b.gaps.length; j++) {
      const { start, end } = b.gaps[j];
      if (parts[j] === b.text.slice(start, end)) continue;
      const range = start < end ? createFolioAITextRangeHandle({ blockId: block.id, text: block.text, startOffset: start, endOffset: end }) : null;
      if (!range || !parts[j]) return "refused";
      operations.push({ id: `rewrite-${operations.length + 1}`, type: "replaceRange", range, replace: parts[j] });
    }
  }
  if (!operations.length) return "refused";
  let held = null as Transaction | null;
  const result = applyFolioDocumentOperations({ view: { state: view.state, dispatch: (tr) => void (held = tr) }, snapshot, batch: { version: 1, mode: "direct", atomic: true, operations } });
  if (result.status !== "committed" || !held) return result.skipped.some((x) => x.reason === "changedBlock" || x.reason === "staleRange") ? "stale" : "refused";
  if (objectsOf(held.doc) !== objectsOf(doc)) return "refused"; // Folio widened an edit over an object
  view.dispatch(held);
  return "applied";
}
