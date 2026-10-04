// The Function's gates for a review's passes (imported by functions/api/review.ts
// and review/start.ts via relative paths): exact-key request validation with
// hard caps, the editor's output kept to findings that exist, and the one
// upstream request every pass shares. Pure: selfchecked, safe in the Worker.
import type { JournalRules } from "../journals/journalRules.ts";
import { groundFinding, indexPaper } from "./reviewGrounding.ts";
import { CHECKLIST_EFFORT, CHECKLIST_INSTRUCTION, CHECKLIST_MAX_TOKENS, REVIEW_SYSTEM, TIER_PLAN, contextBlock, editorInstruction, paperBlock, sectionInstruction, type Effort } from "./reviewPrompt.ts";
import { CHECKLIST_TOOL, EDITOR_TOOL, REVIEW_TOOLS, SECTION_TOOL } from "./reviewTool.ts";
import {
  CHUNK_TEXT_MAX,
  MAX_ACROSS,
  MAX_CHECKLIST_ITEMS,
  MAX_EDITOR_FINDINGS,
  MAX_GUIDANCE_CHARS,
  MAX_KEY_NUMBERS,
  MAX_MEASURE_CHARS,
  MAX_OVERVIEW_CHARS,
  MAX_QUOTE_CHARS,
  MAX_QUOTES,
  MAX_REVIEW_CHUNKS,
  MAX_STRENGTHS,
  MAX_TEXT_CHARS,
  MAX_TITLE_CHARS,
  billedChars,
  clip,
} from "./reviewLimits.ts";
import {
  FIT,
  REVIEW_TIERS,
  SECTION_KINDS,
  SEVERITIES,
  type ChecklistRequest,
  type EditorRequest,
  type EditorResponse,
  type PaperChunk,
  type PassRequest,
  type ReviewTier,
  type SectionKind,
  type SectionRequest,
  type Severity,
  type Verdict,
} from "./reviewTypes.ts";

export const CHUNK_ID = /^s\d+(?:-p\d+)?$/;
export const FINDING_ID = /^(s\d+(?:-p\d+)?)-f(\d+)$/;
export const KEY_ID = /^(s\d+(?:-p\d+)?)-k(\d+)$/;
export const CHECKLIST_ITEM_ID = /^c\d+$/;
// Thorough's checklist pass: tracked in the ticket like a section, under this id.
export const CHECKLIST_ID = "checklist";

type Loose = Record<string, unknown>;
const isObj = (v: unknown): v is Loose => !!v && typeof v === "object" && !Array.isArray(v);
const isTier = (v: unknown): v is ReviewTier => REVIEW_TIERS.includes(v as ReviewTier);
const isKind = (v: unknown): v is SectionKind => SECTION_KINDS.includes(v as SectionKind);
const isInt = (v: unknown): v is number => Number.isInteger(v);
const shortString = (v: unknown, max: number): v is string => typeof v === "string" && v.length <= max;

function keysExactly(o: Loose, keys: string[], where: string): string | null {
  const extra = Object.keys(o).filter((k) => !keys.includes(k));
  if (extra.length) return `unexpected key in ${where}: ${extra.join(", ")}`;
  const missing = keys.filter((k) => !(k in o));
  if (missing.length) return `missing key in ${where}: ${missing.join(", ")}`;
  return null;
}

function parsePaper(p: unknown): PaperChunk[] | string {
  if (!Array.isArray(p) || p.length < 1 || p.length > MAX_REVIEW_CHUNKS) return `paper must list 1 to ${MAX_REVIEW_CHUNKS} sections`;
  const seen = new Set<string>();
  for (const c of p) {
    if (!isObj(c) || keysExactly(c, ["id", "title", "kind", "text"], "paper section")) return "each paper section must have exactly id, title, kind, text";
    if (typeof c.id !== "string" || !CHUNK_ID.test(c.id) || seen.has(c.id)) return "paper section ids must be unique and look like s3 or s3-p2";
    if (!shortString(c.title, 200)) return "a paper section title must be at most 200 characters";
    if (!isKind(c.kind) || c.kind === "references") return "a paper section's kind must be one a review sends";
    if (typeof c.text !== "string" || c.text.length < 1 || c.text.length > CHUNK_TEXT_MAX) return `a paper section's text must be 1 to ${CHUNK_TEXT_MAX} characters`;
    seen.add(c.id);
  }
  return p as PaperChunk[];
}

