// Spelling and grammar on this device: Harper (harper.js, Apache-2.0), a
// rule-based checker compiled to WebAssembly. Nothing is sent anywhere: the
// page downloads the public engine once (from our own site) and checks the
// paper's text in a Web Worker. checkProse is engine-agnostic so
// grammar.selfcheck.ts runs it against the real engine in Node.
import type { Linter } from "harper.js";
import type { Spelling } from "./spelling.ts";

export type Issue = {
  from: number; // in the source, same as in the prose read from it
  to: number;
  message: string;
  kind: "spelling" | "grammar";
  replacements: string[]; // what the marked text could become ("" removes it)
};

// Rules that misfire on prose read out of LaTeX or a Word document: the
// blanks left where markup was look like extra spaces, and en dashes in page
// ranges would mark every reference in a list.
const RULES_OFF = { Spaces: false, QuoteSpacing: false, NoFrenchSpaces: false, TransposedSpace: false, NumericRangeEnDash: false };
const DIALECT = { us: 0, gb: 1, au: 2, ca: 3, in: 4 } as const; // harper.js's Dialect
const REMOVE = 1;
const INSERT_AFTER = 2; // harper.js's SuggestionKind

// What each engine was last set to, so a check reconfigures it only when the paper's settings change.
const configured = new WeakMap<Linter, { dialect?: number; words: string }>();

/**
 * The spelling and grammar marks in `prose`, the text as read from `source`
 * (a LaTeX file through proseMask, or a paragraph's text): only marks lying
 * wholly on prose, since fixing one that reached into blanked markup would
 * overwrite the markup. Positions are UTF-16 offsets, as in the source.
 */
export async function checkProse(linter: Linter, prose: string, source: string, spelling: Spelling): Promise<Issue[]> {
  if (spelling.dialect === "off" || !prose.trim()) return [];
  let state = configured.get(linter);
  if (!state) {
    state = { words: "" };
    configured.set(linter, state);
  }
  const dialect = DIALECT[spelling.dialect];
  if (state.dialect !== dialect) {
    await linter.setDialect(dialect);
    await linter.setLintConfig(RULES_OFF); // a new dialect brings back every rule
    state.dialect = dialect;
    state.words = "\u0000"; // ... and forgets the imported words
  }
  const words = spelling.words.join("\n");
  if (state.words !== words) {
    await linter.clearWords();
    if (spelling.words.length) await linter.importWords(spelling.words);
    state.words = words;
  }
  const issues: Issue[] = [];
  for (const lint of await linter.lint(prose, { language: "plaintext" })) {
    const span = lint.span();
    const [from, to] = [span.start, span.end];
    const marked = prose.slice(from, to);
    const kind = lint.lint_kind();
    const initial = kind === "Spelling" && /^\p{L}\.?$/u.test(marked); // "Smith J.": an author's initial
    if (to > from && marked === source.slice(from, to) && !initial) {
      issues.push({
        from,
        to,
        message: plainMessage(lint.message()),
        kind: kind === "Spelling" || kind === "Typo" ? "spelling" : "grammar",
        replacements: [...new Set(lint.suggestions().map((s) => {
          const k = s.kind();
          const text = k === REMOVE ? "" : k === INSERT_AFTER ? marked + s.get_replacement_text() : s.get_replacement_text();
          s.free();
          return text;
        }))], // Harper can offer the same fix twice
      });
    }
    span.free();
    lint.free();
  }
  return issues;
}

/** Harper's wording as the site writes: quoted words, not code backticks, and no em dashes. */
export function plainMessage(message: string): string {
  return message.replace(/`([^`]*)`/g, "\u201c$1\u201d").replace(/\s*\u2014\s*/g, ", ");
}

let engine: Promise<Linter> | null = null;

/** The page's one engine, started on first use. */
export function grammarEngine(): Promise<Linter> {
  engine ??= (async () => {
    const { WorkerLinter, createBinaryModuleFromUrl } = await import("harper.js");
    const { binary } = await import("harper.js/binary");
    // The bundler gives the engine a site-relative address, which the Web
    // Worker (started from a blob: URL) can't resolve, and two parallel
    // downloads of its 16 MB trip the browser's cache: downloaded once here
    // and handed to the worker as a blob: URL.
    const res = await fetch(new URL(String(binary.url), location.href));
    if (!res.ok) throw new Error(`The spelling checker didn't download (${res.status}).`);
    const url = URL.createObjectURL(new Blob([await res.arrayBuffer()], { type: "application/wasm" }));
    const linter = new WorkerLinter({ binary: createBinaryModuleFromUrl(url, "full") });
    try {
      await linter.setup();
    } catch (err) {
      void linter.dispose().catch(() => {}); // the worker stops
      URL.revokeObjectURL(url); // and the engine's copy is let go
      throw err;
    }
    return linter;
  })().catch((err: unknown) => {
    engine = null; // a failed download is tried again next time
    throw err;
  });
  return engine;
}
