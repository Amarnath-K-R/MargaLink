// Runnable check for extract.ts's Word text. Run directly: node src/lib/paper/extract.selfcheck.ts
// Word numbers its lists itself, so the numbers aren't in the document's
// text; the extracted text carries them, as a PDF of the same paper would,
// or an auto-numbered reference list counts as no references. (mammoth's
// Node build reads `buffer`, the browser's `arrayBuffer`: this drives
// docxText the way extractFromDocx does; the Word smoke covers the rest.)
import assert from "node:assert/strict";
import { AlignmentType, Document, LevelFormat, Packer, Paragraph } from "docx";
import mammoth from "mammoth";
import { docxText } from "./extract.ts";
import { checkFormat } from "../checks/formatCheck.ts";

const refs = ["Smith J. Sleep after surgery. Heart. 2019;105:1-8.", "Lee K. Actigraphy in recovery. Sleep. 2021;44:2-9.", "Roe B. Readmission. Thorax. 2020;75:3-4."];
async function docx(children: Paragraph[]) {
  const doc = new Document({
    numbering: {
      config: [
        { reference: "refs", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.START }] },
        { reference: "dots", levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.START }] },
      ],
    },
    sections: [{ children }],
  });
  return Packer.toBuffer(doc);
}
async function textOf(buffer: Buffer) {
  let text = "";
  await mammoth.convertToHtml({ buffer }, { transformDocument: (d) => ((text = docxText(d)), d) });
  return text;
}
const body = [new Paragraph("Sleep and recovery after cardiac surgery"), new Paragraph("We followed 412 adults for ninety days.\tActigraphy was worn nightly.")];

// An auto-numbered (Vancouver) reference list: numbered as Word shows it, and counted.
const numbered = await textOf(
  await docx([...body, new Paragraph("Points to note"), new Paragraph({ numbering: { reference: "dots", level: 0 }, text: "Short sleep is common." }), new Paragraph("References"), ...refs.map((t) => new Paragraph({ numbering: { reference: "refs", level: 0 }, text: t }))]),
);
assert.match(numbered, /^1\. Smith J\. Sleep after surgery/m);
assert.match(numbered, /^3\. Roe B\. Readmission/m);
assert.equal(checkFormat(numbered).referenceCount, 3);
// a bullet list gets no number
assert.match(numbered, /^Short sleep is common\.$/m);

// A document without lists reads exactly as mammoth's own raw text.
const plain = await docx(body);
assert.equal(await textOf(plain), (await mammoth.extractRawText({ buffer: plain })).value);

console.log("extract.selfcheck: OK");
