// Runnable check for functions/api/figure.ts — drives the real handler with
// a stubbed Anthropic stream and an in-memory KV: input validation, the
// labels opt-in reaching (or not reaching) the model, and every output gate.
//   node src/lib/figureEndpoint.selfcheck.ts
import assert from "node:assert/strict";
import { onRequestPost } from "../../functions/api/figure.ts";
import { buildFigurePayload } from "./figureSchema.ts";
import { DEFAULT_SPEC } from "./figureSpec.ts";
import type { Dataset } from "./spreadsheet.ts";

const kv = new Map<string, string>();
const env = { ANTHROPIC_API_KEY: "k", FIGURES_KV: { get: async (k: string) => kv.get(k) ?? null, put: async (k: string, v: string) => void kv.set(k, v) } };
let toolJson = "";
let upstreamBody: { tools: { name: string }[]; system: string } = { tools: [], system: "" };
globalThis.fetch = (async (_u: string, init?: RequestInit) => {
  if (!init) throw new Error("no init");
  upstreamBody = JSON.parse(init.body as string);
  const sse = [
    { type: "content_block_start", index: 0, content_block: { type: "tool_use", name: upstreamBody.tools[0].name } },
    { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: toolJson } },
    { type: "message_delta", delta: { stop_reason: "tool_use" } },
  ].map((e) => `data: ${JSON.stringify(e)}\n\n`).join("");
  return new Response(sse, { status: 200 });
}) as typeof fetch;

const ds = { columns: [{ name: "arm", dtype: "categorical" }, { name: "change", dtype: "numeric" }], rowCount: 60, levels: { arm: ["Placebo", "Low"] } } as unknown as Dataset;
const call = async (payload: unknown) => {
  const handler = onRequestPost as unknown as (ctx: { request: Request; env: typeof env }) => Promise<Response>;
  const res = await handler({ request: new Request("http://x/api/figure", { method: "POST", body: JSON.stringify(payload) }), env });
  return { status: res.status, text: await res.text() };
};
const spec = structuredClone(DEFAULT_SPEC); Object.assign(spec.panels[0].roles, { x: "arm", y: "change" });

toolJson = JSON.stringify({ spec, summary: "ok" });
let r = await call(buildFigurePayload(ds, null, "bars of change by arm", { sendLevels: false, mode: "spec" }));
assert.equal(r.status, 200, r.text); assert.equal(JSON.parse(r.text).summary, "ok");
assert.equal(upstreamBody.tools[0].name, "submit_figure_spec"); assert.ok(upstreamBody.system.includes("Chart families"));
assert.ok(!JSON.stringify(upstreamBody).includes("Placebo"), "no labels upstream by default");

const lit = structuredClone(spec); lit.panels[0].stats.reference = "Placebo";
toolJson = JSON.stringify({ spec: lit, summary: "" });
r = await call(buildFigurePayload(ds, null, "x", { sendLevels: false, mode: "spec" }));
assert.equal(r.status, 422); assert.match(r.text, /label it wasn't given/);
r = await call(buildFigurePayload(ds, null, "x", { sendLevels: true, mode: "spec" }));
assert.equal(r.status, 200, r.text); assert.ok(JSON.stringify(upstreamBody).includes("Placebo"), "labels upstream when opted in");

const bad = structuredClone(spec); bad.panels[0].roles.y = "nope";
toolJson = JSON.stringify({ spec: bad, summary: "" });
assert.equal((await call(buildFigurePayload(ds, null, "x", { sendLevels: false, mode: "spec" }))).status, 422);

toolJson = JSON.stringify({ code: "import os\ndef customize(fig, axes, df):\n  pass", summary: "" });
r = await call(buildFigurePayload(ds, spec, "x", { sendLevels: false, mode: "hook" }));
assert.equal(r.status, 422); assert.equal(upstreamBody.tools[0].name, "submit_figure_hook");
toolJson = JSON.stringify({ code: "def customize(fig, axes, df):\n  axes[0].set_title('t')", summary: "s" });
r = await call(buildFigurePayload(ds, spec, "x", { sendLevels: false, mode: "hook" }));
assert.equal(r.status, 200); assert.ok(JSON.parse(r.text).hook.includes("customize"));

assert.equal((await call({ ...buildFigurePayload(ds, null, "x", { sendLevels: false, mode: "spec" }), rows: [[1]] })).status, 400);
assert.equal((await call(buildFigurePayload(ds, null, "   ", { sendLevels: false, mode: "spec" }))).status, 400);
assert.deepEqual([...kv.values()], ["6"], "every call that reached Claude was counted, rejected-input calls weren't");
console.log("figureEndpoint.selfcheck: OK");
