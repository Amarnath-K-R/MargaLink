// Shared between the browser (reviewOrchestrator.ts, reviewReport.ts, the
// review components) and the Pages Function (functions/api/review.ts, via
// reviewPasses.ts). Pure types and const arrays: safe to bundle into the
// Worker (docs/ARCHITECTURE.md's invariant on what functions/ may import).

// A passage a finding rests on, as the user sees it: the quote, verified by the
// server, and the section it was found in.
export type Citation = { quote: string; section: string; sectionId: string };

export const REVIEW_TIERS = ["quick", "standard", "thorough"] as const;
export type ReviewTier = (typeof REVIEW_TIERS)[number];

// "body" = a section the document marks with a heading that isn't a standard one.
export const SECTION_KINDS = ["abstract", "introduction", "methods", "results", "discussion", "body", "references", "supplement", "other"] as const;
export type SectionKind = (typeof SECTION_KINDS)[number];
// A heading line the document's own structure marks: level 1 starts a section, level 2 is a subsection.
export type HeadingHint = { text: string; level: 1 | 2 };
export type Section = { id: string; title: string; kind: SectionKind; text: string; charStart: number; charEnd: number };
export type Chunk = { id: string; sectionId: string; title: string; kind: SectionKind; part: number; parts: number; text: string };

export const SEVERITIES = ["major", "minor", "suggestion"] as const;
export type Severity = (typeof SEVERITIES)[number];
export const CATEGORIES = ["design", "analysis", "reporting", "consistency", "claims", "clarity", "figures"] as const;
export type Category = (typeof CATEGORIES)[number];
export const FIT = ["good", "possible", "poor"] as const;
export type JournalFit = { assessment: (typeof FIT)[number]; explanation: string };

// The paper as every pass carries it: each included chunk, in order (never references).
export type PaperChunk = { id: string; title: string; kind: SectionKind; text: string };
// A quote, found in the paper: the chunk it is in.
export type Quote = { text: string; chunk: string };
export type Finding = { title: string; severity: Severity; category: Category; quotes: Quote[]; why: string; suggestion: string; question: boolean; missing: boolean };

export type SectionRequest = { pass: "section"; tier: ReviewTier; paper: PaperChunk[]; target: string };
export type SectionResponse = { verdict: string; findings: Finding[]; keyNumbers: { measure: string; quote: Quote }[] };

export type ChecklistRequest = { pass: "checklist"; tier: "thorough"; paper: PaperChunk[] };
export type ChecklistItem = { item: string; status: "missing" | "partial"; note: string; quote: Quote | null };
export type ChecklistResponse = { guideline: string | null; why: string; items: ChecklistItem[] };

// What the editor is shown of each section finding, by id (s3-f0: chunk s3, its first finding).
export type EditorFinding = { id: string; title: string; severity: Severity; why: string; quotes: string[] };
export type EditorRequest = {
  pass: "editor";
  tier: ReviewTier;
  journalId: string;
  paper: PaperChunk[];
  findings: EditorFinding[];
  keyNumbers: { id: string; measure: string; quote: string }[]; // id s3-k0
};
export type Verdict = { id: string; action: "keep" | "soften" | "drop"; title: string; why: string; reason: string };
export type EditorResponse = {
  overview: string;
  strengths: string[];
  journalFit: JournalFit;
  fixFirst: string[]; // section finding ids, or a1, a2, … for its own across-paper findings
  duplicates: { keep: string; drop: string[] }[];
  verdicts: Verdict[];
  acrossPaper: (Finding & { id: string })[];
};
export type PassRequest = SectionRequest | ChecklistRequest | EditorRequest;

export type Coverage = {
  reviewed: { id: string; title: string }[];
  failed: { id: string; title: string; reason: string }[];
  pending: { id: string; title: string }[]; // planned but not reached (cancelled or stopped)
  skipped: { id: string; title: string }[]; // read for context only at this depth, or excluded by the user
};

// The report the browser builds from the passes (reviewReport.ts): shown, kept and exported.
export type ShownFinding = Finding & { id: string; citations: Citation[]; softened: boolean };
export type ReportSection = { id: string; title: string; status: "done" | "failed" | "pending"; reason: string | null; verdict: string | null; findings: ShownFinding[] };
export type ReviewReport = {
  version: 2;
  tier: ReviewTier;
  journalName: string;
  createdAt: string;
  overview: { text: string; strengths: string[]; journalFit: JournalFit } | null; // null until the editor has run
  fixFirst: { id: string; title: string; severity: Severity; section: string }[];
  sections: ReportSection[];
  acrossPaper: ShownFinding[];
  checklist: { guideline: string | null; why: string; items: (Omit<ChecklistItem, "quote"> & { citation: Citation | null })[] } | null;
  coverage: Coverage & { setAside: number };
};
export type ReviewProgress = { phase: "sections" | "editor"; done: number; total: number; current: string | null; partial: ReviewReport };