/** What a pass sends, against what was paid for: each chunk billed as review/start.ts bills it, and the authors' notes. */
export const sentChars = (req: PassRequest) => req.paper.reduce((n, c) => n + billedChars(c.text.length), 0) + req.guidance.length;

// The context every pass of a review carries: a journal id or none, and the authors' notes (may be empty).
function contextError(body: Loose): string | null {
  if (body.journalId !== null && !(typeof body.journalId === "string" && body.journalId.length >= 1 && body.journalId.length <= 64)) return "journalId must be a journal's id, or null for none";
  if (!shortString(body.guidance, MAX_GUIDANCE_CHARS)) return `guidance must be text of at most ${MAX_GUIDANCE_CHARS.toLocaleString("en")} characters`;
  return null;
}

function parseSection(body: Loose): SectionRequest | string {
  const keyErr = keysExactly(body, ["pass", "tier", "journalId", "guidance", "paper", "target"], "request");
  if (keyErr) return keyErr;
  if (!isTier(body.tier)) return "tier must be quick, standard or thorough";
  const ctxErr = contextError(body);
  if (ctxErr) return ctxErr;
  const paper = parsePaper(body.paper);
  if (typeof paper === "string") return paper;
  if (typeof body.target !== "string" || !paper.some((c) => c.id === body.target)) return "target must be the id of a section in the paper";
  return body as unknown as SectionRequest;
}

function parseChecklist(body: Loose): ChecklistRequest | string {
  const keyErr = keysExactly(body, ["pass", "tier", "journalId", "guidance", "paper"], "request");
  if (keyErr) return keyErr;
  if (body.tier !== "thorough") return "the checklist is part of a thorough review only";
  const ctxErr = contextError(body);
  if (ctxErr) return ctxErr;
  const paper = parsePaper(body.paper);
  return typeof paper === "string" ? paper : (body as unknown as ChecklistRequest);
}

function parseEditor(body: Loose): EditorRequest | string {
  const keyErr = keysExactly(body, ["pass", "tier", "journalId", "guidance", "paper", "findings", "keyNumbers", "checklist"], "request");
  if (keyErr) return keyErr;
  if (!isTier(body.tier)) return "tier must be quick, standard or thorough";
  const ctxErr = contextError(body);
  if (ctxErr) return ctxErr;
  const paper = parsePaper(body.paper);
  if (typeof paper === "string") return paper;
  const ids = new Set<string>();
  if (!Array.isArray(body.findings) || body.findings.length > MAX_EDITOR_FINDINGS) return `findings must be at most ${MAX_EDITOR_FINDINGS}`;
  for (const f of body.findings) {
    if (!isObj(f) || keysExactly(f, ["id", "title", "severity", "why", "quotes"], "finding")) return "each finding must have exactly id, title, severity, why, quotes";
    if (typeof f.id !== "string" || !FINDING_ID.test(f.id) || ids.has(f.id)) return "finding ids must be unique and look like s3-f0";
    if (!shortString(f.title, MAX_TITLE_CHARS) || !shortString(f.why, MAX_TEXT_CHARS) || !SEVERITIES.includes(f.severity as Severity)) return "a finding's fields are malformed";
    if (!Array.isArray(f.quotes) || f.quotes.length > MAX_QUOTES || !f.quotes.every((q) => shortString(q, MAX_QUOTE_CHARS))) return "a finding's quotes are malformed";
    ids.add(f.id);
  }
  if (!Array.isArray(body.keyNumbers) || body.keyNumbers.length > MAX_KEY_NUMBERS * MAX_REVIEW_CHUNKS) return "too many key numbers";
  for (const k of body.keyNumbers) {
    if (!isObj(k) || keysExactly(k, ["id", "measure", "quote"], "key number")) return "each key number must have exactly id, measure, quote";
    if (typeof k.id !== "string" || !KEY_ID.test(k.id) || ids.has(k.id)) return "key number ids must be unique and look like s3-k0";
    if (!shortString(k.measure, MAX_MEASURE_CHARS) || !shortString(k.quote, MAX_QUOTE_CHARS)) return "a key number's fields are malformed";
    ids.add(k.id);
  }
  if (!Array.isArray(body.checklist) || body.checklist.length > MAX_CHECKLIST_ITEMS) return `checklist must list at most ${MAX_CHECKLIST_ITEMS} items`;
  if (body.checklist.length > 0 && body.tier !== "thorough") return "the checklist is part of a thorough review only";
  for (const c of body.checklist) {
    if (!isObj(c) || keysExactly(c, ["id", "item"], "checklist item")) return "each checklist item must have exactly id, item";
    if (typeof c.id !== "string" || !CHECKLIST_ITEM_ID.test(c.id) || ids.has(c.id)) return "checklist item ids must be unique and look like c0";
    if (!shortString(c.item, MAX_TITLE_CHARS)) return "a checklist item's name is malformed";
    ids.add(c.id);
  }
  return body as unknown as EditorRequest;
}

