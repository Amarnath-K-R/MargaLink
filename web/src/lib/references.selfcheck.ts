// Runnable check for references.ts. Run directly: node src/lib/references.selfcheck.ts
import assert from "node:assert/strict";
import { buildNameIndex, countCitedJournals, normalizeName, splitReferences } from "./references.ts";

const index = buildNameIndex([
  { id: "NEJM", display_name: "New England Journal of Medicine", names: ["N Engl J Med"] },
  { id: "LANCET", display_name: "The Lancet" },
  { id: "SCIENCE", display_name: "Science" },
  { id: "NATURE", display_name: "Nature" },
  { id: "NCOMMS", display_name: "Nature Communications", names: ["Nat Commun"] },
  { id: "CELL", display_name: "Cell" },
  { id: "JPA", display_name: "Journal of Physics A" },
  { id: "JPB", display_name: "Journal of Physics B" },
  { id: "JAE", display_name: "Journal of Applied Ecology" },
  { id: "BMJ", display_name: "BMJ" },
  { id: "GUT", display_name: "Gut" },
  { id: "DUP1", display_name: "Heart Journal" },
  { id: "DUP2", display_name: "Heart Journal" },
]);
const count = (text: string) => countCitedJournals(text, index).counts;

assert.equal(normalizeName("N. Engl. J. Med."), "n engl j med");
assert.equal(normalizeName("The Lancet"), "lancet");
assert.equal(normalizeName("Ciência & Saúde"), "ciencia and saude");

// Vancouver, with dotted abbreviations
assert.deepEqual([...count(`1. Smith J, Lee K. Outcomes after discharge. N. Engl. J. Med. 2019;380:1–2.
2. Doe A. Heart failure trends. Lancet 2020;395:10–12.
3. Roe B. Readmission. BMJ 2018;360:k1.`)], [["NEJM", 1], ["LANCET", 1], ["BMJ", 1]]);

// APA (blank-line separated) — the journal after the title, then volume(issue)
assert.deepEqual([...count(`Smith, J. (2020). Habitat loss in wetlands. Journal of Applied Ecology, 56(3), 100–110.

Jones, K. (2019). Another study. Journal of Applied Ecology, 55(1), 1–9.

Brown, L. (2018). A third. Journal of Physics B, 51, 4–8.`)], [["JAE", 2], ["JPB", 1]], "Journal of Physics B only — A stays uncounted");

// Nature style: "Cell" opens the title (no year after it); "Nature" is the journal
assert.deepEqual([...count(`[1] Doe, A. et al. Cell states in the brain. Nature 591, 1–5 (2021).
[2] Lee, B. Mapping. Nature Communications 11, 200 (2020).
[3] Kim, C. Cell cycle control. Cell 180, 10–20 (2020).`)], [["NATURE", 1], ["NCOMMS", 1], ["CELL", 1]], "the longest name wins; Cell counted only as a journal");

// Traps: a journal's name as an ordinary word in a title
assert.equal(count(`1. Park D. Science communication in schools. J Educ Res. 2018;12:3.
2. Ng E. Nature and nurture revisited. Psychol Rev. 2017;124:5.
3. Ito F. The gut microbiome. Microbiome. 2019;7:1.`).size, 0, "no journal counted from a title word");

// Short names: an acronym is kept, a short ordinary word isn't
assert.equal(count("1. A B. Title. BMJ. 2020;368:m1.\n2. C D. Title. Gut. 2020;69:1.\n3. E F. Title. Gut 2019;68:2.").get("GUT"), undefined);

// A shared name splits its credit
assert.deepEqual([...count("1. A. Title. Heart Journal 2020;1:2.\n2. B. Title. Heart Journal 2021;2:3.\n3. C. Title. Lancet 2020;1:1.")].slice(0, 2), [["DUP1", 1], ["DUP2", 1]]);

// Splitting and the matched/entries counts
const numbered = splitReferences("1. First entry\nwraps here.\n2. Second.\n3. Third.");
assert.deepEqual(numbered, ["1. First entry wraps here.", "2. Second.", "3. Third."]);
const r = countCitedJournals("1. A. T. Lancet 2020;1:1.\n2. B. T. Unknown J 2020;1:1.\n3. C. T. Lancet 2021;2:2.", index);
assert.equal(r.entries, 3);
assert.equal(r.matched, 2);
assert.equal(r.counts.get("LANCET"), 2);
assert.equal(countCitedJournals("", index).entries, 0);

console.log("references.selfcheck: OK");
