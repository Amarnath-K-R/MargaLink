// Extracts title + abstract text from an uploaded paper, entirely in the browser.
// Nothing here ever sends the file or its text anywhere — see match.ts and the
// privacy-page claim this whole module exists to keep true.

export type ExtractedPaper = {
  text: string; // best-effort title + abstract, used as the embedding input
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

  // Title + abstract live on page 1 for the overwhelming majority of papers.
  // Full-text parsing is unnecessary for matching — see plan §3.2.
  const page = await doc.getPage(1);
  const content = await page.getTextContent();
  const text = content.items
    .map((item) => ("str" in item ? item.str : ""))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  return { text: text.slice(0, 3000) }; // title+abstract rarely exceed this
}

async function extractFromDocx(file: File): Promise<ExtractedPaper> {
  const mammoth = await import("mammoth");
  const buf = await file.arrayBuffer();
  const { value } = await mammoth.extractRawText({ arrayBuffer: buf });
  const text = value.replace(/\s+/g, " ").trim();
  // ponytail: first-3000-chars-of-whole-document, not "find the Abstract
  // heading" — a doc with a long title page/author block/TOC before the
  // abstract could get truncated before the abstract even starts. Works for
  // the common case (abstract near the top); upgrade to heading detection if
  // match quality on real uploads shows this biting.
  return { text: text.slice(0, 3000) };
}

// No unit test here — nothing pure to check without a browser + a real file.
// Covered by the manual Phase 2 gate: upload a real PDF, confirm sane text
// comes back, confirm devtools shows no network call carrying it.
