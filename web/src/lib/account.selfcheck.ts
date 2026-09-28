// Runnable check for functions/api/account.ts: the account page's data,
// the "download my data" export, and deleting an account (typing the
// address; everything of theirs goes, except the welcome fingerprint).
//   node src/lib/account.selfcheck.ts
import assert from "node:assert/strict";
import { testD1 } from "./testD1.ts";
import { createSession, signInUser } from "./auth.ts";
import { credit, grantWelcome } from "./ledger.ts";
import { onRequestGet, onRequestPost } from "../../functions/api/account.ts";

const env = { DB: testD1() };
type Handler = (ctx: { request: Request; env: typeof env }) => Promise<Response>;
const now = Date.now();
const u = await signInUser(env.DB, { email: "ann@example.org", google: "g-1" }, now);
await grantWelcome(env.DB, u.id, u.email, now);
await credit(env.DB, u.id, 50, "pack", "txn_1", now + 1);
const cookie = `__Host-ml_session=${await createSession(env.DB, u.id, now)}`;
const get = (q = "", c = cookie) => (onRequestGet as unknown as Handler)({ request: new Request(`https://m.test/api/account${q}`, { headers: { cookie: c } }), env });
const del = (body: unknown) => (onRequestPost as unknown as Handler)({ request: new Request("https://m.test/api/account", { method: "POST", body: JSON.stringify(body), headers: { cookie } }), env });

assert.equal((await get("", "")).status, 401);
const page = (await (await get()).json()) as { email: string; balance: number; google: boolean; history: { kind: string; delta: number; label: string }[] };
assert.equal(page.email, "ann@example.org");
assert.equal(page.balance, 60);
assert.equal(page.google, true);
assert.deepEqual(page.history.map((h) => [h.kind, h.delta]), [["pack", 50], ["welcome", 10]]);

const dl = await get("?download=1");
assert.match(dl.headers.get("content-disposition") ?? "", /attachment; filename="margalink-account-data\.json"/);
const data = JSON.parse(await dl.text());
assert.equal(data.account.email, "ann@example.org");
assert.equal(data.coins.ledger.length, 2);
assert.equal(data.sessions.length, 1);
assert.deepEqual([data.purchases, data.subscriptions], [[], []], "payments are part of the export");

assert.equal((await del({ delete: "someone@else.org" })).status, 400, "the address must match");
assert.equal((await del({})).status, 400);
const gone = await del({ delete: " Ann@Example.org " });
assert.equal(gone.status, 200);
assert.ok(gone.headers.getSetCookie().every((c) => c.endsWith("Max-Age=0")));
for (const t of ["users", "identities", "sessions", "coin_ledger"]) {
  assert.equal((await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${t}`).first<{ n: number }>())?.n, 0, t);
}
assert.equal((await env.DB.prepare("SELECT COUNT(*) AS n FROM welcome_claims").first<{ n: number }>())?.n, 1);
assert.equal((await get()).status, 401, "signed out");
console.log("account.selfcheck: OK");
