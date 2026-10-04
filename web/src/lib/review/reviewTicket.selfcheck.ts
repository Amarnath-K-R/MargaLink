// Runnable check for paid reviews: review/start.ts charges the price of the
// whole paper sent and issues a ticket for the sections the depth reviews
// (and the checklist at thorough); review.ts spends one pass per request,
// only for what was paid for and with no more paper than was paid for; an
// unfinished run is refunded once. Drives the real handlers with Anthropic
// stubbed, on the node:sqlite D1 stand-in.
//   node src/lib/review/reviewTicket.selfcheck.ts
import assert from "node:assert/strict";
import { testD1 } from "../accounts/testD1.ts";
import { createSession, signInUser } from "../accounts/auth.ts";
import { balance, credit, sweepTickets } from "../accounts/ledger.ts";
import { reviewPrice } from "../accounts/coins.ts";
import { DAILY, capKeys } from "../accounts/dailyCaps.ts";
import { JOURNAL_RULES } from "../journals/journalRules.ts";
import { onRequestPost as start } from "../../../functions/api/review/start.ts";
import { onRequestPost as review } from "../../../functions/api/review.ts";

const env = { DB: testD1(), ANTHROPIC_API_KEY: "k" };
type Handler = (ctx: { request: Request; env: typeof env; data: Record<string, unknown> }) => Promise<Response>;
const upstream: { tools: { name: string }[]; system: string; messages: { content: { text: string; cache_control?: unknown }[] }[] }[] = [];
let upstreamDown = false;
let wrongTool = false;
globalThis.fetch = (async (_u: string, init?: RequestInit) => {
  const body = JSON.parse(init!.body as string);
  upstream.push(body);
  if (upstreamDown) return new Response("overloaded", { status: 529 });
  const job = body.messages[0].content.at(-1).text as string; // the job is always last
  const [name, out] = job.includes("submit_checklist")
    ? ["submit_checklist", { guideline: null, why: "None applies.", items: [] }]
    : job.includes("submit_editor_review")
      ? ["submit_editor_review", { overview: "O.", strengths: [], journalFit: { assessment: "good", explanation: "Fits." }, fixFirst: [], duplicates: [], verdicts: [], acrossPaper: [] }]
      : ["submit_section_review", { verdict: "Fine.", findings: [], keyNumbers: [] }];
  const sse = [
    { type: "message_start", message: { usage: { input_tokens: 10, cache_read_input_tokens: 1000 } } },
    { type: "content_block_start", index: 0, content_block: { type: "tool_use", name: wrongTool ? "submit_checklist" : name } },
    { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: JSON.stringify(out) } },
    { type: "message_delta", delta: { stop_reason: "tool_use" }, usage: { output_tokens: 20 } },
  ]
    .map((e) => `data: ${JSON.stringify(e)}\n\n`)
    .join("");
  return new Response(sse, { status: 200 });
}) as typeof fetch;

const now = Date.now();
const ann = await signInUser(env.DB, { email: "ann@x.org" }, now);
const bob = await signInUser(env.DB, { email: "bob@x.org" }, now);
const annCookie = `__Host-ml_session=${await createSession(env.DB, ann.id, now)}`;
const bobCookie = `__Host-ml_session=${await createSession(env.DB, bob.id, now)}`;
await credit(env.DB, ann.id, 100, "admin", "seed", now);
const journalId = JOURNAL_RULES[0].journalId;
const post = (h: unknown, path: string, body: unknown, cookie = annCookie, ticket?: string, headers: Record<string, string> = {}) =>
  (h as Handler)({
    request: new Request(`https://m.test${path}`, { method: "POST", body: JSON.stringify(body), headers: { cookie, ...(ticket ? { "x-review-ticket": ticket } : {}), ...headers } }),
    env,
    data: {},
  });
