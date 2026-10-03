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
import { applyDocRewrite, docPassage, docProse, docRange, fixWord, passageFresh, type WordPassage } from "./docText.ts";
import { EditorState, type Transaction } from "prosemirror-state";
import type { Node } from "prosemirror-model";
import { buildCleanBlockText } from "@stll/folio-core/ai-edits/clean-text";
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

// --- Rewrite's passage in a Word document: every object that isn't prose
// travels as a numbered placeholder and stays where it is; only the words
// between objects are replaced, all at once or not at all.
const P = (n: number) => `⟦${n}⟧`;
const bold = schema.marks.bold.create();
const fn = (id: string) => t("1", [schema.marks.footnoteRef.create({ id, noteType: "footnote" })]);
const paper = () =>
  N.doc.create(null, [
    N.paragraph.create(null, [t("Adults wre enrolled "), citation, t(" and followed"), fn("1"), t(" for ninety days.")]),
    N.paragraph.create(null, [
      t("Sleep was "), t("short", [bold]), t(" after "), N.math.create({ display: false, ommlXml: "<m:oMath/>", plainText: "x" }), t(" surgery"),
      N.tab.create(), t("in older"), N.hardBreak.create(), t("adults "), N.image.create({ src: "x", width: 9, height: 9 }), t(" overall"),
      N.bookmarkBoundary.create({ type: "start", id: "1", name: "_Ref1" }), t(" too."),
    ]),
    N.paragraph.create(),
    N.paragraph.create(null, [t("Readmission was "), t("rarre ", [deleted]), t("uncommon.")]),
    N.paragraph.create(null, [t("A bracket ⟦ here.")]),
  ]);
// The editor, as Folio's apply code sees it: a state and a dispatch.
const editor = (doc: Node) => {
  const view = { state: EditorState.create({ schema, doc }), dispatched: 0, dispatch(tr: Transaction) { view.dispatched++; view.state = view.state.apply(tr); } };
  return view;
};
const objects = (doc: Node) => {
  const seen: string[] = [];
  doc.descendants((n) => void (n.isInline && (!n.isText ? seen.push(n.type.name) : n.marks.some((m) => m.type.name === "footnoteRef") && seen.push("footnoteRef"))));
  return seen;
};
const inner = (doc: Node, i: number) => { let at = 0; doc.forEach((n, off, idx) => void (idx === i && (at = off))); return { from: at + 1, to: at + doc.child(i).nodeSize - 1 }; };
const passageOf = (doc: Node, from: number, to: number) => {
  const p = docPassage(doc, from, to);
  assert.ok(typeof p !== "string", `a passage: ${p}`);
  return p as WordPassage;
};

const before = paper();
const whole = passageOf(before, inner(before, 0).from, inner(before, 1).to);
assert.equal(
  whole.passage,
  `Adults wre enrolled ${P(1)} and followed${P(2)} for ninety days.\n\nSleep was short after ${P(3)} surgery${P(4)}in older${P(5)}adults ${P(6)} overall${P(7)} too.`,
  "fields, footnote marks, maths, tabs, line breaks, pictures and bookmarks are placeholders",
);
assert.deepEqual(whole.objects, ["(Smiht, 2019)", "[^1]", "", "\t", "\n", "", ""], "each placeholder's text, for showing the rewrite");
// a partial selection; one starting inside a citation takes the whole citation
const mid = passageOf(before, inner(before, 0).from + "Adults wre ".length, inner(before, 1).from + "Sleep was short".length);
assert.equal(mid.passage, `enrolled ${P(1)} and followed${P(2)} for ninety days.\n\nSleep was short`);
const cite = inner(before, 0).from + "Adults wre enrolled ".length;
assert.equal(passageOf(before, cite, inner(before, 0).to).passage, `${P(1)} and followed${P(2)} for ninety days.`);
// a blank paragraph in the selection isn't a paragraph of the passage
assert.equal(passageOf(before, inner(before, 1).from, inner(before, 2).to).passage.split("\n\n").length, 1);

// refused: tracked changes, Rewrite's own brackets, nothing to rewrite
assert.equal(typeof docPassage(before, inner(before, 3).from, inner(before, 3).to), "string", "a tracked change in the selection");
assert.equal(typeof docPassage(before, inner(before, 4).from, inner(before, 4).to), "string", "⟦ in the selection");
assert.equal(typeof docPassage(before, inner(before, 2).from, inner(before, 2).to), "string", "only a blank paragraph");

