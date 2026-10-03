// Rewrite with Claude: what a request may carry and what an answer must
// keep. Shared by the Function (functions/api/rewrite.ts), which refuses a
// request and checks an answer before charging for it or sending it back,
// and the browser, which builds the request and checks the answer again
// before offering Replace. Pure; rewrite.selfcheck.ts tests every rule.
//
// The passage is the selected paragraphs joined by blank lines, every
// object that isn't prose (a citation, a footnote mark, maths, a picture; in
// LaTeX, \cite, \ref, maths and the like) replaced by a numbered placeholder
// ⟦1⟧…⟦k⟧ in order, which the answer must keep as they were.
import { REWRITE_MAX_WORDS, rewritePrice } from "../accounts/coins.ts";
import { DIALECTS, type Dialect } from "./spelling.ts";

export const TOOLS = ["paraphrase", "tone", "shorten", "expand", "clarity"] as const;
export type Tool = (typeof TOOLS)[number];
export const TONES = ["academic", "concise", "confident", "plain"] as const;
export type Tone = (typeof TONES)[number];
export type RewriteRequest = { tool: Tool; tone: Tone | null; format: "latex" | "text"; dialect: Dialect; passage: string; coins: number };
export type Rewritten = { text: string; notes: string[] };

export const MAX_CHARS = 20_000;
export const MAX_PARAGRAPHS = 60;
export const MAX_PLACEHOLDERS = 300;
const MAX_NOTES = 3;
const MAX_NOTE_CHARS = 240;

const PLACEHOLDER = /⟦(\d+)⟧/g;
const KEYS = ["coins", "dialect", "format", "passage", "tone", "tool"];

/** The passage's words, as charged: placeholders and LaTeX commands aren't words. */
export function rewriteWords(passage: string): number {
  const bare = passage.replace(PLACEHOLDER, " ").replace(/\\[a-zA-Z@]+\*?/g, " ");
  return bare.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu)?.length ?? 0;
}

const paragraphs = (text: string) => text.split(/(?:[ \t]*\n){2,}/).filter((p) => p.trim());

// The placeholders' numbers in order, or null if a bracket stands outside one.
function placeholders(text: string): number[] | null {
  const found = [...text.matchAll(PLACEHOLDER)].map((m) => Number(m[1]));
  return /[⟦⟧]/.test(text.replace(PLACEHOLDER, "")) ? null : found;
}

/** A request as the Function accepts it, or what's wrong with it. */
export function parseRewriteRequest(body: unknown): RewriteRequest | string {
  if (!body || typeof body !== "object" || Array.isArray(body)) return "Expected { tool, tone, format, dialect, passage, coins }.";
  const b = body as Record<string, unknown>;
  if (Object.keys(b).sort().join() !== KEYS.join()) return "Expected exactly { tool, tone, format, dialect, passage, coins }.";
  if (!TOOLS.includes(b.tool as Tool)) return "Unknown tool.";
  if (b.tool === "tone" ? !TONES.includes(b.tone as Tone) : b.tone !== null) return "Change tone takes one of its tones; the other tools take none.";
  if (b.format !== "latex" && b.format !== "text") return "Unknown format.";
  if (!DIALECTS.some((d) => d.id === b.dialect)) return "Unknown English.";
  const passage = b.passage;
  if (typeof passage !== "string") return "Expected the passage as text.";
  if (passage.length > MAX_CHARS) return `Select at most ${MAX_CHARS.toLocaleString("en")} characters.`;
  if (paragraphs(passage).length > MAX_PARAGRAPHS) return `Select at most ${MAX_PARAGRAPHS} paragraphs.`;
  const marks = placeholders(passage);
  if (!marks || marks.some((n, i) => n !== i + 1)) return "The passage's placeholders are out of order.";
  if (marks.length > MAX_PLACEHOLDERS) return "The selection holds too many citations, notes and objects to rewrite at once.";
  const words = rewriteWords(passage);
  if (!words) return "Select some text to rewrite.";
  if (words > REWRITE_MAX_WORDS) return `Select at most ${REWRITE_MAX_WORDS.toLocaleString("en")} words.`;
  if (b.coins !== rewritePrice(words)) return "The price changed. Try again.";
  return { tool: b.tool as Tool, tone: b.tone as Tone | null, format: b.format, dialect: b.dialect as Dialect, passage, coins: b.coins };
}

