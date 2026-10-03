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
import { docProse, docRange } from "./docText.ts";
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

console.log("docText.selfcheck: OK");
