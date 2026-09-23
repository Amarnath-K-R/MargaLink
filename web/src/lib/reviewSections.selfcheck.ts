// Runnable check for reviewSections.ts — heading detection, short-section
// merging, chunk packing. Run directly:
//   node src/lib/reviewSections.selfcheck.ts
import assert from "node:assert/strict";
import { CHUNK_CHARS, buildPaperMap, chunkSections, splitIntoSections } from "./reviewSections.ts";
import { countWords } from "./formatCheck.ts";

const para = (n: number, seed: string) => Array.from({ length: n }, (_, i) => `${seed} sentence ${i} with enough words to count.`).join(" ");
// 12 lines ≈ 480 chars — a references block shorter than MIN_SECTION_CHARS
// would (correctly) merge into its predecessor and break the kinds below.
const REFS = Array.from({ length: 12 }, (_, i) => `[${i + 1}] Author ${i}. Title ${i}. Journal, 20${10 + i}.`).join("\n");
const NUMBERED = `Deep Learning for Crop Disease Detection

Abstract

${para(6, "Abstract")}

Keywords: deep learning, agriculture

1. Introduction

${para(12, "Intro")}

2. Methods

${para(12, "Methods")}

3. Results

${para(12, "Results")}

4. Discussion

${para(12, "Discussion")}

5. References

${REFS}
`;

// 1. numbered headings → front matter + six sections, contiguous offsets covering the text
{
  const s = splitIntoSections(NUMBERED);
  assert.deepEqual(s.map((x) => x.kind), ["other", "abstract", "introduction", "methods", "results", "discussion", "references"], "front matter + six headed sections");
  assert.equal(s[0].title, "Front matter");
  assert.ok(s[0].text.length < 300, "a short first span is kept, never merged into the abstract");
  assert.equal(s[1].charStart, s[0].charEnd, "sections are contiguous");
  assert.equal(s[s.length - 1].charEnd, NUMBERED.length, "sections cover the whole text");
  assert.ok(s[1].text.includes("Keywords:"), "a 'Keywords: …' line with content after the colon is not a heading — it stays in the abstract section");
  assert.equal(s[2].title, "1. Introduction");
}
// 1b. a heading-only "Keywords" line after the abstract merges FORWARD (the abstract stays exactly the abstract)
{
  const s = splitIntoSections(`Abstract\n\n${para(6, "A")}\n\nKeywords\n\ndeep learning; agriculture\n\n1. Introduction\n\n${para(12, "I")}\n`);
  assert.deepEqual(s.map((x) => x.kind), ["abstract", "introduction"]);
  assert.ok(!s[0].text.includes("Keywords"), "the abstract section stays exactly the abstract");
  assert.ok(s[1].text.startsWith("Keywords"), "the short section merged into the following one");
}
// 2. uppercase, unnumbered headings
{
  const s = splitIntoSections(`Title\n\nABSTRACT\n\n${para(10, "A")}\n\nMETHODS\n\n${para(8, "M")}\n\nRESULTS AND DISCUSSION\n\n${para(8, "R")}\n`);
  assert.deepEqual(s.map((x) => x.kind), ["other", "abstract", "methods", "results"]);
}
// 3. roman-numbered IEEE headings
{
  const s = splitIntoSections(`Title\n\nAbstract\n\n${para(10, "A")}\n\nI. INTRODUCTION\n\n${para(8, "I")}\n\nII. METHODS\n\n${para(8, "M")}\n`);
  assert.deepEqual(s.map((x) => x.kind), ["other", "abstract", "introduction", "methods"]);
}
// 4. no headings at all → one section, fixed-size chunks
{
  const text = para(1000, "Flat"); // ≈ 47k chars, no newlines at all
  const s = splitIntoSections(text);
  assert.equal(s.length, 1);
  assert.equal(s[0].kind, "other");
  assert.equal(s[0].title, "Paper");
  const c = chunkSections(s);
  assert.equal(c.length, 3);
  assert.ok(c.every((x) => x.text.length <= CHUNK_CHARS));
  assert.equal(c[1].title, "Paper (part 2/3)");
  assert.deepEqual(c.map((x) => x.id), ["s1-p1", "s1-p2", "s1-p3"]);
  assert.equal(c.map((x) => x.text).join(""), text, "chunks concatenate back to the section text");
}
// 5. a long Results section with numbered subsections splits at subsection lines
{
  const sub = (n: string) => `3.${n} Subsection ${n} outcomes\n\n${para(150, `S${n}`)}\n\n`; // ≈ 7k chars each
  const text = `Abstract\n\n${para(6, "A")}\n\n3. Results\n\n${sub("1")}${sub("2")}${sub("3")}${sub("4")}${sub("5")}`;
  const c = chunkSections(splitIntoSections(text)).filter((x) => x.kind === "results");
  assert.ok(c.length >= 3 && c.every((x) => x.text.length <= CHUNK_CHARS), c.map((x) => x.text.length).join());
  assert.ok(c.every((x) => /3\.\d Subsection \d outcomes/.test(x.text.slice(0, 80))), "every results chunk opens at a subsection line");
  assert.ok(c[0].title.startsWith("3. Results · 3.1"), `title carries the subsection: ${c[0].title}`);
  assert.equal(c[0].id, "s2-p1");
  assert.equal(c.map((x) => x.text).join(""), splitIntoSections(text)[1].text, "chunks concatenate back to the section text");
}
// 6. a lone "Results" line inside a table (short section) merges into its predecessor
{
  const s = splitIntoSections(`Abstract\n\n${para(6, "A")}\n\n2. Methods\n\n${para(12, "M")}\n\nResults\n\nTable 1 values here.\n\n4. Discussion\n\n${para(12, "D")}\n`);
  assert.deepEqual(s.map((x) => x.kind), ["abstract", "methods", "discussion"]);
  assert.ok(s[1].text.includes("Table 1 values here."));
}
// 7. "Summary" past the head window is not an abstract
{
  const s = splitIntoSections(`${para(160, "Body")}\n\nSummary\n\n${para(12, "Sum")}\n`); // "Summary" lands past HEAD_CHARS
  assert.ok(!s.some((x) => x.kind === "abstract"));
  assert.deepEqual(s.map((x) => x.kind), ["other", "other"]);
}
// 8. supplement after references stays separate; paperMap totals agree
{
  const text = `Abstract\n\n${para(6, "A")}\n\nReferences\n\n${REFS}\n\nSupplementary Material\n\n${para(12, "Supp")}\n`;
  const s = splitIntoSections(text);
  assert.deepEqual(s.map((x) => x.kind), ["abstract", "references", "supplement"]);
  const map = buildPaperMap(text, s);
  assert.equal(map.totalWords, countWords(text));
  assert.equal(map.sections.length, s.length);
  assert.equal(map.title, "Abstract"); // first non-empty line — fine for a test text; real papers start with the title
}

