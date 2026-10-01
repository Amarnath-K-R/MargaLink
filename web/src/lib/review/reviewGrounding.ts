// The security-relevant anti-fabrication check behind functions/api/review.ts
// (imported there via a relative path \u2014 Cloudflare Pages routes every file
// inside functions/ as an endpoint, so shared code has to live outside it).
// Pulled out specifically because this had zero test coverage before this
// split, despite being the one thing standing between a model hallucinating
// a quote and that quote reaching the client. See docs/ARCHITECTURE.md's
// "The AI review: what it defends against, and why."
import { MAX_DESCRIPTION_CHARS, MAX_MEASURE_CHARS, MAX_QUOTE_CHARS, MAX_UNIT_CHARS, MAX_VALUES } from "./reviewPasses.ts";
import type { ExtractResponse } from "./reviewTypes.ts";

// Per-chunk ceilings on what one extract pass may contribute. Everything is
// also clamped to the synthesis request's field caps (reviewPasses.ts), so a
// grounded-but-oversized item can never make the final step fail with a 400.
const MAX_STATS_PER_CHUNK = 20;
const MAX_NOTES_PER_CHUNK = 5;

// Applied once client-side before sectioning (review.ts's prepareForReview)
// AND again at match time here \u2014 idempotent, so both sides agree, and
// models re-introduce curly quotes on their own. Keeps newlines: sectioning
// depends on them. ponytail: the de-hyphenation also joins a genuine
// compound split at a line end ("well-\nknown" → "wellknown"); it happens on
// both sides identically, so grounding is unaffected \u2014 cosmetic only.
export function normalizeText(s: string): string {
  return s
    .normalize("NFKC")
    .replace(/[\u2018\u2019\u201A]/g, "'")
    .replace(/[\u201C\u201D\u201E]/g, '"')
    .replace(/[\u2013\u2014\u2212]/g, "-")
    .replace(/\u00AD/g, "")
    .replace(/([a-z])-\n([a-z])/g, "$1$2")
    .replace(/[ \t]+/g, " ");
}

export function normalize(s: string): string {
  return normalizeText(s).toLowerCase().replace(/\s+/g, " ").trim();
}

type Loose = Record<string, unknown>;
const isObj = (v: unknown): v is Loose => !!v && typeof v === "object" && !Array.isArray(v);
const isValue = (v: unknown) =>
  isObj(v) && typeof v.value === "number" && Number.isFinite(v.value) && (typeof v.unit === "string" || v.unit === null);

// Strict tool use already guarantees the shape on the wire, but the Function
// must never trust that: a defensive walk is cheap, and a wrong assumption
// here reaches the user as a citation. Quotes are checked against THIS chunk
// only, so a claim is guaranteed to come from the section it's labelled with.
export function groundExtractOutput(output: unknown, chunkText: string, claimsCap: number): ExtractResponse {
  if (!isObj(output) || !Array.isArray(output.claims) || !Array.isArray(output.statisticalReporting) || !Array.isArray(output.notes)) {
    throw new Error("malformed extract output");
  }
  const source = normalize(chunkText);
  const grounded = (q: unknown): q is string => typeof q === "string" && normalize(q).length >= 8 && source.includes(normalize(q));

  const claims: ExtractResponse["claims"] = [];
  for (const c of output.claims) {
    if (claims.length >= claimsCap) break;
    if (!isObj(c) || !grounded(c.quote) || c.quote.length > MAX_QUOTE_CHARS || typeof c.measure !== "string" || !Array.isArray(c.values) || c.values.length === 0 || !c.values.every(isValue)) continue;
    const values = (c.values as ExtractResponse["claims"][number]["values"])
      .slice(0, MAX_VALUES)
      .map((v) => ({ value: v.value, unit: v.unit === null ? null : v.unit.slice(0, MAX_UNIT_CHARS) }));
    claims.push({ quote: c.quote, measure: c.measure.slice(0, MAX_MEASURE_CHARS), values });
  }
  const statisticalReporting: ExtractResponse["statisticalReporting"] = [];
  for (const s of output.statisticalReporting) {
    if (statisticalReporting.length >= MAX_STATS_PER_CHUNK) break;
    if (!isObj(s) || typeof s.description !== "string" || (s.severity !== "minor" && s.severity !== "major") || !grounded(s.quote)) continue;
    statisticalReporting.push({ description: s.description.slice(0, MAX_DESCRIPTION_CHARS), severity: s.severity, quote: s.quote });
  }
  const notes: ExtractResponse["notes"] = [];
  for (const n of output.notes) {
    if (notes.length >= MAX_NOTES_PER_CHUNK) break;
    if (!isObj(n) || typeof n.description !== "string") continue;
    notes.push({ description: n.description.slice(0, MAX_DESCRIPTION_CHARS), quote: grounded(n.quote) ? n.quote : null });
  }
  return { claims, statisticalReporting, notes };
}

// Real, deterministic check \u2014 never trust the model's own claim that a
// quote is verbatim. Fuzzy on whitespace/case only; the substance must
// actually appear in the source, or the finding is dropped before it ever
// reaches the client, not just flagged as suspicious.
export function quoteAppearsInSource(quote: string, source: string): boolean {
  const q = normalize(quote);
  if (q.length < 8) return false; // too short to be a meaningful citation
  return normalize(source).includes(q);
}
