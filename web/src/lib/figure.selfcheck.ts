// Runnable check for figure.ts — closes the loop between figureSchema.ts's
// guarantees and what actually goes out over the wire. Run directly:
//   node src/lib/figure.selfcheck.ts
import assert from "node:assert/strict";
import { requestFigureCode, figuresRemaining, FREE_FIGURES_PER_DEVICE } from "./figure.ts";
import { buildFigurePayload, type FigureSpec } from "./figureSchema.ts";
import type { Dataset } from "./spreadsheet.ts";

// A minimal localStorage/sessionStorage stub — this file is exercised via
// plain `node`, which has neither. figure.ts already treats a throwing
// storage as "unused"/"not consented" (private-browsing fallback), so an
// absent storage isn't the thing under test here; a present, working one
// is, so the usage counter below has somewhere real to write.
class MemoryStorage {
  private store = new Map<string, string>();
  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
}
(globalThis as unknown as { localStorage: MemoryStorage }).localStorage = new MemoryStorage();

const SENTINEL = "ZZQQ-SENTINEL-0042";
const FIXTURE_DATASET: Dataset = {
  fileName: "patients.csv",
  columns: [
    { name: "group", dtype: "categorical" },
    { name: "response_mean", dtype: "numeric" },
  ],
  rowCount: 6,
  csv: `group,response_mean\n${SENTINEL},1.5\n`,
  previewRows: [[SENTINEL, "1.5"]],
  sheetName: "patients.csv",
  levels: { group: [SENTINEL] },
  coerced: { response_mean: 0 },
};
const SPEC: FigureSpec = { chartType: "bar-error", roles: { x: "group", y: "response_mean" }, note: "" };

let capturedBody: string | undefined;
(globalThis as unknown as { fetch: typeof fetch }).fetch = (async (_url: string, init?: RequestInit) => {
  capturedBody = init?.body as string;
  return new Response(JSON.stringify({ code: "fig, ax = plt.subplots()" }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}) as typeof fetch;

assert.equal(figuresRemaining(), FREE_FIGURES_PER_DEVICE, "a fresh device should start with the full free-use allowance");

const code = await requestFigureCode(FIXTURE_DATASET, SPEC, "/mock");
assert.equal(code, "fig, ax = plt.subplots()", "the resolved code should be exactly what the mock endpoint returned");

assert.equal(
  capturedBody,
  JSON.stringify(buildFigurePayload(FIXTURE_DATASET, SPEC)),
  "the wire body must be exactly buildFigurePayload's output — nothing hand-assembled, nothing extra"
);
assert.ok(!capturedBody!.includes(SENTINEL), "the wire body must never contain a real cell value");

assert.equal(figuresRemaining(), FREE_FIGURES_PER_DEVICE - 1, "a successful request should record one use");

console.log("figure.selfcheck: OK");
