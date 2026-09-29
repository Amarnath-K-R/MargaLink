// Runnable check for functions/api/figure.ts — drives the real handler with
// a stubbed Anthropic stream, an in-memory KV and the node:sqlite D1: input
// validation, the labels opt-in reaching (or not reaching) the model, every
// output gate, and the 1 M coin charge (signed in, refunded on failure).
//   node src/lib/figureEndpoint.selfcheck.ts
import assert from "node:assert/strict";
import { onRequestPost } from "../../functions/api/figure.ts";
import { buildFigurePayload } from "./figureSchema.ts";
import { DEFAULT_SPEC } from "./figureSpec.ts";
import type { Dataset } from "./spreadsheet.ts";
import { testD1 } from "./testD1.ts";
import { createSession, signInUser } from "./auth.ts";
import { balance, credit } from "./ledger.ts";
import { DAILY, capKeys, leftToday } from "./dailyCaps.ts";

const env = { DB: testD1(), ANTHROPIC_API_KEY: "k" };
const user = await signInUser(env.DB, { email: "ann@x.org" }, Date.now());
let cookie = `__Host-ml_session=${await createSession(env.DB, user.id, Date.now())}`;
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
  const res = await handler({ request: new Request("http://x/api/figure", { method: "POST", body: JSON.stringify(payload), headers: { cookie } }), env });
  return { status: res.status, text: await res.text() };
};
const spec = structuredClone(DEFAULT_SPEC); Object.assign(spec.panels[0].roles, { x: "arm", y: "change" });

toolJson = JSON.stringify({ spec, summary: "ok" });
const ask = buildFigurePayload(ds, null, "bars of change by arm", { sendLevels: false, mode: "spec" });
// signed in, with a coin to spend
const anon = cookie; cookie = "";
let r = await call(ask);
assert.equal(r.status, 401); cookie = anon;
r = await call(ask);
assert.equal(r.status, 402); assert.deepEqual(JSON.parse(r.text), { coins: 1, balance: 0 });
await credit(env.DB, user.id, 20, "admin", "seed", Date.now());
r = await call(ask);
assert.equal(r.status, 200, r.text); assert.equal(JSON.parse(r.text).summary, "ok");
assert.equal(JSON.parse(r.text).balance, 19, "the new balance comes back");
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

// a current spec that doesn't fit is passed on with its problem, not refused
const unfit = structuredClone(spec);
unfit.panels[0].roles.x = null;
toolJson = JSON.stringify({ spec, summary: "fixed" });
r = await call(buildFigurePayload(ds, unfit, "fix it", { sendLevels: false, mode: "spec" }));
assert.equal(r.status, 200, r.text);
assert.ok(JSON.stringify(upstreamBody).includes("PROBLEM WITH THE CURRENT SPEC"));

assert.equal((await call({ ...buildFigurePayload(ds, null, "x", { sendLevels: false, mode: "spec" }), rows: [[1]] })).status, 400);
assert.equal((await call(buildFigurePayload(ds, null, "   ", { sendLevels: false, mode: "spec" }))).status, 400);
assert.deepEqual(await leftToday(env.DB, "figure", user.id, Date.now()), { all: DAILY.figure.all - 7, user: DAILY.figure.user - 7 }, "every call that reached Claude was counted, rejected-input calls weren't");
// seven calls reached Claude, three of them came back unusable (422): 7 charged, 3 refunded
assert.equal(await balance(env.DB, user.id), 16);
const refunds = await env.DB.prepare("SELECT COUNT(*) AS n FROM coin_ledger WHERE kind = 'figure_refund'").first<{ n: number }>();
assert.equal(refunds?.n, 3);
// an answer is charged once; no answer, no charge
toolJson = JSON.stringify({ spec, summary: "ok" });
const before = await balance(env.DB, user.id);
r = await call(ask);
assert.equal(r.status, 200, r.text);
assert.equal(await balance(env.DB, user.id), before - 1, "charged once, answered");
toolJson = "{not json";
r = await call(ask);
assert.notEqual(r.status, 200);
assert.equal(await balance(env.DB, user.id), before - 1, "no answer, no charge");

// each account's daily limit: refused before anything is charged or sent
const mine = capKeys("figure", user.id, Date.now()).user;
await env.DB.prepare("UPDATE rate_limits SET count = ? WHERE key = ?").bind(DAILY.figure.user, mine).run();
const b2 = await balance(env.DB, user.id);
toolJson = JSON.stringify({ spec, summary: "ok" });
r = await call(ask);
assert.equal(r.status, 429);
assert.match(r.text, /this account/i);
assert.equal(await balance(env.DB, user.id), b2, "nothing charged");
console.log("figureEndpoint.selfcheck: OK");
