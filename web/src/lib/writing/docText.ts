// A Word document (Folio's ProseMirror document) read as prose for the
// spelling checker, and the checker's marks mapped back to the document.
// Pure; docText.selfcheck.ts runs it on Folio's own schema.
import { buildCleanBlockText, type CleanBlockText } from "@stll/folio-core/ai-edits/clean-text";
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
