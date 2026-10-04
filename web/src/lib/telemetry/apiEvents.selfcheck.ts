// Runnable check for apiEvents.ts, the console's activity log: a row names
// the account by its session (never an address), keeps the path without its
// query, holds token counts from the AI calls, goes after 30 days, and goes
// with the account. On the node:sqlite D1 stand-in.
//   node src/lib/telemetry/apiEvents.selfcheck.ts
import assert from "node:assert/strict";
import { testD1 } from "../accounts/testD1.ts";
import { createSession, sha256Hex, signInUser } from "../accounts/auth.ts";
import { EVENTS_KEPT_MS, logEvent, purgeEvents, usageSink } from "./apiEvents.ts";

const db = testD1();
const now = Date.now();
const ann = await signInUser(db, { email: "ann@x.org" }, now);
const idHash = await sha256Hex(await createSession(db, ann.id, now));
type Row = { user_id: string | null; route: string; method: string; status: number; ms: number; model: string | null; input_tokens: number | null; output_tokens: number | null };
const rows = async () => (await db.prepare("SELECT user_id, route, method, status, ms, model, input_tokens, output_tokens FROM api_events ORDER BY id").all<Row>()).results;

// nothing in the table could name a person but the account id
const cols = (await db.prepare("PRAGMA table_info(api_events)").all<{ name: string }>()).results.map((c) => c.name);
assert.deepEqual(cols, ["id", "at", "user_id", "route", "method", "status", "ms", "model", "input_tokens", "output_tokens"]);

await logEvent(db, { at: now, idHash, route: "/api/me", method: "GET", status: 200, ms: 12 });
await logEvent(db, { at: now, idHash: null, route: "/api/auth/google/callback?code=secret", method: "GET", status: 302, ms: 80 });
await logEvent(db, { at: now, idHash: "no-such-session", route: "/api/me", method: "GET", status: 200, ms: 3 });
const [me, callback, stranger] = await rows();
assert.deepEqual([me.user_id, me.route, me.status, me.ms, me.model], [ann.id, "/api/me", 200, 12, null], "the account comes from the session");
assert.equal(callback.route, "/api/auth/google/callback", "never the query (a sign-in code)");
assert.equal(stranger.user_id, null);

// the AI calls of one request add up, under the model's name
const data: Record<string, unknown> = {};
const sink = usageSink(data, "claude-sonnet-5");
sink({ input: 1200, output: 300 });
sink({ input: 800, output: 100 });
await logEvent(db, { at: now, idHash, route: "/api/figure", method: "POST", status: 200, ms: 9000, ai: data.ai as never });
assert.deepEqual((await rows()).at(-1), { user_id: ann.id, route: "/api/figure", method: "POST", status: 200, ms: 9000, model: "claude-sonnet-5", input_tokens: 2000, output_tokens: 400 });
assert.deepEqual(data.ai, { model: "claude-sonnet-5", input: 2000, output: 400 }, "no cache reads, no cacheRead field");
const cachedData: Record<string, unknown> = {};
const cachedSink = usageSink(cachedData, "claude-sonnet-5");
cachedSink({ input: 200, output: 50, cacheRead: 1000 });
cachedSink({ input: 1350, output: 50, cacheRead: 0 });
assert.deepEqual(cachedData.ai, { model: "claude-sonnet-5", input: 1550, output: 100, cacheRead: 1000 }, "cache reads are summed for the live check");

// 30 days, then gone
await logEvent(db, { at: now - EVENTS_KEPT_MS - 1, idHash, route: "/api/old", method: "GET", status: 200, ms: 1 });
await logEvent(db, { at: now - EVENTS_KEPT_MS + 60_000, idHash, route: "/api/recent", method: "GET", status: 200, ms: 1 });
await purgeEvents(db, now);
const routes = (await rows()).map((r) => r.route);
assert.ok(!routes.includes("/api/old") && routes.includes("/api/recent"));

// deleting the account deletes its rows
await db.prepare("DELETE FROM users WHERE id = ?").bind(ann.id).run();
assert.ok((await rows()).every((r) => r.user_id === null));
assert.equal((await rows()).length, 2, "only the rows with no account are left");

console.log("apiEvents.selfcheck: OK");
