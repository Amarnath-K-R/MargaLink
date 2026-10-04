// Runnable check for reviewGrounding.ts — the anti-fabrication check
// standing between a model hallucinating a quote and that quote reaching
// the client. Run directly:
//   node src/lib/review/reviewGrounding.selfcheck.ts
import assert from "node:assert/strict";
import { groundChecklistOutput, groundFinding, groundSectionOutput, indexPaper, locate, normalizeText, quoteAppearsInSource } from "./reviewGrounding.ts";
import type { PaperChunk } from "./reviewTypes.ts";

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

// Normalization: what real PDF extraction produces vs what the model quotes back.
assert.equal(quoteAppearsInSource("significant findings", "signiﬁcant ﬁndings were seen"), true, "ligatures in the source fold");
assert.equal(quoteAppearsInSource("signiﬁcant ﬁndings", "significant findings were seen"), true, "ligatures in the quote fold");
assert.equal(quoteAppearsInSource("treatment effect was", "the treat-\nment effect was large"), true, "line-end hyphenation is joined");
assert.equal(quoteAppearsInSource('"n = 71" was', "the “n = 71” was stated"), true, "curly quotes fold to straight");
assert.equal(quoteAppearsInSource("12 m2 per", "12 m² per plot"), true, "NFKC folds superscripts");
assert.equal(quoteAppearsInSource("soft hyphen word", "soft hy\u00ADphen\u00A0word"), true, "soft hyphens and NBSP fold");
assert.equal(normalizeText(normalizeText("signiﬁcant “x” – y")), normalizeText("signiﬁcant “x” – y"), "normalizeText is idempotent");
assert.equal(normalizeText("a\n\nb"), "a\n\nb", "normalizeText keeps newlines (sectioning runs after it)");
// Pinned, deliberate: numbers the model 'tidies' do not ground (Task 11 measures how often).
assert.equal(quoteAppearsInSource("n = 1234 patients", "n = 1,234 patients"), false, "thousands separators are not folded");

const paper: PaperChunk[] = [
  { id: "s1", title: "Front matter", kind: "other", text: "A study of sleep\n[redacted]\n[redacted]" },
  { id: "s2", title: "Methods", kind: "methods", text: "We used five-fold cross-validation on 12,282 images from 1,730 patients." },
  { id: "s3", title: "Results", kind: "results", text: "The pooled AUC was 0.783, below every fold's AUC of 0.804 to 0.834." },
];
const index = indexPaper(paper);

// locate: the chunk a quote is in, the target first
assert.equal(locate("five-fold cross-validation on 12,282 images", index), "s2");
assert.equal(locate("The pooled AUC was 0.783", index, "s2"), "s3", "found elsewhere when not in the target");
assert.equal(locate("0.804 to 0.834", index, "s3"), "s3");
assert.equal(locate("an invented sentence", index), null);
assert.equal(locate("[redacted]", index), null, "our own marker is never a quote");
assert.equal(locate("[redacted]\n[redacted]", index), null);
assert.equal(locate("x".repeat(401), index), null, "longer than a quote can be");
assert.equal(locate(42, index), null);

// groundFinding: quotes found or removed; a finding needs one unless it's about something missing
const f = (more: Record<string, unknown> = {}) => ({ title: "Folds split by image, not patient", severity: "major", category: "design", quotes: ["five-fold cross-validation on 12,282 images", "invented passage that is long"], why: "Leakage.", suggestion: "Split by patient.", question: false, missing: false, ...more });
const g = groundFinding(f(), index, "s2", ["major", "minor"])!;
assert.deepEqual(g.quotes, [{ text: "five-fold cross-validation on 12,282 images", chunk: "s2" }], "the unfound quote is removed");
assert.equal(groundFinding(f({ quotes: ["invented passage that is long"] }), index, "s2", ["major", "minor"]), null, "nothing left to point at");
assert.ok(groundFinding(f({ quotes: [], missing: true }), index, "s2", ["major", "minor"]), "something missing may have no quote");
assert.equal(groundFinding(f({ severity: "suggestion" }), index, "s2", ["major", "minor"]), null, "a severity this depth doesn't report");
assert.equal(groundFinding(f({ title: "Front matter has a redacted placeholder", quotes: [], missing: true }), index, "s1", ["major", "minor"]), null, "never a finding about our marker");
assert.equal(groundFinding(f({ category: "vibes" }), index, "s2", ["major"]), null);
const twice = groundFinding(f({ quotes: ["The pooled AUC was 0.783", "The pooled AUC was 0.783"] }), index, "s3", ["major"])!;
assert.equal(twice.quotes.length, 1, "the same quote once");
assert.equal(groundFinding(f({ title: "t".repeat(500) }), index, "s2", ["major"])!.title.length, 160, "clipped");

// a section's output: capped at the depth's findings, key numbers located
const out = groundSectionOutput(
  { verdict: "Sound design.", findings: Array.from({ length: 6 }, () => f()), keyNumbers: [{ measure: "patients", quote: "1,730 patients" }, { measure: "made up", quote: "999 people" }] },
  { pass: "section", tier: "quick", journalId: null, guidance: "", paper, target: "s2" },
);
assert.equal(out.findings.length, 4, "quick reports at most 4");
assert.deepEqual(out.keyNumbers, [], "quick compares no numbers across sections, so keeps none");
const std = groundSectionOutput(
  { verdict: "Sound design.", findings: [f()], keyNumbers: [{ measure: "patients", quote: "1,730 patients" }, { measure: "made up", quote: "999 people" }] },
  { pass: "section", tier: "standard", journalId: null, guidance: "", paper, target: "s2" },
);
assert.deepEqual(std.keyNumbers, [{ measure: "patients", quote: { text: "1,730 patients", chunk: "s2" } }]);
assert.throws(() => groundSectionOutput({ verdict: 1 }, { pass: "section", tier: "quick", journalId: null, guidance: "", paper, target: "s2" }));

// the checklist: a known guideline or none; an unfound quote becomes null, the item stays
const ck = groundChecklistOutput(
  { guideline: "TRIPOD+AI", why: "A prediction model.", items: [{ item: "Sample size", status: "missing", note: "Say how.", quote: null }, { item: "Model updating", status: "partial", note: "Partly.", quote: "not in the paper at all" }] },
  { pass: "checklist", tier: "thorough", journalId: null, guidance: "", paper },
);
assert.deepEqual(ck.items.map((i) => i.quote), [null, null]);
assert.throws(() => groundChecklistOutput({ guideline: "MADE-UP", why: "", items: [] }, { pass: "checklist", tier: "thorough", journalId: null, guidance: "", paper }));
assert.deepEqual(groundChecklistOutput({ guideline: null, why: "None applies.", items: [{ item: "x", status: "missing", note: "y", quote: null }] }, { pass: "checklist", tier: "thorough", journalId: null, guidance: "", paper }).items, [], "no guideline, no items");

console.log("reviewGrounding.selfcheck: OK");
