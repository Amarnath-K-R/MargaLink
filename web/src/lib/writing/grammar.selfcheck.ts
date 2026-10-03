// Runnable check for grammar.ts, against the real Harper engine (harper.js,
// in-process here; the page runs the same engine in a Web Worker).
// Run directly: node src/lib/writing/grammar.selfcheck.ts
import assert from "node:assert/strict";
import { LocalLinter } from "harper.js";
import { binaryInlined } from "harper.js/binaryInlined";
import { checkProse, plainMessage } from "./grammar.ts";
import { proseMask } from "./latexText.ts";
import { DEFAULT_SPELLING } from "./spelling.ts";

const linter = new LocalLinter({ binary: binaryInlined });
const us = DEFAULT_SPELLING;
const words = (issues: { from: number; to: number }[], text: string) => issues.map((i) => text.slice(i.from, i.to));

// plain prose: a misspelling, with its fixes, at its place
const plain = "Sleep after surgery is teh topic of thiss paper.";
const found = await checkProse(linter, plain, plain, us);
assert.deepEqual(words(found, plain), ["teh", "thiss"]);
const thiss = found.find((i) => plain.slice(i.from, i.to) === "thiss")!;
assert.equal(thiss.kind, "spelling");
assert.ok(thiss.replacements.includes("this"), "suggests the fix");
assert.ok(thiss.message.length > 0);

// LaTeX: read through its mask; citation keys and labels aren't words, \emph's text is
const tex = "We used \\cite{misspeled2019} and \\label{fig:slep}; an \\emph{importnt} result.";
const inTex = await checkProse(linter, proseMask(tex), tex, us);
assert.deepEqual(words(inTex, tex), ["importnt"], "only the prose is checked, at its place in the source");

// a mark that would reach into blanked markup is dropped (fixing it would overwrite the markup)
const repeat = "We saw the \\cite{x} the effect.";
for (const i of await checkProse(linter, proseMask(repeat), repeat, us)) assert.equal(proseMask(repeat).slice(i.from, i.to), repeat.slice(i.from, i.to));

// the blanks left by markup are never reported as extra spaces
assert.deepEqual(await checkProse(linter, proseMask("Text \\cite{a}\\cite{b}   continues."), "Text \\cite{a}\\cite{b}   continues.", us), []);

// the paper's English: UK accepts "colour" and marks "color"
const uk = { dialect: "gb" as const, words: [] };
const colours = "The colour and the color.";
assert.deepEqual(words(await checkProse(linter, colours, colours, uk), colours), ["color"]);
// ... and switching back is honoured
assert.deepEqual(words(await checkProse(linter, colours, colours, us), colours), ["colour"]);

// the paper's own words aren't misspellings, and leaving them out brings the mark back
const jargon = "We used actigraphy.";
assert.equal((await checkProse(linter, jargon, jargon, us)).length, 1);
assert.equal((await checkProse(linter, jargon, jargon, { dialect: "us", words: ["actigraphy"] })).length, 0);
assert.equal((await checkProse(linter, jargon, jargon, us)).length, 1, "words are the paper's, not remembered across papers");

// Harper's wording, as the site writes: quotes, not code backticks; no em dashes
assert.equal(plainMessage("Did you mean to spell `thiss` this way?"), "Did you mean to spell “thiss” this way?");
assert.equal(plainMessage("Use a comma — or a full stop."), "Use a comma, or a full stop.");
assert.ok(found.every((i) => !/[`—]/.test(i.message)), "the marks carry it");

// off: nothing
assert.deepEqual(await checkProse(linter, plain, plain, { dialect: "off", words: [] }), []);

console.log("grammar.selfcheck: OK");