// 9-11: shapes seen in real PDFs during the Task 1 probe.
{
  // a wrapped prose line that is just the word "methods" is not a heading
  const s = splitIntoSections(`Abstract\n\n${para(10, "A")}\n\nRESULTS\n\n${para(10, "R")} using previously described\nmethods\nand ${para(10, "R2")}\n`);
  assert.deepEqual(s.map((x) => x.kind), ["abstract", "results"]);
}
{
  // JACC letter-spaces its references heading
  const s = splitIntoSections(`Abstract\n\n${para(10, "A")}\n\nCONCLUSIONS\n\n${para(10, "C")}\n\nR E F E R E N C E S\n\n${REFS}\n`);
  assert.deepEqual(s.map((x) => x.kind), ["abstract", "discussion", "references"]);
  assert.equal(s[2].title, "R E F E R E N C E S");
}
{
  // "79.3 years), with …" is wrapped prose, not a subsection title
  const body = `${para(200, "R")}\n79.3 years), with equal numbers of men and women,\n${para(200, "R2")}`;
  const c = chunkSections(splitIntoSections(`Abstract\n\n${para(10, "A")}\n\nRESULTS\n\n${body}\n`)).filter((x) => x.kind === "results");
  assert.ok(c.every((x) => !x.title.includes("79.3")), c.map((x) => x.title).join(" / "));
}

console.log("reviewSections.selfcheck: OK");
