// Runnable check for reviewGrounding.ts — the anti-fabrication check
// standing between a model hallucinating a quote and that quote reaching
// the client. Run directly:
//   node src/lib/reviewGrounding.selfcheck.ts
import assert from "node:assert/strict";
import { quoteAppearsInSource, filterGrounded, groundExtractOutput, normalizeText } from "./reviewGrounding.ts";
import type { ReviewResult } from "./reviewTypes.ts";

const SOURCE = "The sample included 71 patients. No significant difference was found between groups (p=0.34).";

assert.equal(
  quoteAppearsInSource("The sample included 71 patients.", SOURCE),
  true,
  "an exact quote should be grounded"
);

assert.equal(
  quoteAppearsInSource("THE SAMPLE   included 71 PATIENTS.", SOURCE),
  true,
  "whitespace/case variation should still ground — fuzzy on those only"
);

assert.equal(quoteAppearsInSource("71 pat", SOURCE), false, "a sub-8-char quote should never ground, even if substantively present");

assert.equal(
  quoteAppearsInSource("The sample included 200 patients.", SOURCE),
  false,
  "a fabricated (unsupported) quote should never ground"
);

const RESULT: ReviewResult = {
  journalFit: { assessment: "good", explanation: "fits" },
  inconsistencies: [
    {
      description: "real, grounded finding",
      citations: [{ quote: "The sample included 71 patients.", section: "Methods" }],
    },
    {
      description: "fabricated finding — should be dropped entirely",
      citations: [{ quote: "The sample included 9000 patients.", section: "Methods" }],
    },
  ],
  statisticalReporting: [],
  otherObservations: [],
};

const filtered = filterGrounded(RESULT, SOURCE);
assert.equal(filtered.inconsistencies.length, 1, "a finding whose only citation fails grounding is dropped entirely");
assert.equal(
  filtered.inconsistencies[0].description,
  "real, grounded finding",
  "the surviving finding is the grounded one, not the fabricated one"
);

// Normalization: what real PDF extraction produces vs what the model quotes back.
assert.equal(quoteAppearsInSource("significant findings", "signiﬁcant ﬁndings were seen"), true, "ligatures in the source fold");
assert.equal(quoteAppearsInSource("signiﬁcant ﬁndings", "significant findings were seen"), true, "ligatures in the quote fold");
assert.equal(quoteAppearsInSource("treatment effect was", "the treat-\nment effect was large"), true, "line-end hyphenation is joined");
assert.equal(quoteAppearsInSource('"n = 71" was', "the “n = 71” was stated"), true, "curly quotes fold to straight");
assert.equal(quoteAppearsInSource("12 m2 per", "12 m² per plot"), true, "NFKC folds superscripts");
assert.equal(quoteAppearsInSource("soft hyphen word", "soft hy­phen word"), true, "soft hyphens and NBSP fold");
assert.equal(normalizeText(normalizeText("signiﬁcant “x” – y")), normalizeText("signiﬁcant “x” – y"), "normalizeText is idempotent");
assert.equal(normalizeText("a\n\nb"), "a\n\nb", "normalizeText keeps newlines (sectioning runs after it)");
// Pinned, deliberate: numbers the model 'tidies' do not ground (Task 11 measures how often).
assert.equal(quoteAppearsInSource("n = 1234 patients", "n = 1,234 patients"), false, "thousands separators are not folded");

// groundExtractOutput: quotes verified against THIS chunk only, shape enforced defensively.
const CHUNK = "Of the 71 patients enrolled, 45 (63%) completed follow-up. Mean age was 54.2 years.";
const raw = {
  claims: [
    { quote: "Of the 71 patients enrolled, 45 (63%) completed follow-up", measure: "completed follow-up", values: [{ value: 71, unit: null }, { value: 45, unit: null }, { value: 63, unit: "%" }] },
    { quote: "The sample included 200 patients.", measure: "fabricated", values: [{ value: 200, unit: null }] },
    { quote: "Mean age was 54.2 years", measure: "no values", values: [] },
    { quote: "Mean age was 54.2 years", measure: "non-finite", values: [{ value: Number.NaN, unit: "years" }] },
    { quote: "Mean age was 54.2 years", measure: "mean age", values: [{ value: 54.2, unit: "years" }] },
  ],
  statisticalReporting: [
    { description: "grounded", severity: "major", quote: "45 (63%) completed follow-up" },
    { description: "ungrounded", severity: "minor", quote: "p < 0.05 for everything" },
  ],
  notes: [{ description: "keeps, quote nulled", quote: "not in the chunk at all" }, { description: "no quote", quote: null }],
};
const g = groundExtractOutput(raw, CHUNK, 1);
assert.equal(g.claims.length, 1, "fabricated, empty-values and non-finite claims drop; the cap trims the rest");
assert.equal(g.claims[0].measure, "completed follow-up");
assert.deepEqual(g.statisticalReporting.map((s) => s.description), ["grounded"]);
assert.deepEqual(g.notes.map((n) => n.quote), [null, null], "a note whose quote fails is kept with its quote nulled");
assert.equal(groundExtractOutput(raw, CHUNK, 5).claims.length, 2, "cap 5 keeps both grounded claims");
assert.throws(() => groundExtractOutput({ claims: "nope" }, CHUNK, 5), /malformed/i, "a non-array field is rejected, never trusted");

console.log("reviewGrounding.selfcheck: OK");
