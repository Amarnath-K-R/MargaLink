// The Function's gates for the two review passes (imported by
// functions/api/review.ts via a relative path): exact-key request validation
// with hard caps, the synthesis-output check that makes a fabricated
// cross-reference impossible, and the per-pass model config. Pure — no
// window, no fetch — so it's selfchecked and safe to bundle into the Worker.
import type { JournalRules } from "./journalRules.ts";
import { EXTRACT_EFFORT, EXTRACT_MAX_TOKENS, TIER_PLAN, buildExtractPrompt, buildSynthesizePrompt } from "./reviewPrompt.ts";
import { EXTRACT_TOOL, SYNTHESIZE_TOOL } from "./reviewTool.ts";
import {
  REVIEW_TIERS,
  SECTION_KINDS,
  type ExtractRequest,
  type PassRequest,
  type ReviewTier,
  type SectionKind,
  type SynthesizeRequest,
  type SynthesizeResponse,
} from "./reviewTypes.ts";

export const CHUNK_TEXT_MAX = 24_000;
export const MAX_LEDGER = 1_000;
export const MAX_ABSTRACT_CHARS = 8_000;
export const MAX_STATS_FINDINGS = 200;
export const MAX_NOTES = 100;
export const MAX_PAPER_SECTIONS = 200;
export const MAX_QUOTE_CHARS = 400;
export const MAX_MEASURE_CHARS = 120;
export const MAX_DESCRIPTION_CHARS = 400;
export const MAX_VALUES = 12;
export const MAX_UNIT_CHARS = 40;
export const CHUNK_ID = /^s\d+(?:-p\d+)?$/;
export const ITEM_ID = /^s\d+(?:-p\d+)?-(?:c|st|n)\d+$/;

type Loose = Record<string, unknown>;
const isObj = (v: unknown): v is Loose => !!v && typeof v === "object" && !Array.isArray(v);
const isTier = (v: unknown): v is ReviewTier => REVIEW_TIERS.includes(v as ReviewTier);
const isKind = (v: unknown): v is SectionKind => SECTION_KINDS.includes(v as SectionKind);
const isInt = (v: unknown): v is number => Number.isInteger(v);
const shortString = (v: unknown, max: number): v is string => typeof v === "string" && v.length <= max;
const isValues = (v: unknown) =>
  Array.isArray(v) &&
  v.length <= MAX_VALUES &&
  v.every(
    (x) =>
      isObj(x) &&
      Object.keys(x).length === 2 &&
      typeof x.value === "number" &&
      Number.isFinite(x.value) &&
      ((typeof x.unit === "string" && x.unit.length <= MAX_UNIT_CHARS) || x.unit === null)
  );

function keysExactly(o: Loose, keys: string[], where: string): string | null {
  const extra = Object.keys(o).filter((k) => !keys.includes(k));
  if (extra.length) return `unexpected key in ${where}: ${extra.join(", ")}`;
  const missing = keys.filter((k) => !(k in o));
  if (missing.length) return `missing key in ${where}: ${missing.join(", ")}`;
  return null;
}

function parseExtract(body: Loose): ExtractRequest | string {
  const keyErr = keysExactly(body, ["pass", "tier", "claimsCap", "chunk"], "request");
  if (keyErr) return keyErr;
  if (!isTier(body.tier)) return "tier must be quick, standard or thorough";
  const cap = TIER_PLAN[body.tier].claimsCap;
  if (!isInt(body.claimsCap) || body.claimsCap < 1 || body.claimsCap > cap) return `claimsCap must be an integer between 1 and ${cap}`;
  const c = body.chunk;
  if (!isObj(c)) return "chunk must be an object";
  const chunkErr = keysExactly(c, ["id", "title", "kind", "part", "parts", "text"], "chunk");
  if (chunkErr) return chunkErr;
  if (typeof c.id !== "string" || !CHUNK_ID.test(c.id)) return "chunk id must look like s3 or s3-p2";
  if (!shortString(c.title, 200)) return "chunk title must be a string of at most 200 characters";
  if (!isKind(c.kind)) return "chunk kind is not a known section kind";
  if (!isInt(c.part) || !isInt(c.parts) || c.part < 1 || c.part > c.parts) return "chunk part/parts must be integers with 1 ≤ part ≤ parts";
  if (typeof c.text !== "string" || c.text.length < 1) return "chunk text must be a non-empty string";
  if (c.text.length > CHUNK_TEXT_MAX) return `chunk text too long (max ${CHUNK_TEXT_MAX} characters)`;
  return body as unknown as ExtractRequest;
}