const text = (n: number) => "The cohort had 412 adults in it. ".repeat(Math.ceil(n / 33)).slice(0, n);
const paper = [
  { id: "s1", title: "Abstract", kind: "abstract", text: text(1500) },
  { id: "s2", title: "Methods", kind: "methods", text: text(20_000) },
  { id: "s3", title: "Results", kind: "results", text: text(24_000) },
];
const billed = 2000 + 20_000 + 24_000; // the abstract billed as 2,000
const begin = (tier: string, reviewIds: string[], cookie = annCookie, context: { journalId?: string | null; guidanceChars?: number } = {}) =>
  post(start, "/api/review/start", { tier, journalId, guidanceChars: 0, ...context, chunks: paper.map((c) => ({ id: c.id, chars: c.text.length, review: reviewIds.includes(c.id) })) }, cookie);
const section = (ticket: string, target: string, tier = "quick", p: unknown = paper, cookie = annCookie, guidance = "") =>
  post(review, "/api/review", { pass: "section", tier, journalId, guidance, paper: p, target }, cookie, ticket);
const checklist = (ticket: string, tier = "thorough") => post(review, "/api/review", { pass: "checklist", tier, journalId, guidance: "", paper }, annCookie, ticket);
const editor = (ticket: string, tier = "quick", extra: object = {}) => post(review, "/api/review", { pass: "editor", tier, journalId, guidance: "", paper, findings: [], keyNumbers: [], checklist: [], ...extra }, annCookie, ticket);
type Paid = { ticket: string; coins: number; balance: number };

// --- starting
assert.equal((await begin("quick", ["s1"], "")).status, 401);
assert.equal((await post(start, "/api/review/start", { tier: "quick", journalId, chunks: paper.map((c) => ({ id: c.id, chars: c.text.length })) })).status, 400, "the v1 shape");
assert.equal((await begin("quick", [])).status, 400, "nothing to review");
let r = await begin("quick", ["s1", "s3"]);
assert.equal(r.status, 200, await r.clone().text());
const quick = (await r.json()) as Paid;
assert.equal(quick.coins, reviewPrice("quick", billed), "priced on the whole paper sent, not only the sections reviewed");
assert.equal(quick.balance, 100 - quick.coins);

// --- a section pass: a reviewed section only, with no more paper than paid for
assert.equal((await section(quick.ticket, "s2")).status, 403, "a section this depth doesn't review");
const longer = [...paper, { id: "s4", title: "More", kind: "discussion", text: text(24_000) }, { id: "s5", title: "More", kind: "discussion", text: text(24_000) }];
assert.equal((await section(quick.ticket, "s1", "quick", longer)).status, 403, "more paper than was paid for");
assert.equal((await section(quick.ticket, "s1", "quick", paper, annCookie, "x".repeat(20_000))).status, 403, "notes that weren't paid for");
assert.equal((await post(review, "/api/review", { pass: "section", tier: "quick", journalId: "no-such-journal", guidance: "", paper, target: "s1" }, annCookie, quick.ticket)).status, 404);
assert.equal((await section(quick.ticket, "s1", "standard")).status, 403, "another depth");
assert.equal((await section(quick.ticket, "s1", "quick", paper, bobCookie)).status, 403, "another account");
assert.equal((await post(review, "/api/review", {}, annCookie, quick.ticket, { "content-length": "4000000" })).status, 413);
assert.equal((await editor(quick.ticket)).status, 409, "nothing back yet, nothing to put together");
r = await section(quick.ticket, "s1");
assert.equal(r.status, 200, await r.clone().text());
assert.deepEqual(await r.json(), { verdict: "Fine.", findings: [], keyNumbers: [] });
assert.equal((await checklist(quick.ticket, "quick")).status, 400, "the checklist is thorough's alone");

// --- what Claude got: all three tools, the system prompt, the whole paper cached, then the job
const sent = upstream.at(-1)!;
assert.deepEqual(sent.tools.map((t) => t.name), ["submit_section_review", "submit_checklist", "submit_editor_review"]);
assert.match(sent.system, /\[redacted\]/);
assert.equal(sent.messages[0].content[0].cache_control, undefined);
assert.deepEqual(sent.messages[0].content[1].cache_control, { type: "ephemeral" }, "the cache mark is on the review's context, after the paper");
assert.match(sent.messages[0].content[1].text, /Target journal: /);
assert.ok(["s1", "s2", "s3"].every((id) => sent.messages[0].content[0].text.includes(`id="${id}"`)), "every section, reviewed or not");
assert.match(sent.messages[0].content[2].text, /id="s1"/);

