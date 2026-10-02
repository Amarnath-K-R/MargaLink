// Word documents for the /write smokes, made here rather than committed: a
// short paper with what a journal template has (heading styles, a header and
// footer, a table, a numbered reference list), and the same document as a
// template (.dotx), with macros (.docm), and in Word's old binary format.
// Never anyone's real paper.
import { AlignmentType, Document, Footer, Header, HeadingLevel, LevelFormat, Packer, Paragraph, Table, TableCell, TableRow, TextRun } from "docx";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

export const TEXT = {
  title: "Sleep duration and recovery after cardiac surgery",
  intro: "Short sleep after cardiac surgery is common and is linked to slower recovery in several small cohorts.",
  methods: "We followed 412 adults for ninety days after elective surgery and recorded sleep with wrist actigraphy.",
  results: "Patients who slept less than five hours a night were readmitted more often within thirty days.",
  header: "Journal of Smoke Tests",
  footer: "Manuscript for review",
};

export async function paperDocx() {
  const p = (text) => new Paragraph({ alignment: AlignmentType.JUSTIFIED, children: [new TextRun(text)] });
  const cell = (text) => new TableCell({ children: [new Paragraph(text)] });
  const doc = new Document({
    numbering: { config: [{ reference: "refs", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.START }] }] },
    sections: [
      {
        headers: { default: new Header({ children: [new Paragraph(TEXT.header)] }) },
        footers: { default: new Footer({ children: [new Paragraph(TEXT.footer)] }) },
        children: [
          new Paragraph({ heading: HeadingLevel.TITLE, text: TEXT.title }),
          new Paragraph({ heading: HeadingLevel.HEADING_1, text: "Introduction" }),
          p(TEXT.intro),
          new Paragraph({ heading: HeadingLevel.HEADING_1, text: "Methods" }),
          p(TEXT.methods),
          new Paragraph({ heading: HeadingLevel.HEADING_2, text: "Statistical analysis" }),
          p("Hazard ratios were estimated with Cox regression adjusted for age and sex."),
          new Paragraph({ heading: HeadingLevel.HEADING_1, text: "Results" }),
          p(TEXT.results),
          new Table({ rows: [new TableRow({ children: [cell("Group"), cell("Readmitted")] }), new TableRow({ children: [cell("Under five hours"), cell("31 of 118")] })] }),
          new Paragraph({ heading: HeadingLevel.HEADING_1, text: "References" }),
          ...["Smith J. Sleep after surgery. Heart. 2019;105:1-8.", "Lee K. Actigraphy in recovery. Sleep. 2021;44:2-9."].map(
            (t) => new Paragraph({ numbering: { reference: "refs", level: 0 }, children: [new TextRun(t)] }),
          ),
        ],
      },
    ],
  });
  return new Uint8Array(await Packer.toBuffer(doc));
}

// The document's main part declared as something else: a template, or a macro-enabled document.
const withMainType = (bytes, type) => {
  const parts = unzipSync(bytes);
  const types = strFromU8(parts["[Content_Types].xml"]);
  parts["[Content_Types].xml"] = strToU8(types.replace(/application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document\.main\+xml/, type));
  return zipSync(parts);
};
export const asTemplate = (bytes) => withMainType(bytes, "application/vnd.openxmlformats-officedocument.wordprocessingml.template.main+xml");
export const asMacroDocument = (bytes) => withMainType(bytes, "application/vnd.ms-word.document.macroEnabled.main+xml");
// The first bytes of an OLE compound file: Word 97-2003 (.doc), or a password-protected .docx.
export const oldWordDoc = () => new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, ...new Array(504).fill(0)]);

// A part of a .docx, as text.
export const part = (bytes, path) => {
  const parts = unzipSync(bytes);
  return parts[path] ? strFromU8(parts[path]) : null;
};
// All of a document's text, in order.
export const docText = (bytes) => [...(part(bytes, "word/document.xml") ?? "").matchAll(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>/g)].map((m) => m[1]).join("");