function parseSynthesize(body: Loose): SynthesizeRequest | string {
  const keyErr = keysExactly(body, ["pass", "journalId", "tier", "paperMap", "abstractText", "ledger", "statsFindings", "notes"], "request");
  if (keyErr) return keyErr;
  if (!shortString(body.journalId, 64)) return "journalId must be a string";
  if (!isTier(body.tier)) return "tier must be quick, standard or thorough";

  const pm = body.paperMap;
  if (!isObj(pm) || keysExactly(pm, ["title", "totalWords", "sections"], "paperMap")) return "paperMap must have exactly title, totalWords, sections";
  if (!(pm.title === null || shortString(pm.title, 200))) return "paperMap.title must be null or at most 200 characters";
  if (!isInt(pm.totalWords)) return "paperMap.totalWords must be an integer";
  const sectionOk = (s: unknown) =>
    isObj(s) && !keysExactly(s, ["id", "title", "kind", "words"], "section") && typeof s.id === "string" && /^s\d+$/.test(s.id) && shortString(s.title, 200) && isKind(s.kind) && isInt(s.words);
  if (!Array.isArray(pm.sections) || pm.sections.length > MAX_PAPER_SECTIONS || !pm.sections.every(sectionOk)) return "paperMap.sections is malformed";

  if (!(body.abstractText === null || shortString(body.abstractText, MAX_ABSTRACT_CHARS))) return `abstractText must be null or at most ${MAX_ABSTRACT_CHARS} characters`;

  // Ids are unique across ledger, stats and notes: summary refs can point at any of them.
  const ids = new Set<string>();
  const claimId = (id: unknown): string | null => {
    if (typeof id !== "string" || !ITEM_ID.test(id)) return `invalid id: ${String(id)}`;
    if (ids.has(id)) return `duplicate id: ${id}`;
    ids.add(id);
    return null;
  };

  if (!Array.isArray(body.ledger) || body.ledger.length > MAX_LEDGER) return `ledger must be an array of at most ${MAX_LEDGER} entries`;
  for (const x of body.ledger) {
    if (!isObj(x) || keysExactly(x, ["id", "section", "quote", "measure", "values"], "ledger entry")) return "each ledger entry must have exactly id, section, quote, measure, values";
    const idErr = claimId(x.id);
    if (idErr) return `ledger ${idErr}`;
    if (!shortString(x.section, 200) || !shortString(x.quote, MAX_QUOTE_CHARS) || !shortString(x.measure, MAX_MEASURE_CHARS)) return "ledger entry strings exceed their limits";
    if (!isValues(x.values)) return `ledger entry values must be up to ${MAX_VALUES} { value: finite number, unit: string of at most ${MAX_UNIT_CHARS} characters | null }`;
  }
  if (!Array.isArray(body.statsFindings) || body.statsFindings.length > MAX_STATS_FINDINGS) return `statsFindings must be an array of at most ${MAX_STATS_FINDINGS} entries`;
  for (const x of body.statsFindings) {
    if (!isObj(x) || keysExactly(x, ["id", "section", "description", "severity"], "stats finding")) return "each stats finding must have exactly id, section, description, severity";
    const idErr = claimId(x.id);
    if (idErr) return `stats finding ${idErr}`;
    if (!shortString(x.section, 200) || !shortString(x.description, MAX_DESCRIPTION_CHARS) || (x.severity !== "minor" && x.severity !== "major")) return "stats finding fields are malformed";
  }
  if (!Array.isArray(body.notes) || body.notes.length > MAX_NOTES) return `notes must be an array of at most ${MAX_NOTES} entries`;
  for (const x of body.notes) {
    if (!isObj(x) || keysExactly(x, ["id", "section", "description"], "note")) return "each note must have exactly id, section, description";
    const idErr = claimId(x.id);
    if (idErr) return `note ${idErr}`;
    if (!shortString(x.section, 200) || !shortString(x.description, MAX_DESCRIPTION_CHARS)) return "note fields are malformed";
  }
  return body as unknown as SynthesizeRequest;
}

