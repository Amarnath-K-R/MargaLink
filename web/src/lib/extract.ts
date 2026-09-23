// Extracts title + abstract text from an uploaded paper, entirely in the browser.
// Nothing here ever sends the file or its text anywhere — see match.ts and the
// privacy-page claim this whole module exists to keep true.

import { linesFromTextItems, pickDocxHeadings, pickPdfHeadings, type LineFontInfo } from "./headingHints.ts";
import type { HeadingHint } from "./reviewTypes.ts";

export type ExtractedPaper = {
  text: string; // best-effort title + abstract, used as the embedding input
  fullText: string; // the whole document, for the format check
  headings?: HeadingHint[]; // the document's own heading structure, when asked for (review only)
};

// `headings` costs an extra font pass (~0.2 s for a typical PDF), so only the
// review asks for it.
export async function extractFromFile(file: File, opts: { headings?: boolean } = {}): Promise<ExtractedPaper> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".pdf")) return extractFromPdf(file, opts.headings ?? false);
  if (name.endsWith(".docx")) return extractFromDocx(file, opts.headings ?? false);
  throw new Error("Unsupported file type. Upload a .pdf or .docx.");
}

async function extractFromPdf(file: File, withHeadings: boolean): Promise<ExtractedPaper> {
  const pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url
  ).toString();

  const buf = await file.arrayBuffer();
  const doc = await pdfjsLib.getDocument({ data: buf }).promise;

  const pageTexts: string[] = [];
  const fontLines: LineFontInfo[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    // Loads the page's fonts so their real names ("GillSans-Bold") are known.
    if (withHeadings) await page.getOperatorList();
    const content = await page.getTextContent();
    if (withHeadings) {
      const realFont = (id: string) => {
        try {
          return (page.commonObjs.get(id) as { name?: string } | undefined)?.name ?? id;
        } catch {
          return id;
        }
      };
      fontLines.push(...linesFromTextItems(content.items.filter((it) => "str" in it) as Parameters<typeof linesFromTextItems>[0], realFont));
    }
    // Join items with a plain space, but insert a real newline wherever
    // pdf.js marks a line ending (hasEOL) — without this, "Abstract" on its
    // own line collapses into running prose and no heading regex can find
    // it (caught by a real end-to-end PDF, not just the sample-text tests).
    let pageText = "";
    for (const item of content.items) {
      if (!("str" in item)) continue;
      pageText += item.str + (item.hasEOL ? "\n" : " ");
    }
    pageTexts.push(pageText);
  }
  const fullText = pageTexts.join("\n\n").replace(/[ \t]+/g, " ").trim();

  // Title + abstract live on page 1 for the overwhelming majority of papers —
  // that's all the embedding needs (see plan §3.2). The format check below
  // uses the full text.
  return { text: fullText.slice(0, 3000), fullText, headings: withHeadings ? pickPdfHeadings(fontLines) : undefined };
}

async function extractFromDocx(file: File, withHeadings: boolean): Promise<ExtractedPaper> {
  const mammoth = await import("mammoth");
  const buf = await file.arrayBuffer();
  const { value } = await mammoth.extractRawText({ arrayBuffer: buf });
  const fullText = value.replace(/[ \t]+/g, " ").trim();
  // Word's own heading styles — exact where the author used them.
  const headings = withHeadings ? pickDocxHeadings((await mammoth.convertToHtml({ arrayBuffer: buf })).value) : undefined;
  // ponytail: first-3000-chars-of-whole-document, not "find the Abstract
  // heading" — a doc with a long title page/author block/TOC before the
  // abstract could get truncated before the abstract even starts. Works for
  // the common case (abstract near the top); upgrade to heading detection if
  // match quality on real uploads shows this biting.
  return { text: fullText.slice(0, 3000), fullText, headings };
}

// No unit test here — nothing pure to check without a browser + a real file.
// Covered by the manual Phase 2 gate: upload a real PDF, confirm sane text
// comes back, confirm devtools shows no network call carrying it.
