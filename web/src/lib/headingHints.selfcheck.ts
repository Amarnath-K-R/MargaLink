// Runnable check for headingHints.ts — heading recovery from PDF font data and
// DOCX heading styles, modelled on real papers' typesetting. Run directly:
//   node src/lib/headingHints.selfcheck.ts
import assert from "node:assert/strict";
import { pickDocxHeadings, pickPdfHeadings, type LineFontInfo } from "./headingHints.ts";

const L = (text: string, font: string, size: number, wholeLine = true): LineFontInfo => ({ text, font, size, wholeLine });
const prose = (font: string, size: number, n = 3) =>
  Array.from({ length: n }, (_, i) => L(`This is a line of ordinary body text number ${i} that runs long enough to be prose.`, font, size));

// (a) BMC-like: Bold sections, BoldItalic subsections, bold table header rows, bold reference fragments.
{
  const B = "GillSans-Bold", BI = "GillSans-BoldItalic", R = "Giovanni-Book";
  const lines = [
    L("A comparison of direct versus self-report measures", B, 12),
    L("physical activity in adults: a systematic review", B, 12),
    ...prose(R, 9, 1),
    L("Abstract", B, 9), L("Background", B, 9), ...prose(R, 9),
    L("Methods", B, 9), L("Study criteria", BI, 9), ...prose(R, 9),
    L("Search strategy", BI, 9), ...prose(R, 9),
    L("First Author – Year", B, 8), L("N analyzed Population", B, 8), L("Total Men Women", B, 8), L("12 34 56", R, 8),
    L("Results", B, 9), ...prose(R, 9),
    L("Table 1: Medline search strategy", B, 9), ...prose(R, 9, 1),
    L("Discussion", B, 9), ...prose(R, 9),
    L("health-related research. Public Health 1985, 100: 126-131.", B, 9, false), ...prose(R, 9, 1),
  ];
  const h = pickPdfHeadings(lines);
  assert.deepEqual(
    h.map((x) => `${x.level}:${x.text}`),
    ["1:Abstract", "1:Background", "1:Methods", "2:Study criteria", "2:Search strategy", "1:Results", "1:Discussion"],
    "sections at level 1, BoldItalic subsections at level 2; title, table headers, captions and reference fragments excluded"
  );
}
// (b) JACC-like: a dedicated heading font a hair larger than body; flowchart text in another font.
{
  const H = "AdvOT5b669f61", R = "AdvOTe81213fa", F = "GuardianTextSans-Medium";
  const lines = [
    ...prose(R, 7.7),
    L("METHODS", H, 8), ...prose(R, 7.7),
    L("Records identified through", F, 9), L("database searching", F, 9), L("(N = 63,104)", F, 9), L("Records screened", F, 9), L("(N = 40,961)", F, 9),
    L("RESULTS", H, 8), ...prose(R, 7.7),
    L("DISCUSSION", H, 8), ...prose(R, 7.7),
    L("CONCLUSIONS", H, 8), ...prose(R, 7.7),
  ];
  assert.deepEqual(pickPdfHeadings(lines).map((x) => x.text), ["METHODS", "RESULTS", "DISCUSSION", "CONCLUSIONS"], "figure labels never count");
}
// (c) JCSM-like: one ".B" font; UPPERCASE top level at 10pt, Title-case subsections at 11pt.
{
  const B = "AdvTT8921c9bc.B", R = "AdvOT833fb896";
  const lines = [
    ...prose(R, 10),
    L("METHODS", B, 10), L("Data collection", B, 11), ...prose(R, 10),
    L("Statistical analysis", B, 11), ...prose(R, 10),
    L("RESULTS", B, 10), L("Search results and characteristics", B, 11), ...prose(R, 10),
    L("DISCUSSION", B, 10), ...prose(R, 10),
  ];
  assert.deepEqual(
    pickPdfHeadings(lines).map((x) => `${x.level}:${x.text}`),
    ["1:METHODS", "2:Data collection", "2:Statistical analysis", "1:RESULTS", "2:Search results and characteristics", "1:DISCUSSION"],
    "the style that carries METHODS/RESULTS is level 1 even though it's the smaller size"
  );
}
// (d) a one-off bold line is not structure; (e) italic-only lines never count.
{
  const R = "Body", B = "Body-Bold", I = "Body-Italic";
  const lines = [...prose(R, 10), L("A lone bold remark", B, 10), ...prose(R, 10), L("Italic aside one", I, 10), ...prose(R, 10), L("Italic aside two", I, 10), ...prose(R, 10)];
  assert.deepEqual(pickPdfHeadings(lines), []);
}
// (e2) custom top-level headings with no standard words: the larger style is level 1.
{
  const R = "Body", H1 = "Serif-Bold", H2 = "Sans-Bold";
  const lines = [...prose(R, 10), L("Wave I: Proof of Concept", H1, 14), L("Cluster 1: Early signals", H2, 11), ...prose(R, 10), L("Wave II: Clinical Validation", H1, 14), ...prose(R, 10), L("Cluster 2: Changing the endpoint", H2, 11), ...prose(R, 10)];
  assert.deepEqual(
    pickPdfHeadings(lines).map((x) => `${x.level}:${x.text}`),
    ["1:Wave I: Proof of Concept", "2:Cluster 1: Early signals", "1:Wave II: Clinical Validation", "2:Cluster 2: Changing the endpoint"]
  );
}
// (f) DOCX with heading styles (the shape of a real Word review)
{
  const html =
    "<p><strong>Listening Between Appointments:</strong></p><h1>Abstract</h1><p>Text.</p><h1>Wave I: Proof of Concept</h1><p>Text.</p>" +
    "<h2>Cluster 1: Catching What the Clinic Misses</h2><p>Text &amp; more.</p><h1>Equity &amp; Governance</h1><p>x</p>" +
    "<h1>Appendix: All 54 Papers</h1><h2>Equity &amp; Governance</h2><table><tr><td><p><strong>Study</strong></p></td></tr></table>";
  assert.deepEqual(
    pickDocxHeadings(html).map((x) => `${x.level}:${x.text}`),
    ["1:Abstract", "1:Wave I: Proof of Concept", "2:Cluster 1: Catching What the Clinic Misses", "1:Equity & Governance", "1:Appendix: All 54 Papers", "2:Equity & Governance"],
    "styled headings, in order, entities decoded; bold paragraphs ignored when styles exist"
  );
}
// (g) DOCX without heading styles: whole-bold standalone paragraphs outside tables become level 2
{
  const html =
    "<table><tr><td><p><strong>Study</strong></p></td><td><p><strong>Year</strong></p></td></tr></table>" +
    "<p><strong>Background</strong></p><p>Prose follows here.</p><p><strong>Our approach</strong></p><p>More prose.</p>" +
    "<p><strong>Ends with a period.</strong></p><p>Prose.</p><p>Some <strong>inline</strong> bold.</p>";
  assert.deepEqual(pickDocxHeadings(html), [
    { text: "Background", level: 2 },
    { text: "Our approach", level: 2 },
  ]);
}

console.log("headingHints.selfcheck: OK");
