// Runnable check for spelling.ts. Run directly: node src/lib/writing/spelling.selfcheck.ts
// A paper's spelling settings: its English and its own words. They come back
// from a backup zip, which is untrusted, so whatever is malformed is dropped.
import assert from "node:assert/strict";
import { addWord, DEFAULT_SPELLING, MAX_WORDS, spellingFrom } from "./spelling.ts";

assert.deepEqual(DEFAULT_SPELLING, { dialect: "us", words: [] });

// valid settings pass through
assert.deepEqual(spellingFrom({ dialect: "gb", words: ["actigraphy", "polysomnography"] }), { dialect: "gb", words: ["actigraphy", "polysomnography"] });
assert.deepEqual(spellingFrom({ dialect: "off", words: [] }), { dialect: "off", words: [] });
for (const d of ["us", "gb", "au", "ca", "in"]) assert.equal(spellingFrom({ dialect: d, words: [] })?.dialect, d);

// malformed: not used at all, or only its good words kept
assert.equal(spellingFrom(undefined), undefined);
assert.equal(spellingFrom("gb"), undefined);
assert.equal(spellingFrom({ dialect: "klingon", words: [] }), undefined);
assert.deepEqual(spellingFrom({ dialect: "us" }), { dialect: "us", words: [] });
assert.deepEqual(spellingFrom({ dialect: "us", words: ["fine", 7, "", "x".repeat(65), "two words", "<script>", "Naïve", "O'Brien", "self-report"] }), {
  dialect: "us",
  words: ["fine", "Naïve", "O'Brien", "self-report"],
});
assert.equal(spellingFrom({ dialect: "us", words: Array.from({ length: MAX_WORDS + 50 }, (_, i) => `w${"a".repeat(i % 5)}x${i}`) })?.words.length, MAX_WORDS, "capped");

// adding a word: once, trimmed, only a real word
assert.deepEqual(addWord(DEFAULT_SPELLING, " actigraphy "), { dialect: "us", words: ["actigraphy"] });
assert.deepEqual(addWord({ dialect: "us", words: ["actigraphy"] }, "actigraphy"), { dialect: "us", words: ["actigraphy"] });
assert.deepEqual(addWord(DEFAULT_SPELLING, "two words"), DEFAULT_SPELLING);

console.log("spelling.selfcheck: OK");