export function parsePassRequest(body: unknown): PassRequest | string {
  if (!isObj(body)) return "Expected a JSON object";
  if (body.pass === "section") return parseSection(body);
  if (body.pass === "checklist") return parseChecklist(body);
  if (body.pass === "editor") return parseEditor(body);
  return 'pass must be "section", "checklist" or "editor"';
}

// Counts passes, not reviews: a typical review is 6-12 passes, a 400k-char
// thorough one up to ~60, so 1,500 is well over 100 reviews a day. Checked by
// review/start.ts before anything is charged, and per pass by review.ts.
export const DAILY_PASS_CAP = 1500;

/** The passes a paid review may make: four tries for each reviewed section (and the checklist), and four for the editor. */
export const passBudget = (reviewed: number, checklist: boolean) => ({ sections: 4 * (reviewed + (checklist ? 1 : 0)), editor: 4 });

export type StartRequest = { tier: ReviewTier; journalId: string | null; guidanceChars: number; chunks: { id: string; chars: number; review: boolean }[] };

/** POST /api/review/start's body: every chunk the review sends, as ids and lengths (never text), which are reviewed, and how long the authors' notes are. */
export function parseStartRequest(body: unknown): StartRequest | string {
  if (!isObj(body)) return "Expected a JSON object";
  const keyErr = keysExactly(body, ["tier", "journalId", "guidanceChars", "chunks"], "request");
  if (keyErr) return keyErr;
  if (!isTier(body.tier)) return "tier must be quick, standard or thorough";
  if (body.journalId !== null && !(typeof body.journalId === "string" && body.journalId.length >= 1 && body.journalId.length <= 64)) return "journalId must be a journal's id, or null for none";
  if (!isInt(body.guidanceChars) || body.guidanceChars < 0 || body.guidanceChars > MAX_GUIDANCE_CHARS) return `guidanceChars must be an integer from 0 to ${MAX_GUIDANCE_CHARS}`;
  const c = body.chunks;
  if (!Array.isArray(c) || c.length < 1 || c.length > MAX_REVIEW_CHUNKS) return `chunks must list 1 to ${MAX_REVIEW_CHUNKS} sections`;
  const seen = new Set<string>();
  for (const x of c) {
    if (!isObj(x) || keysExactly(x, ["id", "chars", "review"], "chunk")) return "each chunk must have exactly id, chars, review";
    if (typeof x.id !== "string" || !CHUNK_ID.test(x.id) || seen.has(x.id)) return "chunk ids must be unique and look like s3 or s3-p2";
    if (!isInt(x.chars) || x.chars < 1 || x.chars > CHUNK_TEXT_MAX) return `chunk chars must be an integer from 1 to ${CHUNK_TEXT_MAX}`;
    if (typeof x.review !== "boolean") return "chunk review must be true or false";
    seen.add(x.id);
  }
  if (!c.some((x) => (x as Loose).review === true)) return "at least one section must be reviewed";
  return body as unknown as StartRequest;
}

