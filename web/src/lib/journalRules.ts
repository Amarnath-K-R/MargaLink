// Hand-curated pilot set of real journal submission guidelines — a scoped
// v1 instead of the deferred "scrape thousands of publisher sites" plan
// (see journal-finder-plan.md). Every number here was verified against the
// journal's own current author-guidelines page, not guessed — `guidelinesUrl`
// and `asOf` let a reader check it themselves, and this data goes stale the
// way any snapshot does, so the UI must say "as published on <date>", never
// assert it's current forever.
//
// `referenceStyle` is only set when the citation format is something plain
// extracted text can actually reveal (bracketed numbers, author-year
// parentheses). Superscript numbered styles (JAMA/AMA, Nature) collapse to
// indistinguishable plain digits once a PDF's text layer is extracted —
// there is no reliable way to detect them, so those journals leave this
// field unset rather than claim a check that isn't real.
export type RequiredStatementKey = "ethics" | "funding" | "conflictsOfInterest" | "dataAvailability";

export type JournalRules = {
  journalId: string; // OpenAlex short id — matches JournalMeta.id via shortId()
  journalName: string;
  articleTypeLabel: string; // which article type these numbers apply to
  wordLimit: number | null; // null = no restriction stated
  referenceStyle: "bracket-numbered" | "author-year" | null;
  requiredStatements: RequiredStatementKey[];
  guidelinesUrl: string;
  asOf: string; // ISO date this entry was last verified against the source
  // One factual line on scope/audience — grounds the LLM review's journal-fit
  // assessment (see review.ts) in something more specific than the journal's
  // name. Not shown as a guarantee of fit, just context for the assessment.
  scopeSummary: string;
};

export const REQUIRED_STATEMENT_LABELS: Record<RequiredStatementKey, string> = {
  ethics: "Ethics/IRB approval statement",
  funding: "Funding statement",
  conflictsOfInterest: "Conflicts of interest / competing interests statement",
  dataAvailability: "Data availability statement",
};

const ASOF = "2026-09-18";

export const JOURNAL_RULES: JournalRules[] = [
  {
    journalId: "S172573765",
    journalName: "JAMA",
    articleTypeLabel: "Original Investigation",
    wordLimit: 3000,
    referenceStyle: null, // AMA style — superscript numbers, not detectable from plain text
    requiredStatements: ["funding", "conflictsOfInterest", "dataAvailability", "ethics"],
    guidelinesUrl: "https://jamanetwork.com/journals/jama/pages/instructions-for-authors",
    asOf: ASOF,
    scopeSummary: "General medicine — high-impact clinical research, broad readership across specialties.",
  },
  {
    journalId: "S202381698",
    journalName: "PLoS ONE",
    articleTypeLabel: "Research Article",
    wordLimit: null,
    referenceStyle: "bracket-numbered", // Vancouver/ICMJE style, e.g. "[19]"
    requiredStatements: ["funding", "conflictsOfInterest", "dataAvailability", "ethics"],
    guidelinesUrl: "https://journals.plos.org/plosone/s/submission-guidelines",
    asOf: ASOF,
    scopeSummary: "Multidisciplinary open access — publishes technically sound work in any scientific field, no novelty or impact bar.",
  },
  {
    journalId: "S2738950867",
    journalName: "Cureus",
    articleTypeLabel: "Original Article",
    wordLimit: null,
    referenceStyle: "bracket-numbered",
    requiredStatements: ["ethics", "conflictsOfInterest", "funding"],
    guidelinesUrl: "https://www.cureus.com/author_guide",
    asOf: ASOF,
    scopeSummary: "Medical education and case-based content — rapid publication, case reports and smaller clinical studies.",
  },
  {
    journalId: "S200437886",
    journalName: "BMC Public Health",
    articleTypeLabel: "Research Article",
    wordLimit: null,
    referenceStyle: "bracket-numbered",
    requiredStatements: ["ethics", "conflictsOfInterest", "funding", "dataAvailability"],
    guidelinesUrl: "https://link.springer.com/journal/12889/submission-guidelines",
    asOf: ASOF,
    scopeSummary: "Public health research — epidemiology, health policy, and health services across populations.",
  },
  {
    journalId: "S2485537415",
    journalName: "IEEE Access",
    articleTypeLabel: "Regular Article",
    wordLimit: null,
    referenceStyle: "bracket-numbered",
    requiredStatements: [], // no standardized mandatory declarations section confirmed
    guidelinesUrl: "https://ieeeaccess.ieee.org/authors/submission-guidelines/",
    asOf: ASOF,
    scopeSummary: "Multidisciplinary engineering and computer science — broad scope, emphasis on practical/applied contributions.",
  },
  {
    journalId: "S9692511",
    journalName: "Frontiers in Psychology",
    articleTypeLabel: "Original Research",
    wordLimit: 12000,
    referenceStyle: null, // Frontiers uses Harvard OR Vancouver depending on the section — not uniform enough to check
    requiredStatements: ["ethics", "conflictsOfInterest", "funding"],
    guidelinesUrl: "https://www.frontiersin.org/journals/psychology/for-authors/author-guidelines",
    asOf: ASOF,
    scopeSummary: "Psychology across all subfields — broad scope, open peer review process.",
  },
  {
    journalId: "S64187185",
    journalName: "Nature Communications",
    articleTypeLabel: "Article",
    wordLimit: 5000,
    referenceStyle: null, // Nature style — superscript numbers, not detectable from plain text
    requiredStatements: ["conflictsOfInterest", "dataAvailability", "funding"],
    guidelinesUrl: "https://www.nature.com/ncomms/submit/article",
    asOf: ASOF,
    scopeSummary: "Multidisciplinary — significant advances of interest to specialists within a field, high novelty bar.",
  },
  {
    journalId: "S196734849",
    journalName: "Scientific Reports",
    articleTypeLabel: "Article",
    wordLimit: 4500,
    referenceStyle: "bracket-numbered",
    requiredStatements: ["conflictsOfInterest", "dataAvailability", "funding"],
    guidelinesUrl: "https://www.nature.com/srep/author-instructions/submission-guidelines",
    asOf: ASOF,
    scopeSummary: "Multidisciplinary, Nature-family — technically sound original research, no novelty/impact bar (similar spirit to PLOS ONE).",
  },
];

// Accepts either form — a MatchResult's `id` is the full OpenAlex URL
// (https://openalex.org/S172573765), but journalId above is stored short.
export function findJournalRules(openAlexIdOrShort: string): JournalRules | undefined {
  const short = openAlexIdOrShort.split("/").pop() ?? openAlexIdOrShort;
  return JOURNAL_RULES.find((r) => r.journalId === short);
}
