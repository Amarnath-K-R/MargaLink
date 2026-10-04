// The security-relevant anti-fabrication check behind functions/api/review.ts
// (imported there via a relative path: Cloudflare Pages routes every file
// inside functions/ as an endpoint, so shared code has to live outside it).
// Every quote Claude gives is looked up in the paper the request carried; one
// that isn't there is removed, and a finding left with nothing to point at is
// dropped, before anything reaches the browser. See docs/ARCHITECTURE.md's
// "The AI review: what it defends against, and why."
import { CHECKLIST_GUIDELINES, TIER_PLAN } from "./reviewPrompt.ts";
import { MAX_CHECKLIST_ITEMS, MAX_KEY_NUMBERS, MAX_MEASURE_CHARS, MAX_QUOTE_CHARS, MAX_QUOTES, MAX_TEXT_CHARS, MAX_TITLE_CHARS, clip } from "./reviewLimits.ts";
import {
  CATEGORIES,
  SEVERITIES,
  type Category,
  type ChecklistItem,
  type ChecklistRequest,
  type ChecklistResponse,
  type Finding,
  type PaperChunk,
  type Quote,
  type SectionRequest,
  type SectionResponse,
  type Severity,
} from "./reviewTypes.ts";

// Applied once client-side before sectioning (review.ts's prepareForReview)
// AND again at match time here: idempotent, so both sides agree, and
// models re-introduce curly quotes on their own. Keeps newlines: sectioning
// depends on them. ponytail: the de-hyphenation also joins a genuine
// compound split at a line end ("well-\nknown" → "wellknown"); it happens on
// both sides identically, so grounding is unaffected: cosmetic only.
export function normalizeText(s: string): string {
  return s
    .normalize("NFKC")
    .replace(/[‘’‚]/g, "'")
    .replace(/[“”„]/g, '"')
    .replace(/[–—−]/g, "-")
    .replace(/­/g, "")
    .replace(/([a-z])-\n([a-z])/g, "$1$2")
    .replace(/[ \t]+/g, " ");
}

export function normalize(s: string): string {
  return normalizeText(s).toLowerCase().replace(/\s+/g, " ").trim();
}

// Real, deterministic check: never trust the model's own claim that a quote
// is verbatim. Fuzzy on whitespace/case only; the substance must actually
// appear in the source. `normalized`: the source is already normalize()d.
export function quoteAppearsInSource(quote: string, source: string, normalized = false): boolean {
  const q = normalize(quote);
  if (q.length < 8) return false; // too short to be a meaningful citation
  return (normalized ? source : normalize(source)).includes(q);
}

type Loose = Record<string, unknown>;
const isObj = (v: unknown): v is Loose => !!v && typeof v === "object" && !Array.isArray(v);
const MARKER = /\[redacted\]/gi;
// ponytail: a finding that mentions redaction at all is dropped; a paper about redacted records loses such a finding. Narrow it if that ever matters.
const ABOUT_MARKER = /redact/i;

export type PaperIndex = { id: string; norm: string }[];
export const indexPaper = (paper: PaperChunk[]): PaperIndex => paper.map((c) => ({ id: c.id, norm: normalize(c.text) }));

/** The chunk a quote is in (`prefer` first), or null: not found, too short, too long, or nothing but our redaction marker. */
export function locate(quote: unknown, index: PaperIndex, prefer?: string): string | null {
  if (typeof quote !== "string" || quote.length > MAX_QUOTE_CHARS) return null;
  if (normalize(quote.replace(MARKER, " ")).length < 8) return null;
  const q = normalize(quote);
  const hit = (prefer ? index.find((c) => c.id === prefer && c.norm.includes(q)) : undefined) ?? index.find((c) => c.norm.includes(q));
  return hit?.id ?? null;
}

/** One finding, checked: known severity (one this depth reports) and category, quotes located, or null. */
export function groundFinding(raw: unknown, index: PaperIndex, prefer: string | undefined, severities: readonly Severity[]): Finding | null {
  if (!isObj(raw)) return null;
  const { title, severity, category, quotes, why, suggestion, question, missing } = raw;
  if (typeof title !== "string" || !title.trim() || typeof why !== "string" || typeof suggestion !== "string") return null;
  if (typeof question !== "boolean" || typeof missing !== "boolean" || !Array.isArray(quotes)) return null;
  if (!SEVERITIES.includes(severity as Severity) || !severities.includes(severity as Severity) || !CATEGORIES.includes(category as Category)) return null;
  if (ABOUT_MARKER.test(title) || ABOUT_MARKER.test(why)) return null;
  const found: Quote[] = [];
  for (const q of quotes.slice(0, MAX_QUOTES)) {
    const chunk = locate(q, index, prefer);
    if (chunk && !found.some((x) => x.text === q)) found.push({ text: q as string, chunk });
  }
  if (found.length === 0 && !missing) return null;
  return {
    title: clip(title.trim(), MAX_TITLE_CHARS),
    severity: severity as Severity,
    category: category as Category,
    quotes: found,
    why: clip(why, MAX_TEXT_CHARS),
    suggestion: clip(suggestion, MAX_TEXT_CHARS),
    question,
    missing,
  };
}

export function groundSectionOutput(output: unknown, req: SectionRequest): SectionResponse {
  if (!isObj(output) || typeof output.verdict !== "string" || !Array.isArray(output.findings) || !Array.isArray(output.keyNumbers)) throw new Error("malformed section output");
  const plan = TIER_PLAN[req.tier];
  const index = indexPaper(req.paper);
  const findings = output.findings
    .map((f) => groundFinding(f, index, req.target, plan.severities))
    .filter((f): f is Finding => f !== null)
    .slice(0, plan.maxFindings);
  const keyNumbers: SectionResponse["keyNumbers"] = [];
  for (const k of output.keyNumbers) {
    if (keyNumbers.length >= Math.min(MAX_KEY_NUMBERS, plan.keyNumbers)) break;
    if (!isObj(k) || typeof k.measure !== "string") continue;
    const chunk = locate(k.quote, index, req.target);
    if (chunk) keyNumbers.push({ measure: clip(k.measure, MAX_MEASURE_CHARS), quote: { text: k.quote as string, chunk } });
  }
  return { verdict: clip(output.verdict, MAX_TEXT_CHARS), findings, keyNumbers };
}

export function groundChecklistOutput(output: unknown, req: ChecklistRequest): ChecklistResponse {
  const known = (g: unknown) => g === null || CHECKLIST_GUIDELINES.includes(g as (typeof CHECKLIST_GUIDELINES)[number]);
  if (!isObj(output) || !known(output.guideline) || typeof output.why !== "string" || !Array.isArray(output.items)) throw new Error("malformed checklist output");
  const index = indexPaper(req.paper);
  const items: ChecklistItem[] = [];
  if (output.guideline !== null) {
    for (const it of output.items) {
      if (items.length >= MAX_CHECKLIST_ITEMS) break;
      if (!isObj(it) || typeof it.item !== "string" || !it.item.trim() || (it.status !== "missing" && it.status !== "partial") || typeof it.note !== "string") continue;
      const chunk = locate(it.quote, index);
      items.push({ item: clip(it.item.trim(), MAX_TITLE_CHARS), status: it.status, note: clip(it.note, MAX_TEXT_CHARS), quote: chunk ? { text: it.quote as string, chunk } : null });
    }
  }
  return { guideline: output.guideline as string | null, why: clip(output.why, MAX_TEXT_CHARS), items };
}
