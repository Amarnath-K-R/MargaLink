// Runnable check for rulesCheck.ts's heuristics — not part of the app bundle.
// Run directly: node src/lib/rulesCheck.selfcheck.ts
import { checkRules } from "./rulesCheck.ts";
import type { JournalRules } from "./journalRules.ts";
import assert from "node:assert/strict";

const RULES: JournalRules = {
  journalId: "test",
  journalName: "Test Journal",
  articleTypeLabel: "Research Article",
  wordLimit: 20,
  referenceStyle: "bracket-numbered",
  requiredStatements: ["funding", "ethics"],
  guidelinesUrl: "https://example.com",
  asOf: "2026-01-01",
  scopeSummary: "Test scope",
};

const withinLimit = checkRules(
  "one two three [1] this work was supported by a grant. ethics approval was obtained.",
  RULES
);
assert(withinLimit.wordCount === 15, `word count, got ${withinLimit.wordCount}`);
assert(withinLimit.withinWordLimit === true, "within word limit (15 <= 20)");
assert(withinLimit.referenceStyleDetected === true, "bracket style should be detected");
assert(withinLimit.statementChecks.find((c) => c.key === "funding")?.found === true, "funding should be found");
assert(withinLimit.statementChecks.find((c) => c.key === "ethics")?.found === true, "ethics should be found");

const overLimitAuthorYear = checkRules(
  "one two three four five six seven eight nine ten eleven twelve (Smith, 2020)",
  { ...RULES, wordLimit: 10 }
);
assert(overLimitAuthorYear.withinWordLimit === false, "over word limit should be false (14 > 10)");
assert(
  overLimitAuthorYear.referenceStyleDetected === false,
  "author-year text should not match a bracket-numbered style"
);

const authorYearRules: JournalRules = { ...RULES, referenceStyle: "author-year" };
const authorYearMatch = checkRules("some text (Smith & Jones, 2019) more text", authorYearRules);
assert(authorYearMatch.referenceStyleDetected === true, "author-year citation should be detected");

const noLimitJournal: JournalRules = { ...RULES, wordLimit: null, referenceStyle: null };
const unchecked = checkRules("anything at all, no brackets, no parens here", noLimitJournal);
assert(unchecked.withinWordLimit === null, "no stated limit should yield null, not true/false");
assert(unchecked.referenceStyleDetected === null, "no style to check should yield null, not a false negative");

const noStatements: JournalRules = { ...RULES, requiredStatements: [] };
assert(checkRules("short text", noStatements).statementChecks.length === 0, "empty requiredStatements -> no checks run");

console.log("rulesCheck.selfcheck: OK");
