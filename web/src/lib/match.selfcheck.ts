// Runnable check for match.ts's ranking math. Not part of the app bundle —
// run directly: node src/lib/match.selfcheck.ts
import { quantizeInt8, topK, passesFilters, type JournalMeta } from "./match.ts";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAILED: ${msg}`);
}

// quantize: round-trips a unit vector into the int8 range
const q = quantizeInt8(new Float32Array([1, -1, 0.5, -0.5, 0]));
assert(q[0] === 127 && q[1] === -127, "full-scale values hit the int8 rails");
assert(q[4] === 0, "zero stays zero");

// topK: a query identical to journal 2's vector should rank journal 2 first
const dim = 4;
const index = new Int8Array([
  10, 0, 0, 0, // journal 0
  0, 10, 0, 0, // journal 1
  0, 0, 10, 0, // journal 2
]);
const query = new Int8Array([0, 0, 10, 0]); // matches journal 2 exactly
const ranked = topK(query, index, dim, [0, 1, 2], 3);
assert(ranked[0].index === 2, "exact match ranks first");
assert(ranked[0].score > ranked[1].score, "scores are strictly ordered");

// topK: restricting candidateIndices excludes journal 2 even though it's the
// best match — this is how filters work (filter the pool, then rank)
const restricted = topK(query, index, dim, [0, 1], 3);
assert(
  restricted.every((r) => r.index !== 2),
  "excluded candidates never appear, even if they'd have scored highest"
);

// passesFilters
const m: JournalMeta = {
  id: "x",
  display_name: "X",
  field: "Medicine",
  is_in_doaj: true,
  apc_usd: 2000,
  country_code: "IN",
};
assert(passesFilters(m, {}), "no filters passes everything");
assert(passesFilters(m, { field: "Medicine" }), "matching field passes");
assert(!passesFilters(m, { field: "Physics" }), "wrong field is excluded");
assert(passesFilters(m, { openAccessOnly: true }), "in DOAJ passes openAccessOnly");
assert(!passesFilters({ ...m, is_in_doaj: false }, { openAccessOnly: true }), "not in DOAJ is excluded");
assert(passesFilters(m, { maxFeeUsd: 2000 }), "fee at the cap passes");
assert(!passesFilters(m, { maxFeeUsd: 1999 }), "fee over the cap is excluded");
assert(!passesFilters({ ...m, apc_usd: null }, { maxFeeUsd: 2000 }), "unknown fee is excluded by a fee filter, not assumed free");

console.log("match.selfcheck: OK");
