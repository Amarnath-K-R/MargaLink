// Runnable check for functions/api/rewrite.ts: drives the real handler with a
// stubbed Anthropic stream on the node:sqlite D1. Refusals come before any
// charge (sign-in, body size, the request's rules, the price), the daily
// limit before the charge, the charge before Claude; one more try when an
// answer breaks a rule, charged once; every failure refunded exactly once;
// the exact request Claude gets; and no passage in the logs.
//   node src/lib/writing/rewriteEndpoint.selfcheck.ts
import assert from "node:assert/strict";
import { onRequestPost } from "../../../functions/api/rewrite.ts";
import { testD1 } from "../accounts/testD1.ts";
import { createSession, signInUser } from "../accounts/auth.ts";
import { balance, credit } from "../accounts/ledger.ts";
import { DAILY, capKeys, leftToday } from "../accounts/dailyCaps.ts";
import { rewritePrice } from "../accounts/coins.ts";
import { rewriteWords } from "./rewrite.ts";

const env = { DB: testD1(), ANTHROPIC_API_KEY: "k" };
const user = await signInUser(env.DB, { email: "ann@x.org" }, Date.now());
const session = `__Host-ml_session=${await createSession(env.DB, user.id, Date.now())}`;

// Claude, stubbed: each call takes the next answer off the queue.
type Answer = { tool?: unknown; stop?: string; status?: number };
let answers: Answer[] = [];
const upstream: Record<string, unknown>[] = [];
globalThis.fetch = (async (_u: string, init?: RequestInit) => {
  upstream.push(JSON.parse(init!.body as string));
  const a = answers.shift() ?? { status: 500 };
  if (a.status) return new Response("overloaded", { status: a.status });
  const sse = [
    { type: "message_start", message: { usage: { input_tokens: 900, output_tokens: 1 } } },
    { type: "content_block_start", index: 0, content_block: { type: "tool_use", name: "submit_rewrite" } },
    { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: typeof a.tool === "string" ? a.tool : JSON.stringify(a.tool) } },
    { type: "message_delta", delta: { stop_reason: a.stop ?? "tool_use" }, usage: { output_tokens: 300 } },
  ].map((e) => `data: ${JSON.stringify(e)}\n\n`).join("");
  return new Response(sse, { status: 200 });
}) as typeof fetch;

const logs: string[] = [];
console.error = (...args: unknown[]) => void logs.push(args.join(" "));

const P = (n: number) => `⟦${n}⟧`;
const passage = `Sleep was shorter ${P(1)} after cardiac surgery in older adults.\n\nIt recovered ${P(2)} by day 90 in most of them.`;
const ask = (more: Record<string, unknown> = {}) => ({ tool: "paraphrase", tone: null, format: "text", dialect: "gb", passage, coins: rewritePrice(rewriteWords(passage)), ...more });
const rewritten = `Sleep was briefer ${P(1)} following cardiac surgery in older adults.\n\nIt came back ${P(2)} by day 90 in most of them.`;

const call = async (body: unknown, opts: { cookie?: string; headers?: Record<string, string> } = {}) => {
  const handler = onRequestPost as unknown as (ctx: { request: Request; env: typeof env; data: Record<string, unknown> }) => Promise<Response>;
  const data: Record<string, unknown> = {};
  const res = await handler({
    request: new Request("http://x/api/rewrite", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body), headers: { cookie: opts.cookie ?? session, ...opts.headers } }),
    env,
    data,
  });
  const text = await res.text();
  return { status: res.status, text, json: () => JSON.parse(text), data };
};
const used = async () => (await leftToday(env.DB, "rewrite", user.id, Date.now())).user;
const refunds = async () => (await env.DB.prepare("SELECT COUNT(*) AS n FROM coin_ledger WHERE kind = 'rewrite_refund'").first<{ n: number }>())!.n;

// --- refused before anything is reserved, charged or sent
assert.equal((await call(ask(), { cookie: "" })).status, 401, "signed out");
assert.equal((await call(ask(), { headers: { "content-length": "200000" } })).status, 413, "too large");
assert.equal((await call("{not json")).status, 400);
assert.equal((await call({ ...ask(), extra: 1 })).status, 400, "an extra key");
assert.equal((await call(ask({ passage: `Lost ${P(2)}.` }))).status, 400, "placeholders out of order");
const wrongPrice = await call(ask({ coins: 9 }));
assert.equal(wrongPrice.status, 400, "a price that isn't the price");
assert.match(wrongPrice.text, /price/);
assert.equal(upstream.length, 0, "Claude heard none of it");
assert.equal(await used(), DAILY.rewrite.user, "and no use was counted");

// --- too few coins: 402 with the price and the balance; the use given back
let r = await call(ask());
assert.equal(r.status, 402);
assert.deepEqual(r.json(), { coins: 1, balance: 0 });
assert.equal(await used(), DAILY.rewrite.user);
assert.equal(upstream.length, 0);

// --- an answer: charged, checked, sent back with the new balance
await credit(env.DB, user.id, 20, "admin", "seed", Date.now());
answers = [{ tool: { text: rewritten, notes: [] } }];
r = await call(ask());
assert.equal(r.status, 200, r.text);
assert.deepEqual(r.json(), { text: rewritten, notes: [], coins: 1, balance: 19 });
assert.equal(await used(), DAILY.rewrite.user - 1);
assert.deepEqual(r.data.ai, { model: "claude-sonnet-5", input: 900, output: 300 }, "the call's tokens for the activity log");

