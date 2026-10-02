// Word documents for the /write smokes, made here rather than committed: a
// short paper with what a journal template has (heading styles, a header and
// footer, a table, a numbered reference list), and the same document as a
// template (.dotx), with macros (.docm), and in Word's old binary format.
// Never anyone's real paper.
import {
  AlignmentType,
  Bookmark,
  CommentRangeEnd,
  CommentRangeStart,
  CommentReference,
  DeletedTextRun,
  Document,
  ExternalHyperlink,
  Footer,
  FootnoteReferenceRun,
  Header,
  HeadingLevel,
  ImageRun,
  InsertedTextRun,
  LevelFormat,
  LineNumberRestartFormat,
  Math as OMath,
  MathFraction,
  MathRun,
  Packer,
  PageNumber,
  PageReference,
  Paragraph,
  SectionType,
  SequentialIdentifier,
  Table,
  TableCell,
  TableRow,
  TextRun,
} from "docx";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { deflateSync } from "node:zlib";

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

// A small solid square, as a real PNG (signature, IHDR, IDAT, IEND), for
// pictures in the body and the header.
function squarePng(size = 32, rgb = [200, 60, 40]) {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const out = Buffer.alloc(12 + data.length);
    out.writeUInt32BE(data.length, 0);
    out.write(type, 4, "ascii");
    data.copy(out, 8);
    out.writeUInt32BE(crc(out.subarray(4, 8 + data.length)), 8 + data.length);
    return out;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr.set([8, 2, 0, 0, 0], 8); // 8-bit RGB
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: size }, () => rgb).flat())]);
  return new Uint8Array(Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(Buffer.concat(Array.from({ length: size }, () => row)))), chunk("IEND", Buffer.alloc(0))]));
}
const PNG = squarePng();

