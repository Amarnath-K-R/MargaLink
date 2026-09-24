// Runnable check for match.ts's quantization and filters (ranking: rank.selfcheck.ts). Not part of the app bundle —
// run directly: node src/lib/match.selfcheck.ts
import { quantizeInt8, passesFilters, type JournalMeta } from "./match.ts";
import assert from "node:assert/strict";

// quantize: round-trips a unit vector into the int8 range
const q = quantizeInt8(new Float32Array([1, -1, 0.5, -0.5, 0]));
assert(q[0] === 127 && q[1] === -127, "full-scale values hit the int8 rails");
assert(q[4] === 0, "zero stays zero");

// passesFilters
const m: JournalMeta = {
  id: "x",
  display_name: "X",
  field: "Medicine",
  is_in_doaj: true,
  apc_usd: 2000,
  country_code: "IN",
  medline_indexed: true,
  publication_time_weeks: 12,
};
assert(passesFilters(m, {}), "no filters passes everything");
assert(passesFilters(m, { field: "Medicine" }), "matching field passes");
assert(!passesFilters(m, { field: "Physics" }), "wrong field is excluded");
assert(passesFilters(m, { openAccessOnly: true }), "in DOAJ passes openAccessOnly");
assert(!passesFilters({ ...m, is_in_doaj: false }, { openAccessOnly: true }), "not in DOAJ is excluded");
assert(passesFilters(m, { maxFeeUsd: 2000 }), "fee at the cap passes");
assert(!passesFilters(m, { maxFeeUsd: 1999 }), "fee over the cap is excluded");
assert(!passesFilters({ ...m, apc_usd: null }, { maxFeeUsd: 2000 }), "unknown fee is excluded by a fee filter, not assumed free");
assert(passesFilters(m, { maxPublicationWeeks: 12 }), "publication time at the cap passes");
assert(!passesFilters(m, { maxPublicationWeeks: 11 }), "publication time over the cap is excluded");
assert(!passesFilters({ ...m, publication_time_weeks: null }, { maxPublicationWeeks: 12 }), "unknown publication time is excluded, not assumed fast");
assert(passesFilters(m, { medlineOnly: true }), "MEDLINE-indexed passes medlineOnly");
assert(!passesFilters({ ...m, medline_indexed: false }, { medlineOnly: true }), "not MEDLINE-indexed is excluded");

console.log("match.selfcheck: OK");
