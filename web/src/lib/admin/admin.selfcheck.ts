// Runnable check for the developer console's API (stats.ts and
// functions/api/admin/*): the overview's figures, the AI cost arithmetic,
// the users table and a coin grant, the access list's bulk add and removal,
// and the activity log's filters; and every handler refuses anyone the
// middleware didn't mark a developer. On the node:sqlite D1 stand-in.
//   node src/lib/admin/admin.selfcheck.ts
import assert from "node:assert/strict";
import { testD1 } from "../accounts/testD1.ts";
import { createSession, sha256Hex, signInUser } from "../accounts/auth.ts";
import { WELCOME_COINS } from "../accounts/coins.ts";
import { balance, credit, debit } from "../accounts/ledger.ts";
import { accessFor, addAccess, admitUser } from "../access/access.ts";
import { logEvent } from "../telemetry/apiEvents.ts";
import { aiCost, overview, usage } from "./stats.ts";
import * as statsApi from "../../../functions/api/admin/stats.ts";
import * as usersApi from "../../../functions/api/admin/users.ts";
import * as accessApi from "../../../functions/api/admin/access.ts";
import * as eventsApi from "../../../functions/api/admin/events.ts";

const db = testD1();
const now = Date.now();
const DAY = 864e5;

// the cost of a call, at Anthropic's standard rates; a model we have no price for is unknown, not free
assert.equal(aiCost("claude-sonnet-5", 1_000_000, 100_000), 3);
assert.equal(aiCost("some-new-model", 10, 10), null);

// two testers (one yet to sign in), a developer, and an account from before the beta
await addAccess(db, [{ email: "ann@x.org", role: "beta" }, { email: "bo@x.org", role: "beta" }, { email: "dev@x.org", role: "developer" }], null, now);
const ann = (await admitUser(db, { email: "ann@x.org" }, now - 10 * DAY, "key"))!;
const dev = (await admitUser(db, { email: "dev@x.org" }, now, "key"))!;
await signInUser(db, { email: "old@x.org" }, now - 40 * DAY);
const annHash = await sha256Hex(await createSession(db, ann.id, now));
const devToken = await createSession(db, dev.id, now);
const devHash = await sha256Hex(devToken);
const ai = (input: number, output: number) => ({ model: "claude-sonnet-5", input, output });
await logEvent(db, { at: now - 3 * DAY, idHash: annHash, route: "/api/review", method: "POST", status: 200, ms: 30_000, ai: ai(40_000, 6_000) });
await logEvent(db, { at: now - 60_000, idHash: annHash, route: "/api/figure", method: "POST", status: 200, ms: 9_000, ai: ai(2_000, 500) });
await logEvent(db, { at: now - 50_000, idHash: annHash, route: "/api/figure", method: "POST", status: 502, ms: 9_000 });
await logEvent(db, { at: now - 40_000, idHash: devHash, route: "/api/me", method: "GET", status: 200, ms: 5 });
await logEvent(db, { at: now - 30_000, idHash: null, route: "/api/review/start", method: "POST", status: 401, ms: 2 });

// --- the overview
const o = await overview(db, now);
assert.deepEqual(o.users, { total: 3, new7: 1 });
assert.deepEqual(o.active, { day: 2, week: 2, month: 2 });
assert.deepEqual(o.list, { beta: { listed: 2, joined: 1 }, developer: { listed: 1, joined: 1 } });
assert.deepEqual(o.requests, { day: 4, errors: 1, refused: 1 });
assert.deepEqual(o.ai, { calls: 2, input: 42_000, output: 6_500, cost: aiCost("claude-sonnet-5", 42_000, 6_500) });
assert.equal(o.coins.welcomed, 2 * WELCOME_COINS);

// --- usage: a row per day for 30 days, by feature, by person
const u = await usage(db, now);
assert.equal(u.days.length, 30);
assert.equal(u.days.reduce((n, d) => n + d.aiCalls, 0), 2);
assert.equal(u.days.at(-1)!.day, new Date(now).toISOString().slice(0, 10), "ending today (UTC)");
assert.equal(u.days.reduce((n, d) => n + d.requests, 0), 5);
assert.deepEqual(
  u.routes.map((r) => [r.route, r.calls, r.input]),
  [["/api/review", 1, 40_000], ["/api/figure", 1, 2_000]],
);
assert.deepEqual(
  u.people.map((p) => [p.email, p.calls]),
  [["ann@x.org", 2]],
);

// --- the handlers, as the middleware leaves them: a developer's access in data
type Ctx = { request: Request; env: { DB: D1Database }; data: Record<string, unknown> };
const devAccess = await accessFor(db, new Request("https://m.test/", { headers: { cookie: `__Host-ml_session=${devToken}` } }), now);
const call = (h: unknown, path: string, body?: unknown, data: Record<string, unknown> = { access: devAccess }) =>
  (h as (c: Ctx) => Promise<Response>)({
    request: new Request(`https://m.test${path}`, body === undefined ? {} : { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } }),
    env: { DB: db },
    data,
  });
const handlers = [statsApi.onRequestGet, usersApi.onRequestGet, usersApi.onRequestPost, accessApi.onRequestGet, accessApi.onRequestPost, eventsApi.onRequestGet];
const tester = await accessFor(db, new Request("https://m.test/", { headers: { cookie: `__Host-ml_session=${await createSession(db, ann.id, now)}` } }), now);
for (const h of handlers) {
  assert.equal((await call(h, "/api/admin/x", undefined, {})).status, 403, "no access in data");
  assert.equal((await call(h, "/api/admin/x", undefined, { access: tester })).status, 403, "a tester");
}