// Numbers as written (1,000 and 0.05 are one number each), placeholders left out.
const numbers = (text: string) => text.replace(PLACEHOLDER, " ").match(/\d+(?:[.,]\d+)*/g) ?? [];
const count = (items: string[]) => items.reduce((m, x) => m.set(x, (m.get(x) ?? 0) + 1), new Map<string, number>());
const commands = (text: string) => (text.match(/\\(?:[a-zA-Z@]+\*?|[\s\S])/g) ?? []).sort().join(" ");
const tally = (text: string, ch: string) => text.split(ch).length - 1;

/**
 * The answer, checked against what was asked: the cleaned text and notes, or
 * the first problem found (said plainly, as it's passed back to Claude for
 * one more try and may reach the person).
 */
export function checkRewrite(req: RewriteRequest, answer: { text: unknown; notes: unknown }): Rewritten | string {
  if (typeof answer.text !== "string" || !answer.text.trim()) return "The rewrite came back empty.";
  // Word's own line breaks travel as placeholders, so a line break inside a paragraph is a space.
  const text = req.format === "text" ? paragraphs(answer.text).map((p) => p.trim().replace(/\s*\n\s*/g, " ")).join("\n\n") : answer.text.trim();
  if (text === req.passage.trim()) return "The rewrite is the same as the passage.";

  const marks = placeholders(text);
  const want = placeholders(req.passage) ?? [];
  if (!marks || marks.join() !== want.join()) return `Keep every placeholder (${want.map((n) => `⟦${n}⟧`).join(" ") || "none"}) exactly once, in the same order.`;
  if (paragraphs(text).length !== paragraphs(req.passage).length) return `Keep the same number of paragraphs (${paragraphs(req.passage).length}).`;
  const gaps = text.split(PLACEHOLDER).filter((_, i) => i % 2 === 0);
  const wantGaps = req.passage.split(PLACEHOLDER).filter((_, i) => i % 2 === 0);
  for (let i = 0; i < wantGaps.length; i++) {
    if (!wantGaps[i].trim() && gaps[i] !== wantGaps[i]) return "Leave nothing between placeholders that had nothing between them.";
    if (wantGaps[i].trim() && !gaps[i].trim()) return "Keep some words wherever the passage had words between placeholders.";
  }

  const have = count(numbers(req.passage));
  for (const [n, times] of count(numbers(text))) if (times > (have.get(n) ?? 0)) return `The number ${n} isn't in the passage (or not that often): add no numbers.`;

  if (req.format === "latex") {
    if (commands(text) !== commands(req.passage)) return "Keep every LaTeX command exactly as often as the passage has it.";
    for (const ch of ["{", "}", "$", "%", "&"]) if (tally(text, ch) !== tally(req.passage, ch)) return `Keep the passage's ${ch} characters exactly as they are.`;
  }

  const before = rewriteWords(req.passage);
  const after = rewriteWords(text);
  if (req.tool === "shorten" && after >= before) return "Shorten must make the passage shorter.";
  if (req.tool === "expand" && after <= before) return "Expand must make the passage longer.";
  if (after > before * 2.5 + 20) return "The rewrite is far longer than the passage.";

  if (!Array.isArray(answer.notes) || answer.notes.some((n) => typeof n !== "string")) return "Notes must be a list of short texts.";
  const notes = (answer.notes as string[]).map((n) => n.trim().replace(/\s*—\s*/g, ", ")).filter(Boolean);
  if (req.tool !== "clarity" && notes.length) return "Only Clarity and flow gives notes; give none.";
  if (notes.length > MAX_NOTES || notes.some((n) => n.length > MAX_NOTE_CHARS)) return `Give at most ${MAX_NOTES} notes of up to ${MAX_NOTE_CHARS} characters.`;
  return { text, notes };
}
