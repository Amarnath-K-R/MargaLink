// Runnable check for paid reviews: functions/api/review/start.ts charges the
// price and issues a ticket; functions/api/review.ts spends one pass of it
// per request, only for what was paid for; an unfinished run is refunded
// once, a finished one isn't. Drives the real handlers with Anthropic
// stubbed, on the node:sqlite D1 stand-in.
//   node src/lib/reviewTicket.selfcheck.ts
import assert from "node:assert/strict";
import { testD1 } from "./testD1.ts";
import { createSession, signInUser } from "./auth.ts";
import { balance, claimReviewPass, credit, sweepTickets } from "./ledger.ts";
import { sha256Hex } from "./auth.ts";
import { reviewPrice, REVIEW_TICKET_TTL_MS } from "./coins.ts";
import { DAILY_PASS_CAP } from "./reviewPasses.ts";
import { JOURNAL_RULES } from "./journalRules.ts";
import { onRequestPost as start } from "../../functions/api/review/start.ts";
import { onRequestPost as review } from "../../functions/api/review.ts";

const kv = new Map<string, string>();
const env = { DB: testD1(), ANTHROPIC_API_KEY: "k", REVIEWS_KV: { get: async (k: string) => kv.get(k) ?? null, put: async (k: string, v: string) => void kv.set(k, v) } };
type Handler = (ctx: { request: Request; env: typeof env }) => Promise<Response>;
let upstreamCalls = 0;
let upstreamDown = false;
globalThis.fetch = (async (_u: string, init?: RequestInit) => {
  upstreamCalls++;
  if (upstreamDown) return new Response("overloaded", { status: 529 });
  const body = JSON.parse(init!.body as string);
  const name = body.tools[0].name;
  const out = name.includes("synth")
    ? { journalFit: { assessment: "good", explanation: "Fits." }, inconsistencies: [], summary: [], otherObservations: [] }
    : { claims: [], statisticalReporting: [], notes: [] };
  const sse = [
    { type: "content_block_start", index: 0, content_block: { type: "tool_use", name } },
    { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: JSON.stringify(out) } },
    { type: "message_delta", delta: { stop_reason: "tool_use" } },
  ].map((e) => `data: ${JSON.stringify(e)}\n\n`).join("");
  return new Response(sse, { status: 200 });
}) as typeof fetch;

const now = Date.now();
const ann = await signInUser(env.DB, { email: "ann@x.org" }, now);
const bob = await signInUser(env.DB, { email: "bob@x.org" }, now);
const annCookie = `__Host-ml_session=${await createSession(env.DB, ann.id, now)}`;
const bobCookie = `__Host-ml_session=${await createSession(env.DB, bob.id, now)}`;
await credit(env.DB, ann.id, 4, "admin", "seed", now);

const journalId = JOURNAL_RULES[0].journalId;
const post = (h: unknown, path: string, body: unknown, cookie: string, ticket?: string) =>
  (h as Handler)({
    request: new Request(`https://m.test${path}`, { method: "POST", body: JSON.stringify(body), headers: { cookie, ...(ticket ? { "x-review-ticket": ticket } : {}) } }),
    env,
  });
const chunks = [{ id: "s1", chars: 20_000 }, { id: "s2-p1", chars: 24_000 }, { id: "s2-p2", chars: 12_000 }];
const begin = (cookie: string, body: object = {}) => post(start, "/api/review/start", { tier: "quick", journalId, chunks, ...body }, cookie);
const extract = (ticket: string | undefined, id = "s1", text = "x".repeat(100), tier = "quick", cookie = annCookie) =>
  post(review, "/api/review", { pass: "extract", tier, claimsCap: 4, chunk: { id, title: "Intro", kind: "introduction", part: 1, parts: 1, text } }, cookie, ticket);
const synthesize = (ticket: string) =>
  post(review, "/api/review", { pass: "synthesize", journalId, tier: "quick", paperMap: { title: null, totalWords: 10, sections: [] }, abstractText: null, ledger: [], statsFindings: [], notes: [] }, annCookie, ticket);

