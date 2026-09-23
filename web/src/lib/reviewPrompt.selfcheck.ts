// Runnable check for reviewPrompt.ts. Run directly:
//   node src/lib/reviewPrompt.selfcheck.ts
import assert from "node:assert/strict";
import { TIER_CONFIG, requiredStatementsList, buildPrompt } from "./reviewPrompt.ts";
import type { JournalRules } from "./journalRules.ts";
import { REVIEW_TIERS } from "./reviewTypes.ts";

for (const tier of REVIEW_TIERS) {
  assert.ok(TIER_CONFIG[tier].guidance.length > 0, `${tier} tier should have non-empty guidance text`);
}

const RULES: JournalRules = {
  journalId: "test-journal",
  journalName: "Test Journal of Selfchecks",
  articleTypeLabel: "Original Investigation",
  wordLimit: 3000,
  referenceStyle: null,
  requiredStatements: ["ethics", "funding"],
  guidelinesUrl: "https://example.com",
  asOf: "2026-01-01",
  scopeSummary: "A journal for selfcheck fixtures.",
};

assert.equal(
  requiredStatementsList(RULES),
  "Ethics/IRB approval statement, Funding statement",
  "requiredStatementsList should join the labeled statements"
);
assert.equal(
  requiredStatementsList({ ...RULES, requiredStatements: [] }),
  "none required",
  "an empty requiredStatements list should fall back to 'none required'"
);

const promptWithoutAbstract = buildPrompt("Some paper text with no abstract heading.", RULES, "standard");
assert.ok(
  promptWithoutAbstract.includes("data submitted by an untrusted party"),
  "the prompt injection-defense paragraph must always be present"
);
assert.ok(!promptWithoutAbstract.includes("ABSTRACT (exact text"), "no ABSTRACT block when extractAbstract finds nothing");

const paperWithAbstract = "Title\n\nAbstract\n\nThis is the real abstract text.\n\n1. Introduction\n\nBody text here.";
const promptWithAbstract = buildPrompt(paperWithAbstract, RULES, "thorough");
assert.ok(
  promptWithAbstract.includes('ABSTRACT (exact text — this is the ONLY text that counts as "the abstract"'),
  "the labeled ABSTRACT block should appear when extractAbstract finds one"
);
assert.ok(
  promptWithAbstract.includes("This is the real abstract text."),
  "the labeled ABSTRACT block should contain the actual extracted abstract text"
);

console.log("reviewPrompt.selfcheck: OK");
