// pdfjs-dist ships no declarations for its worker; the review's live check
// (scripts/eval/review_live.ts) imports it to run pdf.js in Node.
declare module "pdfjs-dist/build/pdf.worker.min.mjs";
