// Runnable check for reviewPasses.ts: exact request shapes with hard caps,
// the editor's output kept to findings that exist, and one upstream request
// layout whose cached prefix (tools, system, paper) is identical for every pass.
//   node src/lib/review/reviewPasses.selfcheck.ts
import assert from "node:assert/strict";
import { CHECKLIST_ID, editorOutsideDelivered, paperChars, parsePassRequest, parseStartRequest, passBudget, passCallConfig, upstreamBody, validateEditorOutput } from "./reviewPasses.ts";
import { JOURNAL_RULES } from "../journals/journalRules.ts";
import type { EditorRequest, PaperChunk } from "./reviewTypes.ts";

const paper: PaperChunk[] = [
  { id: "s1", title: "Abstract", kind: "abstract", text: "We enrolled 412 adults after surgery." },
  { id: "s2", title: "Results", kind: "results", text: "The pooled AUC was 0.783 across 1,730 patients." },
];
const journalId = JOURNAL_RULES[0].journalId;

// --- start: ids, lengths and which are reviewed; at least one reviewed
assert.equal(typeof parseStartRequest({ tier: "quick", journalId, chunks: [{ id: "s1", chars: 10, review: true }, { id: "s2", chars: 10, review: false }] }), "object");
assert.equal(typeof parseStartRequest({ tier: "quick", journalId, chunks: [{ id: "s1", chars: 10 }] }), "string", "the v1 shape");
assert.equal(typeof parseStartRequest({ tier: "quick", journalId, chunks: [{ id: "s1", chars: 10, review: false }] }), "string", "nothing to review");
assert.equal(typeof parseStartRequest({ tier: "quick", journalId, chunks: [{ id: "x", chars: 10, review: true }] }), "string");
assert.deepEqual(passBudget(3, true), { sections: 16, editor: 4 });
assert.equal(paperChars(paper), 4000, "each chunk billed as at least 2,000");

// --- a section pass
const section = { pass: "section", tier: "standard", paper, target: "s2" };
assert.equal(typeof parsePassRequest(section), "object");
assert.equal(typeof parsePassRequest({ ...section, target: "s9" }), "string", "a target not in the paper");
assert.equal(typeof parsePassRequest({ ...section, extra: 1 }), "string");
assert.equal(typeof parsePassRequest({ ...section, paper: [...paper, { id: "s3", title: "References", kind: "references", text: "x" }] }), "string", "references are never sent");
assert.equal(typeof parsePassRequest({ ...section, paper: [paper[0], paper[0]] }), "string", "duplicate ids");
assert.equal(typeof parsePassRequest({ ...section, paper: [{ ...paper[0], text: "x".repeat(24_001) }] }), "string");
assert.equal(typeof parsePassRequest({ pass: "extract" }), "string", "the v1 passes are gone");

// --- the checklist: thorough only
assert.equal(typeof parsePassRequest({ pass: "checklist", tier: "thorough", paper }), "object");
assert.equal(typeof parsePassRequest({ pass: "checklist", tier: "standard", paper }), "string");

// --- the editor: findings by id, from sections that came back, no more than a pass could return
const editor: EditorRequest = {
  pass: "editor",
  tier: "standard",
  journalId,
  paper,
  findings: [
    { id: "s1-f0", title: "Abstract omits the CI", severity: "minor", why: "W.", quotes: [] },
    { id: "s2-f0", title: "Pooled AUC below every fold", severity: "major", why: "W.", quotes: ["The pooled AUC was 0.783"] },
    { id: "s2-f1", title: "Pooled AUC is lower than folds", severity: "major", why: "W.", quotes: [] },
    { id: "s2-f2", title: "Calibration only described", severity: "major", why: "W.", quotes: [] },
  ],
  keyNumbers: [{ id: "s2-k0", measure: "patients", quote: "1,730 patients" }],
};
assert.equal(typeof parsePassRequest(editor), "object");
assert.equal(typeof parsePassRequest({ ...editor, findings: [editor.findings[0], editor.findings[0]] }), "string", "duplicate ids");
assert.equal(typeof parsePassRequest({ ...editor, findings: [{ ...editor.findings[0], id: "s1-x0" }] }), "string");
assert.equal(editorOutsideDelivered(editor, new Set(["s1", "s2"])), null);
assert.match(editorOutsideDelivered(editor, new Set(["s1"]))!, /s2/);
assert.match(editorOutsideDelivered({ ...editor, findings: [{ ...editor.findings[0], id: "s1-f8" }] }, new Set(["s1"]))!, /more/, "standard returns at most 8 per section");

