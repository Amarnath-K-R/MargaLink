// Extracts title + abstract text from an uploaded paper, entirely in the browser.
// Nothing here ever sends the file or its text anywhere — see match.ts and the
// privacy-page claim this whole module exists to keep true.

export type ExtractedPaper = {
  text: string; // best-effort title + abstract, used as the embedding input
  fullText: string; // the whole document, for the format check
};

export async function extractFromFile(file: File): Promise<ExtractedPaper> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".pdf")) return extractFromPdf(file);
  if (name.endsWith(".docx")) return extractFromDocx(file);
  throw new Error("Unsupported file type. Upload a .pdf or .docx.");
}

async function extractFromPdf(file: File): Promise<ExtractedPaper> {
  const pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url
  ).toString();

  const buf = await file.arrayBuffer();
  const doc = await pdfjsLib.getDocument({ data: buf }).promise;

  const pageTexts: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
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
  return { text: fullText.slice(0, 3000), fullText };
}

async function extractFromDocx(file: File): Promise<ExtractedPaper> {
  const mammoth = await import("mammoth");
  const buf = await file.arrayBuffer();
  const { value } = await mammoth.extractRawText({ arrayBuffer: buf });
  const fullText = value.replace(/[ \t]+/g, " ").trim();
  // ponytail: first-3000-chars-of-whole-document, not "find the Abstract
  // heading" — a doc with a long title page/author block/TOC before the
  // abstract could get truncated before the abstract even starts. Works for
  // the common case (abstract near the top); upgrade to heading detection if
  // match quality on real uploads shows this biting.
  return { text: fullText.slice(0, 3000), fullText };
}

// No unit test here — nothing pure to check without a browser + a real file.
// Covered by the manual Phase 2 gate: upload a real PDF, confirm sane text
// comes back, confirm devtools shows no network call carrying it.