// --- starting: signed in, valid, affordable
assert.equal((await begin("")).status, 401);
assert.equal((await begin(annCookie, { tier: "epic" })).status, 400);
assert.equal((await begin(annCookie, { journalId: "nope" })).status, 400);
assert.equal((await begin(annCookie, { chunks: [] })).status, 400);
assert.equal((await begin(annCookie, { chunks: [{ id: "s1", chars: 5 }, { id: "s1", chars: 5 }] })).status, 400, "duplicate ids");
assert.equal((await begin(annCookie, { chunks: [{ id: "s1", chars: 30_000 }] })).status, 400, "longer than a chunk can be");
const price = reviewPrice("quick", 56_000);
assert.equal(price, 6);
let r = await begin(annCookie);
assert.equal(r.status, 402);
assert.deepEqual(await r.json(), { coins: 6, balance: 4 });
assert.equal(await balance(env.DB, ann.id), 4, "nothing taken");

await credit(env.DB, ann.id, 20, "admin", "seed2", now);
r = await begin(annCookie);
assert.equal(r.status, 200);
const t1 = (await r.json()) as { ticket: string; coins: number; balance: number };
assert.deepEqual([t1.coins, t1.balance], [6, 18]);
assert.equal(upstreamCalls, 0, "starting sends nothing to Claude");
assert.equal((await env.DB.prepare("SELECT COUNT(*) AS n FROM review_tickets WHERE id_hash = ?").bind(t1.ticket).first<{ n: number }>())?.n, 0, "only the hash is stored");

// --- passes: only with the ticket, only what was paid for
assert.equal((await extract(undefined)).status, 403);
assert.equal((await extract("forged")).status, 403);
assert.equal((await extract(t1.ticket, "s1", "x", "quick", bobCookie)).status, 403, "someone else's ticket");
assert.equal((await extract(t1.ticket, "s1", "x", "thorough")).status, 403, "a deeper tier than paid");
assert.equal((await extract(t1.ticket, "s9")).status, 403, "a section not paid for");
assert.equal((await extract(t1.ticket, "s2-p2", "x".repeat(12_001))).status, 403, "longer than paid");
assert.equal(upstreamCalls, 0, "refused passes never reach Claude");
r = await extract(t1.ticket, "s1");
assert.equal(r.status, 200, await r.clone().text());
assert.equal(upstreamCalls, 1);
// a section that came back isn't sent again; one that keeps failing gets 4 tries, then no more
assert.equal((await extract(t1.ticket, "s1")).status, 409, "already delivered");
assert.equal((await extract(t1.ticket, "s2-p1")).status, 200);
upstreamDown = true;
for (let i = 1; i <= 4; i++) assert.equal((await extract(t1.ticket, "s2-p2")).status, 502, `try ${i}`);
upstreamDown = false;
const callsBefore = upstreamCalls;
r = await extract(t1.ticket, "s2-p2");
assert.equal(r.status, 409, "no tries left for that section");
assert.match(await r.text(), /no tries left/);
assert.equal(upstreamCalls, callsBefore, "and it never reached Claude");

// --- a pass refused by today's capacity doesn't use up the ticket
const left = async (ticket: string) => (await env.DB.prepare("SELECT extract_left AS n FROM review_tickets WHERE id_hash = ?").bind(await sha256Hex(ticket)).first<{ n: number }>())?.n;
const dayKey = `review-pass-count:${new Date().toISOString().slice(0, 10)}`;
const usedBefore = kv.get(dayKey);
kv.set(dayKey, String(DAILY_PASS_CAP));
r = await begin(annCookie); // (refused too: nothing charged)
assert.equal(r.status, 429);
kv.set(dayKey, usedBefore ?? "0");

