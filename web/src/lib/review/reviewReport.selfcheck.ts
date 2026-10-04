// Runnable check for reviewReport.ts: the report is built from ids, so a
// finding shows once; the editor's duplicates and verdicts are applied; Fix
// these first names only findings that are shown; no em dash survives; the
// Markdown export says the same thing; a kept report is read back only if
// it's one.
//   node src/lib/review/reviewReport.selfcheck.ts
import assert from "node:assert/strict";
import { assembleReport, coverageLine, fixFirstDetails, parseKept, reportMarkdown, whereLine, type ReportInput } from "./reviewReport.ts";
import type { Finding, Severity } from "./reviewTypes.ts";

const f = (title: string, severity: Severity, chunk: string): Finding => ({
  title,
  severity,
  category: "reporting",
  quotes: [{ text: `${title} quote`, chunk }],
  why: "It matters — a lot.",
  suggestion: "Fix it.",
  question: false,
  missing: false,
});
const input: ReportInput = {
  chunks: [
    { id: "s1", title: "Abstract" },
    { id: "s2", title: "Methods" },
    { id: "s3", title: "Results" },
  ],
  review: ["s1", "s2", "s3"],
  skipped: [],
  excluded: [{ id: "s4", title: "Funding" }],
  sections: {
    s1: { verdict: "Clear — mostly.", findings: [f("Abstract has no CI", "minor", "s1")], keyNumbers: [] },
    s2: { verdict: "Sound.", findings: [f("Folds split by image, not patient", "major", "s2"), f("Pooled AUC below folds", "major", "s3"), f("Wrong claim", "major", "s2")], keyNumbers: [] },
  },
  failed: { s3: "timed out" },
  checklist: { guideline: "TRIPOD+AI", why: "A prediction model.", items: [{ item: "Sample size", status: "missing", note: "Say how — briefly.", quote: { text: "We used 1730 patients", chunk: "s2" } }] },
  checklistFailed: null,
  editor: {
    overview: "It — works.",
    strengths: ["Clear aim."],
    journalFit: { assessment: "possible", explanation: "Close." },
    fixFirst: ["s2-f0", "s2-f1", "a1", "s1-f0", "s2-f2"],
    duplicates: [{ keep: "s2-f0", drop: ["s1-f0"] }],
    verdicts: [
      { id: "s2-f1", action: "soften", title: "Why is the pooled AUC below every fold?", why: "Could the folds' scores sit on different scales?", reason: "" },
      { id: "s2-f2", action: "drop", title: "", why: "", reason: "The paper reports it." },
    ],
    acrossPaper: [{ ...f("Abstract and results disagree on n", "major", "s1"), id: "a1" }],
  },
  tier: "standard",
  journalName: "JAMA",
  createdAt: "2026-10-04T10:00:00.000Z",
};
const r = assembleReport(input);