// Returns the parsed request, or a string that is the 400 message.
export function parsePassRequest(body: unknown): PassRequest | string {
  if (!isObj(body)) return "Expected a JSON object";
  if (body.pass === "extract") return parseExtract(body);
  if (body.pass === "synthesize") return parseSynthesize(body);
  return 'pass must be "extract" or "synthesize"';
}

// The synthesis model never sees a quote it could fabricate: it can only
// point at ledger ids, and any id not in the submitted ledger is dropped here.
// An inconsistency needs two places, so fewer than two surviving ids drops it.
export function validateSynthesisOutput(output: unknown, req: SynthesizeRequest): SynthesizeResponse {
  const fit = isObj(output) && isObj(output.journalFit) ? output.journalFit : null;
  if (
    !isObj(output) ||
    !fit ||
    (fit.assessment !== "good" && fit.assessment !== "possible" && fit.assessment !== "poor") ||
    typeof fit.explanation !== "string" ||
    !Array.isArray(output.inconsistencies) ||
    !Array.isArray(output.summary) ||
    !Array.isArray(output.otherObservations)
  ) {
    throw new Error("malformed synthesis output");
  }
  const ledgerIds = new Set(req.ledger.map((e) => e.id));
  const anyIds = new Set([...ledgerIds, ...req.statsFindings.map((s) => s.id), ...req.notes.map((n) => n.id)]);
  const onlyKnown = (ids: unknown, known: Set<string>) =>
    Array.isArray(ids) ? [...new Set(ids.filter((i): i is string => typeof i === "string" && known.has(i)))] : [];

  const inconsistencies: SynthesizeResponse["inconsistencies"] = [];
  for (const f of output.inconsistencies) {
    if (!isObj(f) || typeof f.description !== "string") continue;
    const claimIds = onlyKnown(f.claimIds, ledgerIds);
    if (claimIds.length >= 2) inconsistencies.push({ description: f.description, claimIds });
  }
  const summary: SynthesizeResponse["summary"] = [];
  for (const s of output.summary) {
    if (summary.length >= 8) break;
    if (!isObj(s) || typeof s.text !== "string" || (s.severity !== "major" && s.severity !== "minor")) continue;
    summary.push({ text: s.text, severity: s.severity, refs: onlyKnown(s.refs, anyIds) });
  }
  return {
    journalFit: { assessment: fit.assessment, explanation: fit.explanation },
    inconsistencies,
    summary,
    otherObservations: output.otherObservations.filter((x): x is string => typeof x === "string").slice(0, 15),
  };
}

export function passCallConfig(req: PassRequest, rules: JournalRules | undefined) {
  if (req.pass === "extract") {
    return { prompt: buildExtractPrompt(req.chunk, req.claimsCap), tool: EXTRACT_TOOL, maxTokens: EXTRACT_MAX_TOKENS, effort: EXTRACT_EFFORT };
  }
  if (!rules) throw new Error("synthesis requires the journal's rules");
  const plan = TIER_PLAN[req.tier];
  return { prompt: buildSynthesizePrompt(req, rules), tool: SYNTHESIZE_TOOL, maxTokens: plan.synthMaxTokens, effort: plan.synthEffort };
}