const stats = (await (await call(statsApi.onRequestGet, "/api/admin/stats")).json()) as { overview: { users: { total: number } }; usage: { days: unknown[] } };
assert.deepEqual([stats.overview.users.total, stats.usage.days.length], [3, 30]);

// users, and a grant of coins (an "Adjustment" in their history)
type UserRow = { id: string; email: string; balance: number; roles: string[]; lastSeen: number | null; aiCalls: number; input: number; output: number; cost: number | null };
const users = ((await (await call(usersApi.onRequestGet, "/api/admin/users")).json()) as { users: UserRow[] }).users;
assert.deepEqual(
  users.map((r) => [r.email, r.roles, r.balance]),
  [
    ["dev@x.org", ["developer"], WELCOME_COINS],
    ["ann@x.org", ["beta"], WELCOME_COINS],
    ["old@x.org", [], 0],
  ],
  "most recently seen first, then newest",
);
assert.deepEqual([users[1].aiCalls, users[1].input, users[1].output], [2, 42_000, 6_500]);
let r = await call(usersApi.onRequestPost, "/api/admin/users", { userId: ann.id, coins: 25 });
assert.equal(r.status, 200);
assert.deepEqual(await r.json(), { balance: WELCOME_COINS + 25 });
assert.equal((await db.prepare("SELECT kind FROM coin_ledger WHERE user_id = ? ORDER BY id DESC LIMIT 1").bind(ann.id).first<{ kind: string }>())?.kind, "admin");
for (const coins of [0, -5, 1.5, 10_001, "9"]) assert.equal((await call(usersApi.onRequestPost, "/api/admin/users", { userId: ann.id, coins })).status, 400, `coins ${coins}`);
assert.equal((await call(usersApi.onRequestPost, "/api/admin/users", { userId: "nobody", coins: 5 })).status, 404);
assert.equal(await balance(db, ann.id), WELCOME_COINS + 25);

// the access list: bulk add (deduplicated, bad addresses named), removal, and the last developer
r = await call(accessApi.onRequestPost, "/api/admin/access", { action: "add", role: "beta", emails: ["cy@x.org", "Cy@X.org", "not an address", "ann@x.org"], note: "lab" });
assert.deepEqual(await r.json(), { added: ["cy@x.org"], already: ["cy@x.org", "ann@x.org"], invalid: ["not an address"] });
assert.equal((await call(accessApi.onRequestPost, "/api/admin/access", { action: "add", role: "beta", emails: Array(201).fill("a@x.org") })).status, 400, "200 at a time");
assert.equal((await call(accessApi.onRequestPost, "/api/admin/access", { action: "add", role: "owner", emails: ["a@x.org"] })).status, 400);
const added = await db.prepare("SELECT added_by, note FROM access_list WHERE email_key = 'cy@x.org'").first<{ added_by: string; note: string }>();
assert.deepEqual({ ...added }, { added_by: dev.id, note: "lab" }, "who added it is kept");
r = await call(accessApi.onRequestPost, "/api/admin/access", { action: "remove", role: "developer", emailKey: "dev@x.org" });
assert.equal(r.status, 409);
assert.match(await r.text(), /last developer/);
r = await call(accessApi.onRequestPost, "/api/admin/access", { action: "remove", role: "beta", emailKey: "cy@x.org" });
assert.equal(r.status, 200);
const list = ((await (await call(accessApi.onRequestGet, "/api/admin/access")).json()) as { entries: { email_key: string; user_id: string | null }[] }).entries;
assert.deepEqual(
  list.map((e) => [e.email_key, !!e.user_id]),
  [["dev@x.org", true], ["ann@x.org", true], ["bo@x.org", false]],
);

// the activity log: newest first, filtered, a page at a time
type Ev = { id: number; route: string; status: number; email: string | null; model: string | null };
const events = async (q: string) => (await (await call(eventsApi.onRequestGet, `/api/admin/events${q}`)).json()) as { events: Ev[]; next: number | null };
let page = await events("");
assert.deepEqual(page.events.map((e) => e.route).slice(0, 2), ["/api/review/start", "/api/me"]);
assert.equal(page.events[0].email, null);
assert.deepEqual((await events("?status=4")).events.map((e) => e.status), [401]);
assert.deepEqual((await events("?status=5")).events.map((e) => e.route), ["/api/figure"]);
assert.deepEqual((await events("?route=/api/fig")).events.length, 2);
assert.deepEqual((await events("?route=%25")).events.length, 0, "a route filter is a plain prefix, not a pattern");
assert.deepEqual((await events(`?user=${ann.id}`)).events.map((e) => e.email), ["ann@x.org", "ann@x.org", "ann@x.org"]);
assert.deepEqual((await events("?ai=1")).events.map((e) => e.model), ["claude-sonnet-5", "claude-sonnet-5"]);
page = await events("?limit=2");
assert.equal(page.events.length, 2);
const rest = await events(`?limit=2&before=${page.next}`);
assert.ok(rest.events.every((e) => e.id < page.next!));
assert.equal((await events("?limit=50")).next, null, "no more pages");

// coins spent on the AI features, refunds taken off: a rewrite counts like the others
const spentBefore = (await overview(db, now)).coins.spent;
await debit(db, ann.id, 3, "rewrite", "w1", now);
await debit(db, ann.id, 2, "rewrite", "w2", now);
await credit(db, ann.id, 2, "rewrite_refund", "w2", now);
assert.equal((await overview(db, now)).coins.spent, spentBefore + 3);

console.log("admin.selfcheck: OK");