assert.deepEqual(r.sections.map((s) => [s.id, s.status]), [["s1", "done"], ["s2", "done"], ["s3", "failed"]]);
assert.deepEqual(r.sections[0].findings, [], "the abstract's finding was a duplicate of the methods one");
assert.deepEqual(r.sections[1].findings.map((x) => x.id), ["s2-f0", "s2-f1"], "the dropped one is gone");
const soft = r.sections[1].findings[1];
assert.equal(soft.title, "Why is the pooled AUC below every fold?");
assert.ok(soft.question && soft.softened);
assert.deepEqual(soft.citations, [{ quote: "Pooled AUC below folds quote", section: "Results", sectionId: "s3" }], "a quote from another section says which");
assert.deepEqual(r.fixFirst.map((x) => [x.id, x.section]), [["s2-f0", "Methods"], ["s2-f1", "Methods"], ["a1", "Across the paper"]]);
const ids = [...r.sections.flatMap((s) => s.findings), ...r.acrossPaper].map((x) => x.id);
assert.equal(new Set(ids).size, ids.length, "every finding once");
assert.equal(r.coverage.setAside, 1);
assert.deepEqual(r.coverage.failed, [{ id: "s3", title: "Results", reason: "timed out" }]);
assert.ok(r.coverage.skipped.some((s) => s.title === "Funding (excluded by you)"));
assert.equal(r.checklist?.items[0].citation?.section, "Methods");
assert.ok(!JSON.stringify(r).includes("—"), "no em dash reaches the screen");
assert.match(coverageLine(r.coverage), /Reviewed 2 of 3 sections; Results couldn't be checked \(timed out\)/);
assert.match(coverageLine(r.coverage), /1 finding set aside on a second look/);

// before the editor: every finding shown as found, no overview, no priorities
const early = assembleReport({ ...input, editor: null });
assert.equal(early.overview, null);
assert.deepEqual(early.fixFirst, []);
assert.equal(early.sections[0].findings.length, 1);

// a checklist that failed is named in the coverage
assert.deepEqual(assembleReport({ ...input, checklist: null, checklistFailed: "the answer came back cut short" }).coverage.failed.at(-1), {
  id: "checklist",
  title: "Reporting checklist",
  reason: "the answer came back cut short",
});

// Fix these first in full: where the change goes, the passages, what to do
const details = fixFirstDetails(r);
assert.deepEqual(details.map((d) => [d.item.id, d.home, whereLine(d), d.finding?.suggestion]), [
  ["s2-f0", "Methods", "Methods", "Fix it."],
  ["s2-f1", "Methods", "Methods", "Fix it."],
  ["a1", null, "Across the paper", "Fix it."],
]);
assert.equal(details[1].finding?.citations[0].section, "Results", "a passage quoted from another section says which");
const missing = { ...details[0], finding: { ...details[0].finding!, missing: true, citations: [] } };
assert.equal(whereLine(missing), "Methods: something to add");
const twoPlaces = { ...details[2], finding: { ...details[2].finding!, citations: [details[0].finding!.citations[0], details[1].finding!.citations[0]] } };
assert.equal(whereLine(twoPlaces), "In 2 places");

// the Markdown export: the same report, headed by section
const md = reportMarkdown(r);
for (const part of [
  "# Pre-submission review (standard) for JAMA",
  "## Overview",
  "## Fix these first",
  "1. **Major: Folds split by image, not patient**\n\n   Where: Methods\n\n   > \"Folds split by image, not patient quote\" (Methods)\n\n   What to do: Fix it.",
  "3. **Major: Abstract and results disagree on n**\n\n   Where: Across the paper",
  "> \"Folds split by image, not patient quote\" (Methods)\n\n  Why it matters: It matters, a lot.\n\n  Suggestion: Fix it.",
  "## Section by section",
  "### Methods",
  "## Across the paper",
  "Reporting checklist: TRIPOD+AI",
  '> "Folds split by image, not patient quote" (Methods)',
  "Results: couldn't be reviewed (timed out)",
]) {
  assert.ok(md.includes(part), part);
}
assert.ok(!md.includes("—"));

// no journal, and no notes describing one: no journal in the title, no Journal fit
const general = assembleReport({ ...input, journalName: null, editor: { ...input.editor!, journalFit: { assessment: "possible", explanation: "" } } });
assert.equal(general.overview?.journalFit, null);
const generalMd = reportMarkdown(general);
assert.ok(generalMd.startsWith("# Pre-submission review (standard)\n"), generalMd.slice(0, 60));
assert.ok(!generalMd.includes("Journal fit"));

// what's kept is read back only if it is a v2 report
assert.deepEqual(parseKept(JSON.stringify(r)), r);
for (const bad of [null, "{", "[]", JSON.stringify({ version: 1 }), JSON.stringify({ version: 2 })]) assert.equal(parseKept(bad), null, String(bad));

console.log("reviewReport.selfcheck: OK");