// applied: the words change, every object stays, in its place, in one step
const answer = `Adults were enrolled ${P(1)} and then followed${P(2)} for ninety days.\n\nSleep was brief after ${P(3)} surgery${P(4)}in elderly${P(5)}people ${P(6)} in all${P(7)} as well.`;
const ed = editor(before);
assert.equal(applyDocRewrite(ed, whole, answer), "applied");
assert.equal(ed.dispatched, 1, "one transaction: one undo step");
assert.deepEqual(objects(ed.state.doc), objects(before), "every object kept, in order");
assert.equal(ed.state.doc.child(0).textContent, "Adults were enrolled (Smiht, 2019) and then followed1 for ninety days.", "a field reads as its text");
let field = null as Node | null;
ed.state.doc.descendants((n) => void (n.type.name === "field" && (field = n)));
assert.equal(field!.attrs.displayText, "(Smiht, 2019)", "the citation is still a citation");
const secondText = buildCleanBlockText(ed.state.doc.child(1), inner(ed.state.doc, 1).from - 1, { fieldResults: "text" }).text;
assert.equal(secondText, "Sleep was brief after  surgery\tin elderly\npeople  in all as well.");

// stale: the passage changed since it was sent; nothing is applied
const edited = editor(before);
edited.dispatch(edited.state.tr.insertText("X", inner(before, 0).from));
const was = edited.state.doc;
assert.equal(passageFresh(edited.state.doc, whole), false, "known to be stale before Replace or Try again");
assert.equal(passageFresh(before, whole), true);
assert.equal(applyDocRewrite(edited, whole, answer), "stale");
assert.equal(edited.state.doc, was, "the document is as it was");
// what real Word documents hold: a one-character citation (Vancouver's superscript), a field holding
// more than text, a content control (where Mendeley keeps citations) are objects, whole; the marks
// Word regenerates itself (spelling marks, rendered page breaks, _GoBack) aren't placeholders at all
const real = () =>
  N.doc.create(null, [
    N.paragraph.create(null, [t("An earlier paragraph.")]),
    N.paragraph.create(null, [
      t("Sleep was short after "), N.preservedXml.create({ xml: '<w:proofErr w:type="spellStart"/>', text: "", level: "inline" }), t("surgery"),
      N.field.create({ fieldType: "UNKNOWN", fieldKind: "complex", instruction: " ADDIN ZOTERO_ITEM ", displayText: "2" }), t(" in older "), N.renderedPageBreak.create(),
      t("adults, as shown "), N.structuredField.create({ fieldType: "UNKNOWN", fieldKind: "complex", instruction: " ADDIN ZOTERO_ITEM ", displayText: "(Smith, 2019)" }, [t("(Smith, 2019)")]),
      t(" and "), N.sdt.create({ sdtType: "richText", tag: "MENDELEY" }, [t("(Lee et al., 2020)")]), t(" in "), N.bookmarkBoundary.create({ type: "start", id: "0", name: "_GoBack" }), t("all."),
    ]),
  ]);
const realDoc = real();
const rp = passageOf(realDoc, inner(realDoc, 1).from, inner(realDoc, 1).to);
assert.equal(rp.passage, `Sleep was short after surgery${P(1)} in older adults, as shown ${P(2)} and ${P(3)} in all.`, "objects whole, Word's own marks left out");
assert.deepEqual(rp.objects, ["2", "(Smith, 2019)", "(Lee et al., 2020)"], "and none of their text is sent");
const realEd = editor(realDoc);
// typed in an earlier paragraph while Claude worked: the passage is found where it now is
realEd.dispatch(realEd.state.tr.insertText("Very ", inner(realDoc, 0).from));
assert.equal(applyDocRewrite(realEd, rp, `Sleep seemed brief after surgery${P(1)} in older adults, as shown ${P(2)} and ${P(3)} in all.`), "applied", "an edit elsewhere isn't a change to the passage");
const fieldsOf = (d: Node) => { const f: string[] = []; d.descendants((n) => void (["field", "structuredField", "sdt"].includes(n.type.name) && f.push(JSON.stringify(n.toJSON())))); return f; };
assert.deepEqual(fieldsOf(realEd.state.doc), fieldsOf(realDoc), "every citation exactly as it was");
const kept = (d: Node) => { const k: string[] = []; d.descendants((n) => void (["preservedXml", "renderedPageBreak", "bookmarkBoundary"].includes(n.type.name) && k.push(n.type.name))); return k.sort(); };
assert.deepEqual(kept(realEd.state.doc), kept(realDoc), "Word's own marks are kept too");
assert.ok(realEd.state.doc.textContent.includes("Sleep seemed brief after surgery2 in older adults"));

// an answer that doesn't fit the passage's shape isn't applied either
assert.equal(applyDocRewrite(editor(before), whole, answer.replace(`${P(6)} `, "")), "refused");

console.log("docText.selfcheck: OK");
