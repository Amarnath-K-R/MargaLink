// Shared between the client (reviewOrchestrator.ts, review.ts, ReviewConsent.tsx,
// ReviewResultPanel.tsx, app/review/page.tsx) and the Cloudflare Pages Function
// that actually calls Claude (functions/api/review.ts, via reviewPasses.ts) — the only src/lib/ module functions/
// imports purely for its type contract (figureSchema.ts/figurePrompt.ts, the
// figure generator's equivalents, carry real logic alongside their types, so
// they don't count as "purely"). Pure types + one const array, no
// window/localStorage/fetch, so it's safe to bundle into the Worker. See
// docs/ARCHITECTURE.md's note on the invariant this depends on: functions/
// may only import src/lib/ modules that are pure/isomorphic like this one.

// Every finding shown to the user cites the exact source text it's built on —
// a description alone lets the model drift into paraphrase-that-becomes-
// fabrication (verified against a real manuscript: it attributed numbers to
// the abstract that were only ever in the Results tables). Every quote is
// verified against the chunk it came from (reviewGrounding.ts), and
// cross-section findings can only cite ledger ids (reviewPasses.ts).
export type Citation = { quote: string; section: string };

// Three review depths — see TIER_PLAN in reviewPrompt.ts for what each one
// extracts and how hard synthesis reasons.
export const REVIEW_TIERS = ["quick", "standard", "thorough"] as const;
export type ReviewTier = (typeof REVIEW_TIERS)[number];

export const SECTION_KINDS = ["abstract", "introduction", "methods", "results", "discussion", "references", "supplement", "other"] as const;
export type SectionKind = (typeof SECTION_KINDS)[number];
export type Section = { id: string; title: string; kind: SectionKind; text: string; charStart: number; charEnd: number };
export type Chunk = { id: string; sectionId: string; title: string; kind: SectionKind; part: number; parts: number; text: string };
export type PaperMap = { title: string | null; totalWords: number; sections: { id: string; title: string; kind: SectionKind; words: number }[] };

export type ClaimValue = { value: number; unit: string | null };
export type ExtractRequest = { pass: "extract"; tier: ReviewTier; claimsCap: number; chunk: Omit<Chunk, "sectionId"> };
export type ExtractResponse = {
  claims: { quote: string; measure: string; values: ClaimValue[] }[];
  statisticalReporting: { description: string; severity: "minor" | "major"; quote: string }[];
  notes: { description: string; quote: string | null }[];
};

export type LedgerEntry = { id: string; section: string; quote: string; measure: string; values: ClaimValue[] };
export type SynthesizeRequest = {
  pass: "synthesize";
  journalId: string;
  tier: ReviewTier;
  paperMap: PaperMap;
  abstractText: string | null;
  ledger: LedgerEntry[];
  statsFindings: { id: string; section: string; description: string; severity: "minor" | "major" }[];
  notes: { id: string; section: string; description: string }[];
};
export type SynthesizeResponse = {
  journalFit: { assessment: "good" | "possible" | "poor"; explanation: string };
  inconsistencies: { description: string; claimIds: string[] }[];
  summary: { text: string; severity: "major" | "minor"; refs: string[] }[];
  otherObservations: string[];
};
export type PassRequest = ExtractRequest | SynthesizeRequest;

export type Coverage = {
  reviewed: { id: string; title: string }[];
  failed: { id: string; title: string; reason: string }[];
  skipped: { id: string; title: string }[];
};
export type ReviewResult = {
  journalFit: SynthesizeResponse["journalFit"] | null; // null until synthesis succeeds
  summary: { text: string; severity: "major" | "minor"; citations: Citation[] }[];
  inconsistencies: { description: string; citations: Citation[] }[];
  statisticalReporting: { description: string; severity: "minor" | "major"; citations: Citation[] }[];
  otherObservations: string[];
  coverage: Coverage;
};
export type ReviewProgress = { phase: "extract" | "synthesize"; done: number; total: number; current: string | null; partial: ReviewResult };
