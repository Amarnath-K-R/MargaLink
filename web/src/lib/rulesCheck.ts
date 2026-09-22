// Checks extracted paper text against one journal's hand-curated
// guidelines (journalRules.ts) — same rule-based, no-AI approach as
// formatCheck.ts, reusing its word-count and section-detection helpers and
// its statement-pattern definitions rather than redefining them.
import { countWords, findSection, REQUIRED_STATEMENT_PATTERNS } from "./formatCheck.ts";
import { REQUIRED_STATEMENT_LABELS, type JournalRules, type RequiredStatementKey } from "./journalRules.ts";

export type RulesCheckResult = {
  journalName: string;
  articleTypeLabel: string;
  wordCount: number;
  wordLimit: number | null;
  withinWordLimit: boolean | null; // null when the journal states no limit
  referenceStyleChecked: "bracket-numbered" | "author-year" | null; // null = not reliably checkable
  referenceStyleDetected: boolean | null;
  statementChecks: { key: RequiredStatementKey; label: string; found: boolean }[];
  guidelinesUrl: string;
  asOf: string;
};

/** "[19]", "[3, 4]", "[1]-[3]" — the bracket-numbered citation family
 * (Vancouver, IEEE). A plain author-year parenthetical never matches this. */
function looksBracketNumbered(fullText: string): boolean {
  return /\[\d{1,3}(?:\s*[,\-–]\s*\d{1,3})*\]/.test(fullText);
}

/** "(Smith, 2020)", "(Smith & Jones, 2020)", "(Smith et al., 2020)" — the
 * author-year family (Harvard/APA-like). */
function looksAuthorYear(fullText: string): boolean {
  return /\([A-Z][\p{L}'-]+(?:\s+(?:&|and|et al\.?,?)\s*[\p{L}'-]*)?,?\s+\d{4}[a-z]?\)/u.test(fullText);
}

export function checkRules(fullText: string, rules: JournalRules): RulesCheckResult {
  const wordCount = countWords(fullText);
  const referenceStyleDetected =
    rules.referenceStyle === "bracket-numbered"
      ? looksBracketNumbered(fullText)
      : rules.referenceStyle === "author-year"
        ? looksAuthorYear(fullText)
        : null;

  return {
    journalName: rules.journalName,
    articleTypeLabel: rules.articleTypeLabel,
    wordCount,
    wordLimit: rules.wordLimit,
    withinWordLimit: rules.wordLimit == null ? null : wordCount <= rules.wordLimit,
    referenceStyleChecked: rules.referenceStyle,
    referenceStyleDetected,
    statementChecks: rules.requiredStatements.map((key) => ({
      key,
      label: REQUIRED_STATEMENT_LABELS[key],
      found: findSection(fullText, REQUIRED_STATEMENT_PATTERNS[key]),
    })),
    guidelinesUrl: rules.guidelinesUrl,
    asOf: rules.asOf,
  };
}
