// Runnable check for functions/api/account.ts: the account page's data,
// the "download my data" export, and deleting an account (typing the
// address; everything of theirs goes, except the welcome fingerprint, for
// 12 months).
//   node src/lib/accounts/account.selfcheck.ts
import assert from "node:assert/strict";
import { testD1 } from "./testD1.ts";
import { createSession, signInUser } from "./auth.ts";
import { credit, grantWelcome } from "./ledger.ts";
import { onRequestGet, onRequestPost } from "../../../functions/api/account.ts";

const env = { DB: testD1(), HASH_SECRET: "key" };
type Handler = (ctx: { request: Request; env: typeof env }) => Promise<Response>;
const now = Date.now();
const u = await signInUser(env.DB, { email: "ann@example.org", google: "g-1" }, now);
await grantWelcome(env.DB, u.id, u.email, now, "key");
await credit(env.DB, u.id, 50, "pack", "txn_1", now + 1);
const cookie = `__Host-ml_session=${await createSession(env.DB, u.id, now)}`;
const get = (q = "", c = cookie) => (onRequestGet as unknown as Handler)({ request: new Request(`https://m.test/api/account${q}`, { headers: { cookie: c } }), env });
const del = (body: unknown) => (onRequestPost as unknown as Handler)({ request: new Request("https://m.test/api/account", { method: "POST", body: JSON.stringify(body), headers: { cookie } }), env });

assert.equal((await get("", "")).status, 401);
const page = (await (await get()).json()) as { email: string; balance: number; google: boolean; noticeVersion: number; since: number; history: { kind: string; delta: number; label: string }[] };
assert.equal(page.email, "ann@example.org");
assert.equal(page.balance, 60);
assert.equal(page.google, true);
assert.deepEqual([page.noticeVersion, typeof page.since], [1, "number"], "when they agreed, and to which version of the notice");
assert.deepEqual(page.history.map((h) => [h.kind, h.delta]), [["pack", 50], ["welcome", 10]]);

const dl = await get("?download=1");
assert.match(dl.headers.get("content-disposition") ?? "", /attachment; filename="margalink-account-data\.json"/);
const data = JSON.parse(await dl.text());
assert.equal(data.account.email, "ann@example.org");
assert.equal(data.coins.ledger.length, 2);
assert.equal(data.sessions.length, 1);
assert.deepEqual([data.purchases, data.subscriptions, data.adjustments, data.reviews], [[], [], [], []], "payments and running reviews are part of the export");
assert.equal(data.account.id, u.id, "the account's own id");
assert.deepEqual(data.identities, [{ provider: "google", subject: "g-1" }], "the Google id we keep, not just a yes");
assert.deepEqual(
  data.sharedWith.map((p: { name: string }) => p.name),
  ["Cloudflare", "Google", "Resend", "Paddle"],
  "who may have received this account's data (no Anthropic without an AI request)",
);
// Paddle gets the address when a checkout opens, bought or not: said as such without a purchase
assert.match(data.sharedWith.find((p: { name: string }) => p.name === "Paddle").what, /If you opened a checkout/);

// what's keyed by the address goes with the account: sign-in links and its counters
const { fingerprint } = await import("./auth.ts");
const fp = await fingerprint("key", "ann@example.org");
await env.DB.batch([
  env.DB.prepare("INSERT INTO magic_links (token_hash, email, next, expires_at) VALUES ('m1', 'ann@example.org', '/', ?)").bind(now + 60_000),
  env.DB.prepare("INSERT INTO rate_limits (key, count, expires_at) VALUES (?, 1, ?), (?, 1, ?), (?, 1, ?), ('mail-new', 3, ?)").bind(`mail15:${fp}:net1`, now + 60_000, `mailday:${fp}:net2`, now + 60_000, `mailall:${fp}`, now + 60_000, now + 60_000),
]);
assert.equal((await del({ delete: "someone@else.org" })).status, 400, "the address must match");
assert.equal((await del({})).status, 400);
const gone = await del({ delete: " Ann@Example.org " });
assert.equal(gone.status, 200);
assert.ok(gone.headers.getSetCookie().every((c) => c.endsWith("Max-Age=0")));
for (const t of ["users", "identities", "sessions", "coin_ledger", "magic_links"]) {
  assert.equal((await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${t}`).first<{ n: number }>())?.n, 0, t);
}
const claim = await env.DB.prepare("SELECT released_at AS at FROM welcome_claims").first<{ at: number | null }>();
assert.ok(claim && claim.at !== null && claim.at >= now, "the welcome fingerprint stays, its 12 months counted from deletion");
// signing up again with the same address (a +tag counts as the same): no second bonus, and the fingerprint is held again
const again = await signInUser(env.DB, { email: "ann+2@example.org" }, now + 5);
assert.equal(await grantWelcome(env.DB, again.id, again.email, now + 5, "key"), false);
assert.equal((await env.DB.prepare("SELECT released_at AS at FROM welcome_claims").first<{ at: number | null }>())?.at, null);
assert.equal((await env.DB.prepare("SELECT COUNT(*) AS n FROM rate_limits").first<{ n: number }>())?.n, 4, "sign-in counters stay until they expire (within a day): deleting an account doesn't reset its limits");
assert.equal((await get()).status, 401, "signed out");
// two accounts can share one welcome fingerprint (Gmail ignores dots): deleting one doesn't start the other's 12 months
const { onRequestPost: del2 } = await import("../../../functions/api/account.ts");
const a1 = await signInUser(env.DB, { email: "ann.lee@gmail.com" }, now);
const a2 = await signInUser(env.DB, { email: "annlee@gmail.com" }, now);
assert.equal(await grantWelcome(env.DB, a1.id, a1.email, now, "key"), true);
assert.equal(await grantWelcome(env.DB, a2.id, a2.email, now, "key"), false, "one bonus per person");
const hash = (await env.DB.prepare("SELECT welcome_hash AS h FROM users WHERE id = ?").bind(a1.id).first<{ h: string }>())!.h;
const releasedAt = async () => (await env.DB.prepare("SELECT released_at AS at FROM welcome_claims WHERE email_hash = ?").bind(hash).first<{ at: number | null }>())?.at;
const deleteAs = async (u: { id: string; email: string }, e: object = env) =>
  (del2 as unknown as Handler)({
    request: new Request("https://m.test/api/account", { method: "POST", body: JSON.stringify({ delete: u.email }), headers: { cookie: `__Host-ml_session=${await createSession(env.DB, u.id, now)}` } }),
    env: e as typeof env,
  });
assert.equal((await deleteAs(a1)).status, 200);
assert.equal(await releasedAt(), null, "the other account still holds it");
// ...and the last one releases it, even deployed without the fingerprint key (the account remembers its own)
assert.equal((await deleteAs(a2, { DB: env.DB })).status, 200);
assert.ok(((await releasedAt()) ?? 0) >= now, "released when the last account using it goes");
console.log("account.selfcheck: OK");
