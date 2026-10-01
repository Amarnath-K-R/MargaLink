// Rule-based format check — no AI, runs entirely on text already extracted
// in the browser (see extract.ts). Checks general structural completeness,
// not any specific journal's limits (we don't have per-journal formatting
// rules data yet — see plan §6.1). Every detector here is a heuristic over
// free text, not a guarantee; the UI must say "detected", not "confirmed".

export type FormatCheckResult = {
  wordCount: number;
  abstract: { found: boolean; wordCount: number | null; structured: boolean };
  requiredSections: {
    ethics: boolean;
    funding: boolean;
    conflictsOfInterest: boolean;
    dataAvailability: boolean;
  };
  referenceCount: number | null;
  figureCount: number;
  tableCount: number;
};

export function countWords(text: string): number {
  const words = text.trim().match(/\S+/g);
  return words ? words.length : 0;
}

/** Find the Abstract section: from a line that's just "Abstract" (near the
 * top, so we don't match the word appearing later, e.g. in a reference
 * title) to the next heading-like line. Exported for review.ts — an LLM
 * asked to reason about "what does the abstract say" from raw undifferentiated
 * text will infer section boundaries and sometimes infer them wrong; handing
 * it this already-extracted, labeled span instead removes that failure mode
 * at the source rather than hoping the model gets it right. */
export function extractAbstract(fullText: string): { text: string } | null {
  const head = fullText.slice(0, 6000); // abstract is always near the start
  // "Abstract" or "Summary" (The Lancet's word) alone on a line, or "Abstract:" with the text on the same line.
  const startMatch = head.match(/^\s*(?:abstract|summary)\s*:?\s*$/im) ?? head.match(/^\s*abstract\s*[:.—-]\s*(?=\S)/im);
  if (!startMatch || startMatch.index === undefined) return null;

  const afterStart = head.slice(startMatch.index + startMatch[0].length);
  // Optional numbering prefix (1./I./A.) then the heading word — catches
  // "1. Introduction", "I. INTRODUCTION", "Introduction" alike; "Keywords:"
  // may carry its list on the same line. A heading with no abstract text
  // before it is a structured abstract's own first subheading ("Background"
  // on its own line), not the end of the abstract.
  const ENDS = /^\s*(?:[ivx]+\.|[a-z]\.|\d+\.?)?\s*(?:(?:keywords?|key\s*words?)\s*[:—-].*|(?:keywords?|key\s*words?|introduction|background|materials and methods)\s*:?)\s*$/gim;
  const endMatch = [...afterStart.matchAll(ENDS)].find((m) => afterStart.slice(0, m.index).trim().length > 0);
  // ponytail: a heading style this doesn't recognize (rare, but real —
  // reference-style heading detection is inherently open-ended) falls back
  // to a flat window sized to a typical abstract, not the full remaining
  // text, to bound how much unrelated content can leak in. Upgrade: report
  // when this fallback fired so the UI can flag the word count as uncertain.
  const abstractText = endMatch?.index !== undefined ? afterStart.slice(0, endMatch.index) : afterStart.slice(0, 1500);
  return { text: abstractText.trim() };
}

/** A structured abstract has sub-headings like "Background:", "Methods:". */
function isStructuredAbstract(abstractText: string): boolean {
  const headings = /\b(background|objective|purpose|methods?|design|results?|conclusions?|findings)\s*:/gi;
  const matches = abstractText.match(headings);
  return (matches?.length ?? 0) >= 2;
}

export function findSection(fullText: string, patterns: RegExp[]): boolean {
  return patterns.some((p) => p.test(fullText));
}

// Shared with rulesCheck.ts, which detects the same four statement kinds
// against a specific journal's required list instead of this generic one —
// one definition of what each statement "looks like" in extracted text.
export const REQUIRED_STATEMENT_PATTERNS = {
  ethics: [/ethic(al|s)\s+(statement|approval|declaration)/i, /institutional review board|IRB approval/i],
  // Numbered-heading gap ("5. Funding" wouldn't match a bare "^funding$"
  // line) — allow an optional numbering prefix, same as References below.
  funding: [
    /^\s*(?:[ivx]+\.|[a-z]\.|\d+\.?)?\s*funding\s*:?\s*$/im,
    /this (work|research|study) was supported by/i,
    /\bfunding statement\b/i,
  ],
  conflictsOfInterest: [/conflicts? of interest/i, /competing interests?/i, /declaration of interests?/i],
  dataAvailability: [/data availability/i, /availability of data/i, /data sharing statement/i],
} satisfies Record<string, RegExp[]>;

/** References section: numbered entries first ("[1]" / "1."); falls back to
 * counting "(YYYY)" citations if the style isn't numbered (e.g. APA). Both
 * are approximations — labeled as such in the UI, never asserted exact. */
function countReferences(fullText: string): number | null {
  // Optional numbering prefix (1./I./A.) — "5. References" is a common
  // Word-numbered-heading style, and the bare version missed it entirely.
  const headingMatch = fullText.match(
    /^\s*(?:[ivx]+\.|[a-z]\.|\d+\.?)?\s*(references|bibliography|works cited)\s*$/im
  );
  if (!headingMatch || headingMatch.index === undefined) return null;
  const section = fullText.slice(headingMatch.index + headingMatch[0].length);

  const numbered = section.match(/^\s*(?:\[\d{1,3}\]|\d{1,3}[.)])\s+\S/gm);
  if (numbered && numbered.length > 0) return numbered.length;

  const yearCited = section.match(/\(\d{4}[a-z]?\)/g);
  return yearCited ? yearCited.length : null;
}

/** Counts unique figure/table numbers referenced (a figure is usually cited
 * several times in text — "Figure 2" appears repeatedly — so this is the
 * count of distinct numbers seen, not the raw match count). Handles both
 * "Figure 2" and plural lists like "Figures 1 and 2" / "Tables 1, 2 and 3"
 * — the singular-only version silently dropped every number in a plural
 * reference, since "Figures" doesn't match a pattern anchored on "Figure". */
function countUniqueNumbered(fullText: string, label: string): number {
  const numbers = new Set<number>();
  const re = new RegExp(`\\b(?:${label})s?\\.?\\s*((?:\\d+\\s*(?:[-–,]|and)\\s*)*\\d+)`, "gi");
  for (const m of fullText.matchAll(re)) {
    const nums = m[1].match(/\d+/g);
    if (nums) for (const n of nums) numbers.add(parseInt(n, 10));
  }
  return numbers.size;
}

export function checkFormat(fullText: string): FormatCheckResult {
  const abstract = extractAbstract(fullText);
  return {
    wordCount: countWords(fullText),
    abstract: {
      found: abstract !== null,
      wordCount: abstract ? countWords(abstract.text) : null,
      structured: abstract ? isStructuredAbstract(abstract.text) : false,
    },
    requiredSections: {
      ethics: findSection(fullText, REQUIRED_STATEMENT_PATTERNS.ethics),
      funding: findSection(fullText, REQUIRED_STATEMENT_PATTERNS.funding),
      conflictsOfInterest: findSection(fullText, REQUIRED_STATEMENT_PATTERNS.conflictsOfInterest),
      dataAvailability: findSection(fullText, REQUIRED_STATEMENT_PATTERNS.dataAvailability),
    },
    referenceCount: countReferences(fullText),
    figureCount: countUniqueNumbered(fullText, "Fig(?:ure)?"),
    tableCount: countUniqueNumbered(fullText, "Table"),
  };
}
