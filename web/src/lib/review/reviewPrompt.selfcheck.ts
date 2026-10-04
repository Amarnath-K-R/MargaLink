// Runnable check for reviewPrompt.ts: what every pass is told. The rules that
// matter are in the shared system prompt (so they are cached with the paper);
// each pass's instruction names its job, its checklist and its tool.
//   node src/lib/review/reviewPrompt.selfcheck.ts
import assert from "node:assert/strict";
import { CHECKLIST_GUIDELINES, CHECKLIST_INSTRUCTION, KIND_CHECKLIST, REVIEW_SYSTEM, TIER_PLAN, editorInstruction, paperBlock, sectionInstruction } from "./reviewPrompt.ts";
import { JOURNAL_RULES } from "../journals/journalRules.ts";
import { SECTION_KINDS, type EditorRequest, type PaperChunk } from "./reviewTypes.ts";

const paper: PaperChunk[] = [
  { id: "s1", title: "Abstract", kind: "abstract", text: "We studied 412 adults." },
  { id: "s2", title: 'The "main" Methods', kind: "methods", text: "Five-fold cross-validation on images." },
];

// the system prompt: shared, so it carries every rule
for (const rule of [/\[redacted\]/, /untrusted/, /em dash/, /question/, /word for word/i, /never invent/i, /accepted/]) assert.match(REVIEW_SYSTEM, rule);
assert.ok(!/s1|s2|Abstract/.test(REVIEW_SYSTEM), "nothing paper-specific: it must be identical for every pass");

// the paper block: every section by id, in order, with its text
const block = paperBlock(paper);
assert.ok(block.indexOf('id="s1"') < block.indexOf('id="s2"'));
assert.ok(block.includes("We studied 412 adults.") && block.includes("Five-fold cross-validation on images."));
assert.ok(block.includes("title=\"The 'main' Methods\""), "a quote in a title can't break the tag");

// a section pass: its target, its kind's checklist, the tier's limits, its tool
for (const kind of SECTION_KINDS) if (kind !== "references") assert.ok(KIND_CHECKLIST[kind].length > 40, `a checklist for ${kind}`);
const s = sectionInstruction(paper[1], "standard");
assert.match(s, /id="s2"/);
assert.ok(s.includes(KIND_CHECKLIST.methods));
assert.match(s, new RegExp(`at most ${TIER_PLAN.standard.maxFindings} findings`));
assert.match(s, /"major" or "minor"/);
assert.match(sectionInstruction(paper[1], "thorough"), /"major", "minor" or "suggestion"/);
assert.match(s, /submit_section_review/);

// the checklist pass: the fixed list, by name, its tool
for (const g of CHECKLIST_GUIDELINES) assert.ok(CHECKLIST_INSTRUCTION.includes(g), g);
assert.match(CHECKLIST_INSTRUCTION, /submit_checklist/);

// the editor: the journal, every finding by id, and only the jobs its tier has
const rules = JOURNAL_RULES[0];
const req = (tier: EditorRequest["tier"]): EditorRequest => ({
  pass: "editor",
  tier,
  journalId: rules.journalId,
  paper,
  findings: [{ id: "s2-f0", title: "Folds split by image", severity: "major", why: "Leakage.", quotes: ["Five-fold cross-validation on images"] }],
  keyNumbers: [{ id: "s1-k0", measure: "adults enrolled", quote: "412 adults" }],
});
const std = editorInstruction(req("standard"), rules);
for (const part of [rules.journalName, rules.scopeSummary, "s2-f0", "Folds split by image", "s1-k0", "submit_editor_review", "verdicts", "acrossPaper", "a1"]) assert.ok(std.includes(part), part);
const quick = editorInstruction(req("quick"), rules);
assert.match(quick, /leave verdicts empty/);
assert.match(quick, /leave acrossPaper empty/);
assert.match(quick, new RegExp(`${TIER_PLAN.quick.fixFirst[0]}-${TIER_PLAN.quick.fixFirst[1]} things`));

// the ladder: each depth reviews at least what the one below does; references never; the checklist only at thorough
const kinds = (t: keyof typeof TIER_PLAN) => new Set(TIER_PLAN[t].kinds);
for (const k of kinds("quick")) assert.ok(kinds("standard").has(k));
for (const k of kinds("standard")) assert.ok(kinds("thorough").has(k));
for (const t of ["quick", "standard", "thorough"] as const) assert.ok(!kinds(t).has("references"));
assert.deepEqual([TIER_PLAN.quick.checklist, TIER_PLAN.standard.checklist, TIER_PLAN.thorough.checklist], [false, false, true]);
assert.deepEqual([TIER_PLAN.quick.verdicts, TIER_PLAN.standard.verdicts, TIER_PLAN.thorough.verdicts], [false, true, true]);
assert.ok(TIER_PLAN.thorough.subsections && !TIER_PLAN.standard.subsections);

console.log("reviewPrompt.selfcheck: OK");