/**
 * The editor may be shown only findings and key numbers from sections of its
 * ticket that came back, and no more from each than one section pass could
 * return; otherwise a tampered client could send a near-megabyte of findings
 * no paid pass produced. Returns the 400 message, or null.
 */
export function editorOutsideDelivered(req: EditorRequest, delivered: Set<string>): string | null {
  const most = TIER_PLAN[req.tier].maxFindings;
  for (const f of req.findings) {
    const [, chunk, n] = FINDING_ID.exec(f.id)!; // matched in parsing
    if (!delivered.has(chunk)) return `${f.id} is from a section of this review that hasn't come back`;
    if (Number(n) >= most) return `more findings from ${chunk} than its section pass could return`;
  }
  for (const k of req.keyNumbers) {
    const [, chunk, n] = KEY_ID.exec(k.id)!;
    if (!delivered.has(chunk)) return `${k.id} is from a section of this review that hasn't come back`;
    if (Number(n) >= MAX_KEY_NUMBERS) return `more key numbers from ${chunk} than its section pass could return`;
  }
  if (req.checklist.length > 0 && !delivered.has(CHECKLIST_ID)) return "the reporting checklist of this review hasn't come back";
  return null;
}

/**
 * The editor's answer, kept to what exists: ids it was shown (or its own
 * across-paper findings, a1…, whose quotes are found in the paper), each in
 * at most one duplicate group, verdicts on major findings only, and a Fix
 * these first that never names a finding it removed.
 */
export function validateEditorOutput(output: unknown, req: EditorRequest): EditorResponse {
  const plan = TIER_PLAN[req.tier];
  const fit = isObj(output) && isObj(output.journalFit) ? output.journalFit : null;
  if (
    !isObj(output) ||
    !fit ||
    !FIT.includes(fit.assessment as (typeof FIT)[number]) ||
    typeof fit.explanation !== "string" ||
    typeof output.overview !== "string" ||
    !Array.isArray(output.strengths) ||
    !Array.isArray(output.fixFirst) ||
    !Array.isArray(output.duplicates) ||
    !Array.isArray(output.verdicts) ||
    !Array.isArray(output.acrossPaper)
  ) {
    throw new Error("malformed editor output");
  }
  const severity = new Map(req.findings.map((f) => [f.id, f.severity]));
  const grouped = new Set<string>();
  const duplicates: EditorResponse["duplicates"] = [];
  for (const g of output.duplicates) {
    if (!isObj(g) || typeof g.keep !== "string" || !severity.has(g.keep) || grouped.has(g.keep) || !Array.isArray(g.drop)) continue;
    const keep = g.keep;
    const drop = [...new Set(g.drop.filter((id): id is string => typeof id === "string" && severity.has(id) && id !== keep && !grouped.has(id)))];
    if (drop.length === 0) continue;
    for (const id of [keep, ...drop]) grouped.add(id);
    duplicates.push({ keep, drop });
  }
  const verdicts: Verdict[] = [];
  if (plan.verdicts) {
    for (const v of output.verdicts) {
      if (!isObj(v) || typeof v.id !== "string" || severity.get(v.id) !== "major" || verdicts.some((x) => x.id === v.id)) continue;
      const reason = typeof v.reason === "string" ? clip(v.reason, MAX_TEXT_CHARS) : "";
      if (v.action === "keep" || v.action === "drop") verdicts.push({ id: v.id, action: v.action, title: "", why: "", reason });
      else if (v.action === "soften" && typeof v.title === "string" && v.title.trim() && typeof v.why === "string" && v.why.trim()) {
        verdicts.push({ id: v.id, action: "soften", title: clip(v.title.trim(), MAX_TITLE_CHARS), why: clip(v.why, MAX_TEXT_CHARS), reason });
      }
    }
  }
  const acrossPaper: EditorResponse["acrossPaper"] = [];
  if (plan.acrossPaper) {
    const index = indexPaper(req.paper);
    output.acrossPaper.forEach((raw, i) => {
      if (acrossPaper.length >= MAX_ACROSS) return;
      const f = groundFinding(raw, index, undefined, plan.severities);
      // A disagreement between places has to show both.
      if (!f || (f.category === "consistency" && f.quotes.length < 2)) return;
      acrossPaper.push({ ...f, id: `a${i + 1}` });
    });
  }
  const gone = new Set([...duplicates.flatMap((d) => d.drop), ...verdicts.filter((v) => v.action === "drop").map((v) => v.id)]);
  // What to fix first is a major or minor problem; a suggestion never is, whatever the editor ranked.
  const known = new Map<string, Severity>([...severity, ...acrossPaper.map((f) => [f.id, f.severity] as const)]);
  const fixable = (id: unknown): id is string => typeof id === "string" && !gone.has(id) && (known.get(id) ?? "suggestion") !== "suggestion";
  const fixFirst = [...new Set(output.fixFirst.filter(fixable))].slice(0, plan.fixFirst[1]);
  // A checklist item a finding in the report already raises: the item points to it rather than saying it again.
  const items = new Set(req.checklist.map((c) => c.id));
  const checklistCovered: EditorResponse["checklistCovered"] = [];
  for (const pair of Array.isArray(output.checklistCovered) ? output.checklistCovered : []) {
    const [item, by] = typeof pair === "string" ? pair.split(":").map((x) => x.trim()) : [];
    if (!item || !items.has(item) || !by || !known.has(by) || gone.has(by) || checklistCovered.some((x) => x.item === item)) continue;
    checklistCovered.push({ item, by });
  }
  return {
    overview: clip(output.overview, MAX_OVERVIEW_CHARS),
    strengths: output.strengths
      .filter((s): s is string => typeof s === "string" && !!s.trim())
      .slice(0, MAX_STRENGTHS)
      .map((s) => clip(s, MAX_TEXT_CHARS)),
    journalFit: { assessment: fit.assessment as (typeof FIT)[number], explanation: clip(fit.explanation as string, MAX_TEXT_CHARS) },
    fixFirst,
    duplicates,
    verdicts,
    acrossPaper,
    checklistCovered,
  };
}