// --- a finished run keeps its coins; an unfinished one gets back the share it didn't deliver, once
assert.equal((await synthesize(t1.ticket)).status, 200);
r = await begin(annCookie);
const t2 = (await r.json()) as { ticket: string; balance: number };
assert.equal(t2.balance, 12);
const t2left = await left(t2.ticket);
kv.set(dayKey, String(DAILY_PASS_CAP));
assert.equal((await extract(t2.ticket)).status, 429);
assert.equal(await left(t2.ticket), t2left, "a capacity refusal spends no pass");
kv.set(dayKey, usedBefore ?? "0");
assert.equal((await extract(t2.ticket)).status, 200);
assert.equal((await extract(t2.ticket)).status, 409, "the same section isn't sent twice");
r = await begin(annCookie);
const t3 = (await r.json()) as { ticket: string; balance: number };
for (const c of chunks) assert.equal((await extract(t3.ticket, c.id, "x".repeat(100))).status, 200);
assert.equal(t3.balance, 6);
const later = Date.now() + REVIEW_TICKET_TTL_MS + 1000; // tickets expire on the handler's clock
await sweepTickets(env.DB, later);
await sweepTickets(env.DB, later);
// Sections weigh by length (20k, 24k, 12k of 56k); the cross-check like an average one; rounded up.
// t2: only s1 came back, no cross-check: 6 * (36k*3 + 56k) / (56k*4) = 4.4, so 5 back.
// t3: every section but no cross-check: 6 * 56k / (56k*4) = 1.5, so 2 back.
// t1: finished, but s2-p2 (12k) never came back: 6 * 36k / 224k = 0.96, so 1 back.
assert.equal(await balance(env.DB, ann.id), 6 + 5 + 2 + 1, "refunds for what wasn't delivered, once");
assert.equal((await extract(t2.ticket)).status, 403, "an expired ticket is gone");

// --- no pass starts within five minutes of the ticket's end (a pass can run that long)
r = await begin(annCookie);
const t4 = (await r.json()) as { ticket: string };
const expires = (await env.DB.prepare("SELECT expires_at AS e FROM review_tickets WHERE id_hash = ?").bind(await sha256Hex(t4.ticket)).first<{ e: number }>())!.e;
assert.equal(await claimReviewPass(env.DB, t4.ticket, ann.id, { pass: "synthesize", tier: "quick" }, expires - 6 * 60_000), null);
assert.match((await claimReviewPass(env.DB, t4.ticket, ann.id, { pass: "synthesize", tier: "quick" }, expires - 4 * 60_000))?.message ?? "", /expired/);

// --- the audit's attack: one big section and many one-character ones buy almost nothing
await credit(env.DB, ann.id, 20, "admin", "seed3", now);
const decoys = [{ id: "s1", chars: 24_000 }, ...Array.from({ length: 249 }, (_, i) => ({ id: `s${i + 2}`, chars: 1 }))];
r = await begin(annCookie, { chunks: decoys });
const t5 = (await r.json()) as { ticket: string; coins: number; balance: number };
assert.equal(t5.coins, 4);
const big = "x".repeat(24_000);
const calls0 = upstreamCalls;
assert.equal((await extract(t5.ticket, "s1", big)).status, 200);
for (let i = 0; i < 5; i++) assert.equal((await extract(t5.ticket, "s1", big)).status, 409, "the big section is sent once");
assert.equal((await synthesize(t5.ticket)).status, 200);
assert.equal((await synthesize(t5.ticket)).status, 409, "and cross-checked once");
assert.equal(upstreamCalls - calls0, 2, "two calls for what was paid, not hundreds");
await sweepTickets(env.DB, Date.now() + REVIEW_TICKET_TTL_MS + 1000);
const t5refund = await env.DB.prepare("SELECT delta FROM coin_ledger WHERE kind = 'review_refund' AND ref = ?").bind(await sha256Hex(t5.ticket)).first<number>("delta");
assert.equal(t5refund, 1, "the 249 decoys, a thousandth of the length, round up to a single coin back");

// --- the global daily cap is checked before anything is charged
const before = await balance(env.DB, ann.id);
kv.set(dayKey, String(DAILY_PASS_CAP - 2));
assert.equal((await begin(annCookie)).status, 429);
assert.equal(await balance(env.DB, ann.id), before);
console.log("reviewTicket.selfcheck: OK");
