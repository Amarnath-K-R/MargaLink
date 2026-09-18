// Runnable check for formatCheck.ts's heuristics against realistic sample
// text — not part of the app bundle. Run directly:
//   node src/lib/formatCheck.selfcheck.ts
import { checkFormat } from "./formatCheck.ts";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAILED: ${msg}`);
}

const SAMPLE_PAPER = `
Deep Learning for Crop Disease Detection

John Smith, Jane Doe

Abstract

This paper presents a convolutional neural network approach to detecting
crop diseases from leaf images. We evaluate our method on a large dataset
of rice and wheat leaf photographs collected across three growing seasons
and show substantial improvements over prior baselines in both accuracy
and inference latency on low-power devices commonly available to farmers.

Keywords: deep learning, agriculture, plant disease

1. Introduction

Crop diseases cause significant yield losses worldwide as shown in Figure 1
and Figure 2. Early detection remains a major challenge for smallholder
farmers, see Table 1 for a summary of existing approaches. Figure 1 shows
the overall pipeline.

2. Methods

We collected images as described in Table 1 and Table 2.

3. Results

Our model outperforms baselines (see Figure 3).

Ethics statement

This study did not involve human or animal subjects and did not require
institutional review board approval.

Funding

This work was supported by a grant from the National Science Foundation.

Conflicts of interest

The authors declare no competing interests.

Data availability statement

The data supporting this study are available from the corresponding author
upon reasonable request.

References

[1] Smith, J. et al. Deep learning basics. Journal of AI, 2020.
[2] Doe, J. et al. Agricultural imaging. Journal of Ag Tech, 2019.
[3] Lee, K. Crop disease review. Plant Science, 2021.
`;

const result = checkFormat(SAMPLE_PAPER);

assert(result.wordCount > 100, `expected a substantial word count, got ${result.wordCount}`);
assert(result.abstract.found, "abstract should be found");
assert(
  result.abstract.wordCount !== null && result.abstract.wordCount > 20 && result.abstract.wordCount < 100,
  `abstract word count should be reasonable, got ${result.abstract.wordCount}`
);
assert(!result.abstract.structured, "this abstract has no Background:/Methods: sub-headings");
assert(result.requiredSections.ethics, "ethics statement should be detected");
assert(result.requiredSections.funding, "funding statement should be detected");
assert(result.requiredSections.conflictsOfInterest, "COI statement should be detected");
assert(result.requiredSections.dataAvailability, "data availability statement should be detected");
assert(result.referenceCount === 3, `expected 3 numbered references, got ${result.referenceCount}`);
assert(result.figureCount === 3, `expected figures 1,2,3 (unique), got ${result.figureCount}`);
assert(result.tableCount === 2, `expected tables 1,2 (unique), got ${result.tableCount}`);

// Structured abstract
const STRUCTURED = `
Abstract

Background: Crop diseases are common. Methods: We used a CNN. Results: It
worked well. Conclusions: Deep learning helps.

Introduction

Text here.
`;
const structuredResult = checkFormat(STRUCTURED);
assert(structuredResult.abstract.found, "structured abstract should still be found");
assert(structuredResult.abstract.structured, "should detect Background:/Methods:/Results: as structured");

// Negative case: a bare-bones text with none of these sections
const MINIMAL = "Just a short note with no abstract, no references, nothing structured.";
const minimalResult = checkFormat(MINIMAL);
assert(!minimalResult.abstract.found, "no abstract heading present, should not be found");
assert(!minimalResult.requiredSections.ethics, "no ethics statement, should be false");
assert(!minimalResult.requiredSections.funding, "no funding statement, should be false");
assert(minimalResult.referenceCount === null, "no references section, should be null not 0");
assert(minimalResult.figureCount === 0, "no figures mentioned");

// "abstract art" mentioned deep in the document (e.g. in a reference title)
// should not be picked up as an Abstract *heading* this far from the start
const FALSE_POSITIVE_CHECK = "x ".repeat(4000) + "\nAbstract\n\nA note about abstract art in this reference.";
const fpResult = checkFormat(FALSE_POSITIVE_CHECK);
assert(!fpResult.abstract.found, "an 'Abstract' heading past the 6000-char head window should not match");

console.log("formatCheck.selfcheck: OK");
