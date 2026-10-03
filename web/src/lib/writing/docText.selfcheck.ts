// Runnable check for docText.ts, on Folio's own document schema and the real
// Harper engine. Run directly: node src/lib/writing/docText.selfcheck.ts
// A Word document's paragraphs are read as prose for the spelling checker:
// tracked changes as if accepted, citation fields left out, footnote marks
// blanked; every mark maps back to the document's own positions, and never
// into a field or a footnote mark.
import assert from "node:assert/strict";
import { schema } from "@stll/folio-core/prosemirror/schema";
import { LocalLinter } from "harper.js";
import { binaryInlined } from "harper.js/binaryInlined";
import { checkProse } from "./grammar.ts";
import { docProse, docRange, fixWord } from "./docText.ts";
import { EditorState } from "prosemirror-state";
import { DEFAULT_SPELLING } from "./spelling.ts";

const t = (text: string, marks: ReturnType<typeof schema.mark>[] = []) => schema.text(text, marks);
const citation = schema.nodes.field.create({ fieldType: "UNKNOWN", fieldKind: "complex", instruction: " ADDIN ZOTERO_ITEM CSL_CITATION ", displayText: "(Smiht, 2019)" });
const footnote = schema.marks.footnoteRef.create({ id: "1", noteType: "footnote" });
const deleted = schema.marks.deletion.create({ revisionId: 7, author: "Coauthor", date: "2026-09-02T10:00:00Z" });
const doc = schema.nodes.doc.create(null, [
  schema.nodes.paragraph.create(null, [t("Adults wre enrolled "), citation, t(" and folowed"), t("1", [footnote]), t(" for ninety days.")]),
  schema.nodes.paragraph.create(null, [t("Readmission was "), t("rarre ", [deleted]), t("uncommon in the second paragrph.")]),
]);

const prose = docProse(doc);
assert.equal(prose.prose.length, prose.source.length, "the blanked copy keeps every place");
assert.ok(!prose.prose.includes("Smiht"), "a citation field's text isn't read");
assert.ok(!prose.prose.includes("[^1]"), "a footnote mark isn't read");
assert.ok(!prose.source.includes("rarre"), "deleted text (a tracked change) isn't read");

const linter = new LocalLinter({ binary: binaryInlined });
const issues = await checkProse(linter, prose.prose, prose.source, DEFAULT_SPELLING);
const words = issues.map((i) => prose.source.slice(i.from, i.to));
assert.deepEqual(words, ["wre", "folowed", "paragrph"]);
// each maps to the same text in the document
for (const i of issues) {
  const at = docRange(prose, i.from, i.to);
  assert.ok(at, `"${prose.source.slice(i.from, i.to)}" maps back`);
  assert.equal(doc.textBetween(at.from, at.to), prose.source.slice(i.from, i.to));
}
// no range across paragraphs, or into a footnote mark
const second = prose.source.indexOf("Readmission");
assert.equal(docRange(prose, second - 5, second + 3), null, "across a paragraph break: no range");
const mark = prose.source.indexOf("[^1]");
assert.equal(docRange(prose, mark + 1, mark + 3), null, "inside a footnote mark: no range");
const inCitation = prose.source.indexOf("(Smiht, 2019)") + 7;
assert.equal(prose.source[inCitation], " ");
assert.equal(docRange(prose, inCitation, inCitation + 1), null, "nor one character of a citation's text");

// --- a fix changes the word and nothing next to it (an object right after a
// word takes no character of its own, so the mark mustn't grow over it), and
// keeps a coauthor's comment, a link or a tracked insertion on the word
const comment = schema.marks.comment.create({ commentId: 4 });
const link = schema.marks.hyperlink.create({ href: "https://x.org" });
const N = schema.nodes;
const near = schema.nodes.doc.create(null, [
  schema.nodes.paragraph.create(null, [
    t("It was studyed"), N.commentReference.create({ commentId: 3 }), t(" here, then "), t("misspeled", [comment]), t(" and "), t("recieved", [link]),
    t(" and folowed"), N.image.create({ src: "x", width: 9, height: 9 }), t(" and wrot"), N.math.create({ display: false, ommlXml: "<m:oMath/>", plainText: "x" }),
    t(" and bookd"), N.bookmarkBoundary.create({ type: "start", id: "1", name: "_Ref1" }), t(" end."),
  ]),
]);
const objectsOf = (d: typeof near) => { const o: string[] = []; d.descendants((n) => void (n.isInline && !n.isText && o.push(n.type.name))); return o; };
const nearProse = docProse(near);
const nearIssues = await checkProse(linter, nearProse.prose, nearProse.source, DEFAULT_SPELLING);
const marked = new Map(nearIssues.map((i) => [nearProse.source.slice(i.from, i.to), docRange(nearProse, i.from, i.to)]));
for (const word of ["studyed", "misspeled", "recieved", "folowed", "wrot", "bookd"]) {
  const at = marked.get(word);
  assert.ok(at, `"${word}" is marked`);
  assert.equal(at.to - at.from, word.length, `"${word}": the mark covers the word and nothing after it`);
}
const fixes: [string, string][] = [["studyed", "studied"], ["misspeled", "misspelled"], ["recieved", "received"], ["folowed", "followed"], ["wrot", "wrote"], ["bookd", "booked"]];
let state = EditorState.create({ schema, doc: near });
for (const [word, fix] of fixes) {
  const at = docRange(docProse(state.doc), ...((): [number, number] => { const p = docProse(state.doc); const i = p.source.indexOf(word); return [i, i + word.length]; })())!;
  const tr = fixWord(state, { ...at, word }, fix);
  assert.ok(tr, `"${word}" fixed`);
  state = state.apply(tr);
}
assert.equal(state.doc.textContent, "It was studied here, then misspelled and received and followed and wrote and booked end.");
assert.deepEqual(objectsOf(state.doc), objectsOf(near), "the comment, picture, equation and bookmark are all still there");
const marksOn = (word: string) => { let found: string[] = []; state.doc.descendants((n) => void (n.isText && n.text!.includes(word) && (found = n.marks.map((m) => m.type.name)))); return found; };
assert.ok(marksOn("misspelled").includes("comment"), "the comment stays on the fixed word");
assert.ok(marksOn("received").includes("hyperlink"), "and the link");
assert.equal(fixWord(state, { from: 1, to: 4, word: "Its" }, "It's"), null, "text that changed since it was marked isn't touched");

// --- a citation followed by a comma isn't a "space before a comma"; a
// citation held in a content control isn't read as prose
const cited = schema.nodes.doc.create(null, [
  schema.nodes.paragraph.create(null, [t("Sleep was short after surgery "), citation, t(", and recovered.")]),
  schema.nodes.paragraph.create(null, [t("As reported by "), N.sdt.create({ sdtType: "richText", tag: "CITATION" }, [t("Smiht and Jnes 2019")]), t(".")]),
]);
const citedProse = docProse(cited);
assert.deepEqual(await checkProse(linter, citedProse.prose, citedProse.source, DEFAULT_SPELLING), [], "no mark around a citation");

console.log("docText.selfcheck: OK");
