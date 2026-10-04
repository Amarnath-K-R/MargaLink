// Client side of the LLM review feature, one of three features in the app
// that send something off the device (see CLAUDE.md's privacy rules), and
// the one that sends a whole paper's text; figure.ts sends a spreadsheet's
// column names/types and the user's request, never its values, and Rewrite
// (writing/rewriteClient.ts) only a passage the person selected. This module owns what happens to
// the text before anything is sent (stripping, normalization, the size
// ceiling); reviewOrchestrator.ts pays for the review and does the sending.
// Callers MUST get explicit consent (components/review/ReviewConsent.tsx) before
// calling runReview() — neither module enforces that itself.
import { normalizeText } from "./reviewGrounding.ts";

// Refused before consent, never truncated: past this a paper is almost
// always carrying supplementary material that should be split off.
export const MAX_REVIEW_CHARS = 400_000;

// Strip author lines, then normalize (ligatures, hyphenation, quotes) once,
// so the model's verbatim quotes come back in the same alphabet the server's
// grounding check reads. Newlines survive — sectioning needs them.
export function prepareForReview(fullText: string): string {
  return normalizeText(stripIdentifyingInfo(fullText));
}

// Best-effort, not a guarantee: strips lines in the first ~500 characters
// that look like a name/affiliation byline or an email address, so at
// minimum the *authors* aren't identifiable in what gets sent, even though
// the paper's substantive content still is. Labeled as best-effort in the
// consent UI — never claim more than this actually does.
// A byline: names of capitalised words, initials allowed ("Gopal S Pillai", "J. A. Smith", any script's
// capitals), each maybe carrying affiliation marks ("1", "1,2", "*", "†", "¹"), joined by commas, "and" or "&".
const NAME = String.raw`\p{Lu}[\p{L}.'’-]*(?:\s+\p{Lu}[\p{L}.'’-]*)*`;
const MARKS = String.raw`[\d*†‡§¶#¹²³⁴⁵⁶⁷⁸⁹⁰]+(?:,[\d*†‡§¶#¹²³⁴⁵⁶⁷⁸⁹⁰]+)*`;
const JOIN = String.raw`(?:,\s*and\s+|\s*[,;&]\s*|\s+and\s+)`;
const BYLINE = new RegExp(String.raw`^${NAME}(?:${MARKS})?(?:${JOIN}${NAME}(?:${MARKS})?)+,?$`, "u");
// One author alone: two or more name words with an affiliation mark ("Jane Q Doe1"), not a heading.
const ONE_AUTHOR = new RegExp(String.raw`^\p{Lu}[\p{L}.'’-]*(?:\s+\p{Lu}[\p{L}.'’-]*)+${MARKS}$`, "u");

export function stripIdentifyingInfo(text: string): string {
  const head = text.slice(0, 500);
  const rest = text.slice(500);
  const cleanedHead = head
    .split("\n")
    .map((line) => {
      if (/[\w.+-]+@[\w-]+\.[\w.-]+/.test(line)) return "[redacted]";
      // The shape of a byline ("John Smith, Jane Doe", "Gopal S Pillai1, Merin Dickson1,*") rather than prose.
      if (BYLINE.test(line.trim()) || ONE_AUTHOR.test(line.trim())) return "[redacted]";
      return line;
    })
    .join("\n");
  return cleanedHead + rest;
}

export class ReviewCapacityError extends Error {}