// --- a wrong tool is a malformed answer: 502, retried by the browser
wrongTool = true;
assert.equal((await section(quick.ticket, "s3")).status, 502);
wrongTool = false;

// --- the editor: only what this ticket delivered
assert.equal((await editor(quick.ticket, "quick", { findings: [{ id: "s3-f0", title: "T", severity: "major", why: "W", quotes: [] }] })).status, 400, "from a section that hasn't come back");
r = await editor(quick.ticket);
assert.equal(r.status, 200, await r.clone().text());
assert.equal((await editor(quick.ticket)).status, 409, "already put together");
// A section's result lost to a Cancel (the server had finished it): it may run once more, and the report again with it.
assert.equal((await section(quick.ticket, "s1")).status, 200, "a section that came back may run once more");
assert.equal((await editor(quick.ticket)).status, 200, "and the report be put together again with it");
assert.equal((await editor(quick.ticket)).status, 409, "but not again without something new");
r = await section(quick.ticket, "s1");
assert.equal(r.status, 409, "only once more");
assert.match(await r.text(), /run again once/);

// --- thorough: the checklist is a paid part of the ticket
const thorough = (await (await begin("thorough", ["s1", "s2", "s3"])).json()) as Paid;
assert.equal(thorough.coins, reviewPrice("thorough", billed));
assert.equal((await checklist(thorough.ticket)).status, 200);
assert.equal((await checklist(thorough.ticket)).status, 200, "a delivered part may run once more");
assert.equal((await checklist(thorough.ticket)).status, 409, "and only once");

// --- four tries per section, then its coins come back
const standard = (await (await begin("standard", ["s1"])).json()) as Paid;
upstreamDown = true;
for (let i = 0; i < 4; i++) assert.equal((await section(standard.ticket, "s1", "standard")).status, 502);
assert.equal((await section(standard.ticket, "s1", "standard")).status, 409, "out of tries");
upstreamDown = false;

// --- expiry refunds what didn't come back, by its share (the editor and the checklist weigh as an average section)
await env.DB.prepare(
  `INSERT INTO review_tickets (id_hash, user_id, tier, coins, chunks, extract_left, synth_left, created_at, expires_at) VALUES ('old', ?1, 'quick', 4, '{"s1":2000,"s2":24000}', 8, 4, ?2, ?2)`,
)
  .bind(ann.id, now)
  .run(); // a ticket from before this change
const share = (coins: number, weights: Record<string, number>, delivered: string[], edited: boolean) => {
  const n = Object.keys(weights).length;
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  const got = delivered.reduce((a, id) => a + weights[id], 0);
  return Math.ceil((coins * ((total - got) * n + (edited ? 0 : total))) / (total * (n + 1)));
};
const expected =
  share(quick.coins, { s1: 2000, s3: 24_000 }, ["s1"], true) +
  share(thorough.coins, { s1: 2000, s2: 20_000, s3: 24_000, checklist: Math.round(46_000 / 3) }, ["checklist"], false) +
  share(standard.coins, { s1: 2000 }, [], false) +
  4;
const before = await balance(env.DB, ann.id);
await sweepTickets(env.DB, now + 3 * 60 * 60 * 1000);
assert.equal((await balance(env.DB, ann.id)) - before, expected);

// --- today's limit: a review whose passes don't fit isn't charged
await env.DB.prepare("INSERT INTO rate_limits (key, count, expires_at) VALUES (?1, ?2, ?3) ON CONFLICT(key) DO UPDATE SET count = ?2")
  .bind(capKeys("reviewPass", ann.id, Date.now()).user, DAILY.reviewPass.user - 3, Date.now() + 86_400_000)
  .run();
const left = await balance(env.DB, ann.id);
assert.equal((await begin("thorough", ["s1", "s2", "s3"])).status, 429, "five passes don't fit in three");
assert.equal(await balance(env.DB, ann.id), left);

console.log("reviewTicket.selfcheck: OK");
