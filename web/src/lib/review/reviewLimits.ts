// The review's hard limits, shared by the browser (what it sends) and the
// Function (what it accepts and what it returns). Pure.
export const CHUNK_TEXT_MAX = 24_000; // chunks are cut at 16k (reviewSections.ts); the server allows slack
// A real paper is under ~30 sections; thorough's subsections stay well under 60.
export const MAX_REVIEW_CHUNKS = 60;
// Each section is billed as at least this many characters, so many tiny sections cost what they use.
export const MIN_BILLED_SECTION_CHARS = 2000;
export const billedChars = (chars: number) => Math.max(chars, MIN_BILLED_SECTION_CHARS);
export const MAX_QUOTE_CHARS = 400;
export const MAX_QUOTES = 3;
export const MAX_TITLE_CHARS = 160;
export const MAX_TEXT_CHARS = 800;
export const MAX_MEASURE_CHARS = 120;
export const MAX_KEY_NUMBERS = 15;
export const MAX_EDITOR_FINDINGS = 200;
export const MAX_ACROSS = 12;
export const MAX_CHECKLIST_ITEMS = 30;
export const MAX_STRENGTHS = 3;
export const MAX_OVERVIEW_CHARS = 2000;
export const clip = (s: string, max: number) => (s.length <= max ? s : `${s.slice(0, max - 1).trimEnd()}…`);