export type PassConfig = { instruction: string; toolName: string; maxTokens: number; effort: Effort };

// `rules`: the target journal's, or undefined when the authors chose none.
export function passCallConfig(req: PassRequest, rules: JournalRules | undefined): PassConfig {
  const plan = TIER_PLAN[req.tier];
  if (req.pass === "section") {
    const target = req.paper.find((c) => c.id === req.target)!; // checked in parsing
    return { instruction: sectionInstruction(target, req.tier), toolName: SECTION_TOOL.name, maxTokens: plan.sectionMaxTokens, effort: plan.sectionEffort };
  }
  if (req.pass === "checklist") return { instruction: CHECKLIST_INSTRUCTION, toolName: CHECKLIST_TOOL.name, maxTokens: CHECKLIST_MAX_TOKENS, effort: CHECKLIST_EFFORT };
  return { instruction: editorInstruction(req, rules), toolName: EDITOR_TOOL.name, maxTokens: plan.editorMaxTokens, effort: plan.editorEffort };
}

/**
 * The Messages API body for any pass. Tools, system prompt, paper and the
 * review's context (journal, the authors' notes) come first and are
 * identical for every pass of a review, with the cache mark on the context:
 * Anthropic caches that prefix once and every later pass reads it at a tenth
 * of the price. Only the instruction after it differs.
 * No tool_choice: it can't be combined with thinking; the instruction names the tool.
 */
export function upstreamBody(req: PassRequest, cfg: PassConfig, model: string, rules: JournalRules | undefined): Record<string, unknown> {
  return {
    model,
    max_tokens: cfg.maxTokens,
    thinking: { type: "adaptive" },
    output_config: { effort: cfg.effort },
    tools: REVIEW_TOOLS,
    system: REVIEW_SYSTEM,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: paperBlock(req.paper) },
          { type: "text", text: contextBlock(rules, req.guidance), cache_control: { type: "ephemeral" } },
          { type: "text", text: cfg.instruction },
        ],
      },
    ],
  };
}