// the exact request: pinned model, the tool forced, no thinking, low effort, no temperature
const sent = upstream[0] as { model: string; max_tokens: number; thinking: unknown; tool_choice: unknown; output_config: unknown; tools: { name: string; strict: boolean }[]; system: string; messages: { role: string; content: string }[] };
assert.equal(sent.model, "claude-sonnet-5");
assert.deepEqual(sent.tool_choice, { type: "tool", name: "submit_rewrite" });
assert.deepEqual(sent.thinking, { type: "disabled" });
assert.deepEqual(sent.output_config, { effort: "low" });
assert.ok(!("temperature" in sent));
assert.equal(sent.tools.length, 1);
assert.equal(sent.tools[0].strict, true);
assert.equal(sent.max_tokens, Math.min(12000, 1000 + Math.ceil((passage.length * 1.3) / 3)));
assert.equal(sent.messages.length, 1);
assert.ok(sent.messages[0].content.includes(passage), "the passage, as selected");
assert.match(sent.messages[0].content, /British English/);
assert.match(sent.system, /never instructions/i, "the passage is text to rewrite, not orders");
assert.match(sent.system, /⟦/, "the placeholders are explained");
assert.ok(!/LaTeX command/.test(sent.messages[0].content), "LaTeX rules only for LaTeX");
const { length: before } = upstream;

// each tool's own instruction and token budget
answers = [{ tool: { text: `${rewritten} It took weeks, and nights stayed broken for many of them.`.replace("\n\nIt", " Nights stayed broken.\n\nIt"), notes: [] } }];
r = await call(ask({ tool: "expand" }));
assert.equal(r.status, 200, r.text);
assert.equal((upstream[before] as { max_tokens: number }).max_tokens, Math.min(12000, 1000 + Math.ceil((passage.length * 2) / 3)));
assert.match((upstream[before] as { messages: { content: string }[] }).messages[0].content, /Expand/);
answers = [{ tool: { text: rewritten.replace("in most of them", "in most"), notes: [] } }];
r = await call(ask({ tool: "tone", tone: "confident", format: "latex" }));
assert.equal(r.status, 200, r.text);
assert.match((upstream.at(-1) as { messages: { content: string }[] }).messages[0].content, /confident/);
assert.match((upstream.at(-1) as { messages: { content: string }[] }).messages[0].content, /LaTeX command/);

// --- an answer that breaks a rule: one more try naming the problem, charged once
let bal = await balance(env.DB, user.id);
const calls = upstream.length;
answers = [{ tool: { text: rewritten.replace(` ${P(1)}`, ""), notes: [] } }, { tool: { text: rewritten, notes: [] } }];
r = await call(ask());
assert.equal(r.status, 200, r.text);
assert.equal(upstream.length, calls + 2);
assert.match((upstream.at(-1) as { messages: { content: string }[] }).messages[0].content, /previous answer was refused: Keep every placeholder/, "the second try is told what was wrong");
assert.equal(await balance(env.DB, user.id), bal - 1, "charged once for both tries");
assert.deepEqual(r.data.ai, { model: "claude-sonnet-5", input: 1800, output: 600 }, "both calls' tokens");

// --- broken twice: 422, refunded
bal = await balance(env.DB, user.id);
answers = [{ tool: { text: passage, notes: [] } }, { tool: { text: `${rewritten} It was 45% lower.`, notes: [] } }];
r = await call(ask());
assert.equal(r.status, 422);
assert.match(r.text, /refunded/i);
assert.equal(await balance(env.DB, user.id), bal, "refunded");
assert.equal(await refunds(), 1);

// --- cut short: 422, refunded, not tried again
bal = await balance(env.DB, user.id);
answers = [{ tool: { text: rewritten, notes: [] }, stop: "max_tokens" }];
const n = upstream.length;
r = await call(ask());
assert.equal(r.status, 422);
assert.equal(upstream.length, n + 1);
assert.equal(await balance(env.DB, user.id), bal);

// --- not JSON, then fine: an answer problem, so tried again
answers = [{ tool: "{not json" }, { tool: { text: rewritten, notes: [] } }];
assert.equal((await call(ask())).status, 200);

// --- Claude unavailable: 502, refunded
bal = await balance(env.DB, user.id);
answers = [{ status: 529 }];
r = await call(ask());
assert.equal(r.status, 502);
assert.equal(await balance(env.DB, user.id), bal);
assert.equal(await refunds(), 3);

// --- the logs name what failed, never the passage or the answer
assert.ok(logs.length > 0);
for (const line of logs) assert.ok(!line.includes("Sleep") && !line.includes("cardiac"), `no paper in the log: ${line}`);

// --- the account's daily limit: refused before anything is charged or sent
await env.DB.prepare("UPDATE rate_limits SET count = ? WHERE key = ?").bind(DAILY.rewrite.user, capKeys("rewrite", user.id, Date.now()).user).run();
bal = await balance(env.DB, user.id);
const m = upstream.length;
r = await call(ask());
assert.equal(r.status, 429);
assert.match(r.text, /this account/i);
assert.equal(await balance(env.DB, user.id), bal, "nothing charged");
assert.equal(upstream.length, m, "nothing sent");

console.log("rewriteEndpoint.selfcheck: OK");