// --- the editor's answer, checked
const answer = {
  overview: "O.",
  strengths: ["a", "b", "c", "d"],
  journalFit: { assessment: "possible", explanation: "Close." },
  fixFirst: ["s2-f0", "s2-f1", "zz", "a1", "a2", "s2-f2", "s2-f0"],
  duplicates: [{ keep: "s2-f0", drop: ["s2-f1", "nope"] }, { keep: "s2-f1", drop: ["s1-f0"] }],
  verdicts: [
    { id: "s2-f2", action: "drop", title: "", why: "", reason: "The paper reports it." },
    { id: "s1-f0", action: "drop", title: "", why: "", reason: "Only majors get verdicts." },
    { id: "s2-f0", action: "soften", title: "", why: "", reason: "" },
  ],
  acrossPaper: [
    { title: "Patients differ", severity: "major", category: "consistency", quotes: ["We enrolled 412 adults", "across 1,730 patients"], why: "W.", suggestion: "S.", question: false, missing: false },
    { title: "One-sided disagreement", severity: "major", category: "consistency", quotes: ["We enrolled 412 adults"], why: "W.", suggestion: "S.", question: false, missing: false },
  ],
};
const ok = validateEditorOutput(answer, editor);
assert.equal(ok.strengths.length, 3);
assert.deepEqual(ok.duplicates, [{ keep: "s2-f0", drop: ["s2-f1"] }], "unknown ids dropped; an id in a second group ignored");
assert.deepEqual(ok.verdicts.map((v) => [v.id, v.action]), [["s2-f2", "drop"]], "only majors; soften needs a title and a why");
assert.deepEqual(ok.acrossPaper.map((f) => f.id), ["a1"], "a disagreement needs both places");
assert.deepEqual(ok.fixFirst, ["s2-f0", "a1"], "unknown, duplicated-away, dropped and repeated ids are left out");
const quick = validateEditorOutput(answer, { ...editor, tier: "quick" });
assert.deepEqual([quick.verdicts, quick.acrossPaper], [[], []], "quick's editor has neither job");
assert.throws(() => validateEditorOutput({ ...answer, journalFit: { assessment: "great", explanation: "" } }, editor));

// --- one request layout: tools, system and paper identical for every pass of a review
const rules = JOURNAL_RULES[0];
const bodies = [
  { pass: "section", tier: "thorough", paper, target: "s1" } as const,
  { pass: "checklist", tier: "thorough", paper } as const,
  { ...editor, tier: "thorough" } as const,
].map((req) => upstreamBody(req, passCallConfig(req, rules), "claude-sonnet-5") as { tools: { name: string }[]; system: string; messages: { content: { text: string; cache_control?: unknown }[] }[] });
const prefix = (b: (typeof bodies)[number]) => JSON.stringify([b.tools, b.system, b.messages[0].content[0]]);
assert.ok(bodies.every((b) => prefix(b) === prefix(bodies[0])), "one cached prefix for the whole review");
assert.deepEqual(bodies[0].tools.map((t) => t.name), ["submit_section_review", "submit_checklist", "submit_editor_review"]);
assert.deepEqual(bodies[0].messages[0].content[0].cache_control, { type: "ephemeral" });
assert.match(bodies[1].messages[0].content[1].text, /submit_checklist/);
assert.equal(passCallConfig({ pass: "checklist", tier: "thorough", paper }, undefined).toolName, "submit_checklist");
assert.throws(() => passCallConfig(editor, undefined), "the editor needs the journal");
assert.equal(CHECKLIST_ID, "checklist");

console.log("reviewPasses.selfcheck: OK");
