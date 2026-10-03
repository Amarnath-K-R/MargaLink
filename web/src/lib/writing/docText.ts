// A Word document (Folio's ProseMirror document) read as prose for the
// spelling checker, and the checker's marks mapped back to the document.
// Pure; docText.selfcheck.ts runs it on Folio's own schema.
import { buildCleanBlockText, resolveCleanTextRange, type CleanBlockText } from "@stll/folio-core/ai-edits/clean-text";
import type { Node } from "prosemirror-model";

export type DocProse = {
  source: string; // every paragraph's text (tracked changes as if accepted), each followed by a blank line
  prose: string; // the same, with footnote marks blanked: what the checker reads
  blocks: { at: number; clean: CleanBlockText }[]; // where each paragraph starts in `source`
};

/**
 * Every paragraph of the document (table cells included) as Folio's AI
 * features read it: tracked changes as if accepted, citation and other
 * field results left out, a footnote reference as its marker, which is
 * blanked in `prose` so it's never marked.
 */
export function docProse(doc: Node): DocProse {
  const blocks: DocProse["blocks"] = [];
  let source = "";
  let prose = "";
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    const clean = buildCleanBlockText(node, pos, { fieldResults: "omitted" });
    let blanked = clean.text;
    for (const b of clean.structuralBoundaries) if (b.type === "noteReference") blanked = blanked.slice(0, b.offset) + " ".repeat(b.length) + blanked.slice(b.offset + b.length);
    blocks.push({ at: source.length, clean });
    source += `${clean.text}\n\n`;
    prose += `${blanked}\n\n`;
    return false;
  });
  return { source, prose, blocks };
}

/** Where `source[from, to)` is in the document; null across paragraphs or into a field or a footnote mark. */
export function docRange(p: DocProse, from: number, to: number): { from: number; to: number } | null {
  let block: DocProse["blocks"][number] | undefined;
  for (const b of p.blocks) {
    if (b.at > from) break;
    block = b;
  }
  if (!block || to > block.at + block.clean.text.length || to <= from) return null;
  return resolveCleanTextRange({ cleanBlock: block.clean, startOffset: from - block.at, endOffset: to - block.at });
}
