// Runnable check for figure.ts — closes the loop between figureSchema.ts's
// guarantees and what actually goes out over the wire, and checks that
// whatever comes back is re-validated before the page may render it.
//   node src/lib/figure.selfcheck.ts
import assert from "node:assert/strict";
import { FREE_FIGURES_PER_DEVICE, FigureCapacityError, FigureLimitError, askClaude, figuresRemaining } from "./figure.ts";
import { buildFigurePayload } from "./figureSchema.ts";
import { DEFAULT_SPEC, type FigureSpec } from "./figureSpec.ts";
import type { Dataset } from "./spreadsheet.ts";

class MemoryStorage {
  private store = new Map<string, string>();
  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
}
(globalThis as unknown as { localStorage: MemoryStorage }).localStorage = new MemoryStorage();

const SENTINEL = "ZZQQ-SENTINEL-0042";
const DATASET: Dataset = {
  fileName: "patients.csv",
  sheetName: "patients.csv",
  columns: [
    { name: "arm", dtype: "categorical" },
    { name: "change", dtype: "numeric" },
  ],
  rowCount: 6,
  csv: `arm,change\n${SENTINEL},1.5\n`,
  previewRows: [[SENTINEL, "1.5"]],
  levels: { arm: [SENTINEL, "Low"] },
  coerced: { change: 0 },
};
const local: FigureSpec = structuredClone(DEFAULT_SPEC);
Object.assign(local.panels[0].roles, { x: "arm", y: "change" });
local.panels[0].title = "My own title";

let captured: string | undefined;
let reply: { status: number; body: unknown } = { status: 200, body: {} };
(globalThis as unknown as { fetch: typeof fetch }).fetch = (async (_url: string, init?: RequestInit) => {
  captured = init?.body as string;
  return new Response(typeof reply.body === "string" ? reply.body : JSON.stringify(reply.body), { status: reply.status });
}) as typeof fetch;

const returned = (mutate?: (s: FigureSpec) => void): FigureSpec => {
  const s = structuredClone(local);
  s.panels[0].title = "";
  s.panels[0].layers = [{ kind: "points", ci: false, alpha: 0.5, size: null, jitter: null }];
  mutate?.(s);
  return s;
};

assert.equal(figuresRemaining(), FREE_FIGURES_PER_DEVICE);

// 1. the wire body is exactly buildFigurePayload's output, with and without the labels opt-in
for (const sendLevels of [false, true]) {
  reply = { status: 200, body: { spec: returned(), summary: "Change by arm with points." } };
  const r = await askClaude(DATASET, local, "add points", { sendLevels, mode: "spec", endpoint: "/mock" });
  assert.equal(captured, JSON.stringify(buildFigurePayload(DATASET, local, "add points", { sendLevels, mode: "spec" })));
  assert.equal(captured!.includes(SENTINEL), sendLevels, sendLevels ? "opted in: the label is sent" : "default: no label, no value");
  assert.ok(!captured!.includes("1.5") && !captured!.includes("My own title"), "never a cell value or typed text");
  assert.equal(r.kind, "spec");
  if (r.kind === "spec") {
    assert.equal(r.spec.panels[0].title, "My own title", "empty returned text keeps the user's own");
    assert.equal(r.spec.panels[0].layers.length, 1, "Claude's change is applied");
  }
}
assert.equal(figuresRemaining(), FREE_FIGURES_PER_DEVICE - 2, "one use per call");

// 2. what comes back is re-checked (the counter is reset so these cases don't hit the device limit)
const fresh = () => localStorage.setItem("margalink-figure-uses", "0");
const refuse = async (body: unknown, pattern: RegExp, sendLevels = false, mode: "spec" | "hook" = "spec") => {
  fresh();
  reply = { status: 200, body };
  await assert.rejects(askClaude(DATASET, local, "x", { sendLevels, mode, endpoint: "/mock" }), pattern);
};
await refuse({ spec: returned((s) => ((s.panels[0] as unknown as Record<string, unknown>).extra = 1)), summary: "" }, /wasn't valid/);
await refuse({ spec: returned((s) => (s.panels[0].roles.y = "not_a_column")), summary: "" }, /didn't fit/);
await refuse({ spec: returned((s) => (s.panels[0].stats.reference = "Low")), summary: "" }, /label it wasn't given/, false);
fresh();
reply = { status: 200, body: { spec: returned((s) => (s.panels[0].stats.reference = "Low")), summary: "" } };
await askClaude(DATASET, local, "x", { sendLevels: true, mode: "spec", endpoint: "/mock" }); // a label that was sent is fine
await refuse({ hook: "import os\ndef customize(fig, axes, df):\n    pass", summary: "" }, /rejected before running/, false, "hook");
await refuse({ hook: "print(1)", summary: "" }, /customize/, false, "hook");
fresh();
reply = { status: 200, body: { hook: "def customize(fig, axes, df):\n    axes[0].set_title('x')", summary: "Sets a title." } };
const h = await askClaude(DATASET, local, "x", { sendLevels: false, mode: "hook", endpoint: "/mock" });
assert.equal(h.kind, "hook");

// 3. server errors
fresh();
reply = { status: 429, body: "full" };
await assert.rejects(askClaude(DATASET, local, "x", { sendLevels: false, mode: "spec", endpoint: "/mock" }), FigureCapacityError);
reply = { status: 422, body: "Claude's figure description didn't fit your data: nope" };
await assert.rejects(askClaude(DATASET, local, "x", { sendLevels: false, mode: "spec", endpoint: "/mock" }), /didn't fit your data: nope/);

// 4. the device limit
localStorage.setItem("margalink-figure-uses", String(FREE_FIGURES_PER_DEVICE));
await assert.rejects(askClaude(DATASET, local, "x", { sendLevels: false, mode: "spec", endpoint: "/mock" }), FigureLimitError);

console.log("figure.selfcheck: OK");
