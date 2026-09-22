// Runnable check for review.ts's pure logic (stripping, counters) — not
// part of the app bundle. Run directly: node src/lib/review.selfcheck.ts
import { stripIdentifyingInfo } from "./review.ts";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAILED: ${msg}`);
}

const BYLINE_PAPER = `Deep Learning for Crop Disease Detection

John Smith, Jane Doe

john.smith@example.edu

Abstract

This paper presents a CNN approach to detecting crop diseases from leaf
images across three growing seasons.`;

const stripped = stripIdentifyingInfo(BYLINE_PAPER);
assert(!stripped.includes("John Smith"), "author byline should be redacted");
assert(!stripped.includes("john.smith@example.edu"), "email should be redacted");
assert(stripped.includes("Deep Learning for Crop Disease Detection"), "title should survive");
assert(stripped.includes("This paper presents a CNN approach"), "body text should survive");

// A byline far past the 500-char head window should NOT be touched — the
// function only redacts near the top, where a byline actually lives, not
// anywhere a short title-cased comma list might appear (e.g. an author list
// deep in an acknowledgments section, which is legitimate content).
const LONG_PREFIX = "x ".repeat(400); // ~800 chars, past the 500-char window
const LATE_NAME_LIST = `${LONG_PREFIX}\nJohn Smith, Jane Doe\nMore text after.`;
const strippedLate = stripIdentifyingInfo(LATE_NAME_LIST);
assert(strippedLate.includes("John Smith, Jane Doe"), "a name-shaped line past the head window should survive untouched");

console.log("review.selfcheck: OK");
