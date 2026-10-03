// A paper's spelling settings, kept in its project.json in the browser (never
// on a server): which English it's checked in (or off), and the words it uses
// that the dictionary doesn't know. Pure; spelling.selfcheck.ts runs it.

export const DIALECTS = [
  { id: "us", label: "US English" },
  { id: "gb", label: "UK English" },
  { id: "au", label: "Australian English" },
  { id: "ca", label: "Canadian English" },
  { id: "in", label: "Indian English" },
] as const;
export type Dialect = (typeof DIALECTS)[number]["id"];
export type Spelling = { dialect: Dialect | "off"; words: string[] };

export const DEFAULT_SPELLING: Spelling = { dialect: "us", words: [] };
export const MAX_WORDS = 5000;
const MAX_WORD_CHARS = 64;
// One word: letters (any script), marks, digits, apostrophes and hyphens, with a letter in it.
const WORD = /^[\p{L}\p{M}\p{N}'’-]+$/u;
const isWord = (w: unknown): w is string => typeof w === "string" && w.length <= MAX_WORD_CHARS && WORD.test(w) && /\p{L}/u.test(w);

/** Settings read from a backup or a project.json: undefined when malformed, the bad words dropped. */
export function spellingFrom(v: unknown): Spelling | undefined {
  if (!v || typeof v !== "object") return undefined;
  const { dialect, words } = v as { dialect?: unknown; words?: unknown };
  if (dialect !== "off" && !DIALECTS.some((d) => d.id === dialect)) return undefined;
  const kept = Array.isArray(words) ? [...new Set(words.filter(isWord))].slice(0, MAX_WORDS) : [];
  return { dialect: dialect as Spelling["dialect"], words: kept };
}

/**
 * The settings with one more word of the paper's own (unchanged if it isn't
 * one word, or is there already). A word capitalised only because it starts
 * a sentence is kept in lower case, which the checker accepts either way.
 */
export function addWord(s: Spelling, word: string): Spelling {
  const t = word.trim();
  const w = /^\p{Lu}[^\p{Lu}]*$/u.test(t) ? t[0].toLowerCase() + t.slice(1) : t;
  if (!isWord(w) || s.words.includes(w) || s.words.length >= MAX_WORDS) return s;
  return { ...s, words: [...s.words, w] };
}

/** The settings without one of the paper's words. */
export const removeWord = (s: Spelling, word: string): Spelling => ({ ...s, words: s.words.filter((w) => w !== word) });
