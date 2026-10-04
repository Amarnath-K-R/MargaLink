// Runnable check for reviewKeep.ts: the last report in this browser, read
// back only if it's one, and never an error when storage is unavailable.
//   node src/lib/review/reviewKeep.selfcheck.ts
import assert from "node:assert/strict";
import { browserKeeper } from "./reviewKeep.ts";
import type { ReviewReport } from "./reviewTypes.ts";

const store = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
};
const report = {
  version: 2,
  tier: "quick",
  journalName: "J",
  createdAt: "2026-10-04",
  overview: null,
  fixFirst: [],
  sections: [],
  acrossPaper: [],
  checklist: null,
  coverage: { reviewed: [], failed: [], pending: [], skipped: [], setAside: 0 },
} as ReviewReport;
assert.equal(await browserKeeper.load(), null);
await browserKeeper.save(report);
assert.deepEqual(await browserKeeper.load(), report);
await browserKeeper.save(null);
assert.equal(await browserKeeper.load(), null);

// blocked storage: nothing kept, nothing thrown
const blocked = () => {
  throw new Error("SecurityError");
};
(globalThis as { localStorage?: unknown }).localStorage = { getItem: blocked, setItem: blocked, removeItem: blocked };
await browserKeeper.save(report);
assert.equal(await browserKeeper.load(), null);
console.log("reviewKeep.selfcheck: OK");