// Everything a real paper may carry that an editor must not lose: citation
// manager fields (Zotero, Mendeley: complex fields, injected as Word writes
// them), figure numbering (SEQ), a cross-reference (REF), two tables of
// contents (as Word writes one: each field part in its own run, filled in;
// and as pandoc's --toc writes one: all four parts in one run, to be filled
// in by Word),
// page numbers, a content control (injected), line numbering, tracked changes,
// a footnote, a comment, an equation, a picture in the body and in the
// header, a link, a two-column section, a numbered reference list, and a
// citation manager's document variable.
export async function kitchenSinkDocx() {
  const p = (...children) => new Paragraph({ alignment: AlignmentType.JUSTIFIED, children });
  const t = (text) => new TextRun(text);
  const doc = new Document({
    features: { updateFields: true, trackRevisions: false },
    comments: { children: [{ id: 0, author: "Reviewer", date: new Date("2026-09-01"), children: [new Paragraph("Please cite the trial registry here.")] }] },
    footnotes: { 1: { children: [new Paragraph("Registered at ClinicalTrials.gov, NCT00000000.")] } },
    numbering: { config: [{ reference: "vancouver", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.START }] }] },
    sections: [
      {
        properties: { lineNumbers: { countBy: 1, restart: LineNumberRestartFormat.CONTINUOUS } },
        headers: { default: new Header({ children: [new Paragraph({ children: [new ImageRun({ type: "png", data: PNG, transformation: { width: 24, height: 24 } }), t(" Kitchen Sink Journal")] })] }) },
        footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [t("Page "), new TextRun({ children: [PageNumber.CURRENT] }), t(" of "), new TextRun({ children: [PageNumber.TOTAL_PAGES] })] })] }) },
        children: [
          new Paragraph({ heading: HeadingLevel.TITLE, text: "Everything a manuscript carries" }),
          p(t("PANDOC_TOC_HERE")),
          p(t("WORD_TOC_HERE")),
          new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new Bookmark({ id: "methods", children: [t("Methods")] })] }),
          p(t("Adults recovering from surgery were enrolled"), new FootnoteReferenceRun(1), t(" and followed for ninety days. ZOTERO_HERE")),
          p(new CommentRangeStart(0), t("The protocol was approved by the ethics committee."), new CommentRangeEnd(0), new TextRun({ children: [new CommentReference(0)] })),
          p(t("Readmission was "), new DeletedTextRun({ text: "rare", id: 1, author: "Coauthor", date: "2026-09-02T10:00:00Z" }), new InsertedTextRun({ text: "uncommon", id: 2, author: "Coauthor", date: "2026-09-02T10:00:00Z" }), t(" in the reference group.")),
          p(t("The hazard was estimated as "), new OMath({ children: [new MathRun("h = "), new MathFraction({ numerator: [new MathRun("events")], denominator: [new MathRun("person-years")] })] }), t(".")),
          p(t("SDT_HERE")),
          p(new ImageRun({ type: "png", data: PNG, transformation: { width: 120, height: 120 } })),
          p(t("Figure "), new TextRun({ children: [new SequentialIdentifier("Figure")] }), t(". Readmission by sleep duration. MENDELEY_HERE")),
          p(t("As described in Methods (page "), new PageReference("methods"), t("), see the registry at "), new ExternalHyperlink({ link: "https://clinicaltrials.gov", children: [new TextRun({ text: "clinicaltrials.gov", style: "Hyperlink" })] }), t(".")),
        ],
      },
      {
        properties: { type: SectionType.CONTINUOUS, column: { count: 2, space: 708 } },
        children: [
          new Paragraph({ heading: HeadingLevel.HEADING_1, text: "References" }),
          ...["Smith J. Sleep after surgery. Heart. 2019;105:1-8.", "Lee K. Actigraphy in recovery. Sleep. 2021;44:2-9.", "Patel R. Readmission after cardiac surgery. JAMA. 2020;323:10-17."].map(
            (text) => new Paragraph({ numbering: { reference: "vancouver", level: 0 }, children: [t(text)] }),
          ),
        ],
      },
    ],
  });
  const bytes = new Uint8Array(await Packer.toBuffer(doc));
  // What the library can't write, written as Word and the citation managers do.
  const field = (instr, shown) =>
    `<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve">${instr}</w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>${shown}</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r>`;
  const parts = unzipSync(bytes);
  let xml = strFromU8(parts["word/document.xml"]);
  const swap = (marker, replacement) => {
    const re = new RegExp(`<w:r>(?:(?!<w:r>).)*?<w:t[^>]*>([^<]*)${marker}</w:t></w:r>`, "s");
    if (!re.test(xml)) throw new Error(`fixture marker ${marker} not found`);
    xml = xml.replace(re, (_, before) => `<w:r><w:t xml:space="preserve">${before}</w:t></w:r>${replacement}`);
  };
  swap("ZOTERO_HERE", field(' ADDIN ZOTERO_ITEM CSL_CITATION {"citationID":"k1","citationItems":[{"id":1,"uris":["http://zotero.org/users/1/items/AB12"]}]} ', "(Smith, 2019)"));
  swap("MENDELEY_HERE", field(' ADDIN CSL_CITATION {"citationItems":[{"id":"ITEM-1"}],"mendeley":{"formattedCitation":"[2]"}} ', "[2]"));
  const wordToc = /<w:p>(?:(?!<w:p>).)*?WORD_TOC_HERE(?:(?!<\/w:p>).)*<\/w:p>/s;
  if (!wordToc.test(xml)) throw new Error("fixture marker WORD_TOC_HERE not found");
  xml = xml.replace(
    wordToc,
    '<w:sdt><w:sdtPr><w:docPartObj><w:docPartGallery w:val="Table of Contents"/><w:docPartUnique/></w:docPartObj></w:sdtPr><w:sdtContent>' +
      '<w:p><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> TOC \\o "1-2" \\h \\z \\u </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r>' +
      '<w:hyperlink w:anchor="methods" w:history="1"><w:r><w:t>Methods</w:t></w:r><w:r><w:tab/></w:r><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> PAGEREF methods \\h </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>1</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:hyperlink></w:p>' +
      '<w:p><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p></w:sdtContent></w:sdt>',
  );
  const pandocToc = /<w:p>(?:(?!<w:p>).)*?PANDOC_TOC_HERE(?:(?!<\/w:p>).)*<\/w:p>/s;
  if (!pandocToc.test(xml)) throw new Error("fixture marker PANDOC_TOC_HERE not found");
  xml = xml.replace(
    pandocToc,
    '<w:sdt><w:sdtPr><w:docPartObj><w:docPartGallery w:val="Table of Contents"/><w:docPartUnique/></w:docPartObj></w:sdtPr><w:sdtContent>' +
      '<w:p><w:r><w:t xml:space="preserve">Table of Contents</w:t></w:r></w:p>' +
      '<w:p><w:r><w:fldChar w:fldCharType="begin" w:dirty="true"/><w:instrText xml:space="preserve">TOC \\o "1-3" \\h \\z \\u</w:instrText><w:fldChar w:fldCharType="separate"/><w:fldChar w:fldCharType="end"/></w:r></w:p></w:sdtContent></w:sdt>',
  );
  const sdtPara = /<w:p>(?:(?!<w:p>).)*?SDT_HERE(?:(?!<\/w:p>).)*<\/w:p>/s;
  if (!sdtPara.test(xml)) throw new Error("fixture marker SDT_HERE not found");
  xml = xml.replace(
    sdtPara,
    '<w:sdt><w:sdtPr><w:alias w:val="Structured abstract"/><w:tag w:val="abstract"/><w:id w:val="4242"/></w:sdtPr><w:sdtContent><w:p><w:r><w:t>Text inside a content control, as journal templates use for the abstract.</w:t></w:r></w:p></w:sdtContent></w:sdt>',
  );
  parts["word/document.xml"] = strToU8(xml);
  // Zotero keeps its settings for a document (the citation style) in a document variable.
  const settings = strFromU8(parts["word/settings.xml"]);
  if (!settings.includes("</w:compat>")) throw new Error("fixture: settings.xml has no compat element");
  parts["word/settings.xml"] = strToU8(settings.replace("</w:compat>", '</w:compat><w:docVars><w:docVar w:name="ZOTERO_PREF_1" w:val="&lt;data data-version=&quot;3&quot;&gt;&lt;style id=&quot;http://www.zotero.org/styles/vancouver&quot;/&gt;&lt;/data&gt;"/></w:docVars>'));
  return zipSync(parts);
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
