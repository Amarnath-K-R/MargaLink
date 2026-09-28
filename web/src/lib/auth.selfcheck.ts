// Runnable check for auth.ts and functions/api/_middleware.ts: safe
// redirects, Google id-token claims, cookie attributes, sessions, account
// linking in both directions, rate limits and the cross-site guard.
//   node src/lib/auth.selfcheck.ts
import assert from "node:assert/strict";
import { checkIdClaims, createSession, endSession, fingerprint, getSession, hashSecret, jwtPayload, networkOf, pkce, rateLimit, safeNext, sameOrigin, sessionCookies, sha256Hex, signInUser } from "./auth.ts";
import { onRequest } from "../../functions/api/_middleware.ts";
import { testD1 } from "./testD1.ts";

// safeNext: only same-site paths survive
for (const bad of ["//evil.com", "/\\evil.com", "https://evil.com", "javascript:alert(1)", "/\t/evil.com", "evil.com", "", null, 42, `/${"a".repeat(600)}`, "/..//evil.com", "/.//evil.com", "/%2e%2e//evil.com", "/a/../..//evil.com"]) {
  assert.equal(safeNext(bad), "/home", String(bad));
}
assert.equal(safeNext("/review?x=1#y"), "/review?x=1#y");
assert.equal(safeNext("/account", "/x"), "/account");

// id-token claims
const now = Date.parse("2026-09-28T00:00:00Z");
const good = { iss: "https://accounts.google.com", aud: "cid", exp: now / 1000 + 60, email_verified: true, sub: "g1", email: "Ann@Example.org" };
assert.deepEqual(checkIdClaims(good, "cid", now), { sub: "g1", email: "ann@example.org" });
assert.deepEqual(checkIdClaims({ ...good, iss: "accounts.google.com" }, "cid", now), { sub: "g1", email: "ann@example.org" });
for (const [bad, why] of [
  [{ ...good, iss: "https://evil.com" }, "issuer"],
  [{ ...good, aud: "other" }, "audience"],
  [{ ...good, exp: now / 1000 - 1 }, "expired"],
  [{ ...good, email_verified: false }, "verified"],
  [{ ...good, email: "nope" }, "email"],
  [{ ...good, sub: "" }, "subject"],
] as const) assert.equal(typeof checkIdClaims(bad, "cid", now), "string", why);
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
assert.deepEqual(jwtPayload(`${b64({ alg: "RS256" })}.${b64(good)}.sig`), good);
assert.equal(jwtPayload("garbage"), null);

// PKCE: challenge = base64url(sha256(verifier))
const { verifier, challenge } = await pkce();
assert.ok(verifier.length >= 43);
assert.equal(challenge, Buffer.from(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))).toString("base64url"));

// cookies
const [sess, hint] = sessionCookies("tok");
assert.equal(sess, "__Host-ml_session=tok; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000");
assert.equal(hint, "ml_in=1; Path=/; Secure; SameSite=Lax; Max-Age=2592000");
for (const c of sessionCookies(null)) assert.match(c, /Max-Age=0$/);

// account linking, both directions
const db = testD1();
const a = await signInUser(db, { email: "a@x.com" }, now);
assert.equal(a.created, true);
const a2 = await signInUser(db, { email: "A@x.com", google: "sub-a" }, now);
assert.deepEqual([a2.id, a2.created], [a.id, false], "Google joins the email account");
const b = await signInUser(db, { email: "b@x.com", google: "sub-b" }, now);
assert.equal((await signInUser(db, { email: "b@x.com" }, now)).id, b.id, "an email link reaches the Google account");
assert.equal((await signInUser(db, { email: "b-new@x.com", google: "sub-b" }, now)).id, b.id, "a known Google id wins over a changed address");
assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM users").first<{ n: number }>())?.n, 2);

// sessions: only the hash is stored; expiry; sign out here or everywhere
const tok = await createSession(db, a.id, now);
const req = (t: string) => new Request("https://m.test/api/me", { headers: { cookie: `x=1; __Host-ml_session=${t}; ml_in=1` } });
assert.equal((await db.prepare("SELECT id_hash FROM sessions").first<{ id_hash: string }>())?.id_hash, await sha256Hex(tok));
const s = await getSession(db, req(tok), now);
assert.deepEqual([s?.userId, s?.email, s?.token], [a.id, "a@x.com", tok]);
assert.equal(await getSession(db, req("wrong"), now), null);
assert.equal(await getSession(db, new Request("https://m.test/"), now), null);
assert.equal(await getSession(db, req(tok), now + 31 * 864e5), null, "expired");
const tok2 = await createSession(db, a.id, now);
await endSession(db, s!, false);
assert.equal(await getSession(db, req(tok), now), null);
assert.ok(await getSession(db, req(tok2), now), "other devices stay signed in");
const s2 = await getSession(db, req(tok2), now);
await createSession(db, a.id, now);
await endSession(db, s2!, true);
assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM sessions WHERE user_id = ?").bind(a.id).first<{ n: number }>())?.n, 0, "everywhere");

// networks: an IPv6 /64 is one network (one subscriber gets a whole /64)
const nets: [string, string][] = [
  ["203.0.113.7", "203.0.113.7"],
  ["2001:db8:1:2:3:4:5:6", "2001:db8:1:2"],
  ["2001:db8:1:2::9", "2001:db8:1:2"],
  ["2001:DB8:0001:0002::", "2001:db8:1:2"],
  ["2001:db8::1", "2001:db8:0:0"],
  ["::1", "0:0:0:0"],
  ["::ffff:203.0.113.7", "203.0.113.7"],
];
for (const [ip, net] of nets) assert.equal(networkOf(ip), net, ip);

// fingerprints are keyed: the same value under another key doesn't match
assert.equal(await fingerprint("k1", "ann@x.org"), await fingerprint("k1", "ann@x.org"));
assert.notEqual(await fingerprint("k1", "ann@x.org"), await fingerprint("k2", "ann@x.org"));
assert.notEqual(await fingerprint("k1", "ann@x.org"), await sha256Hex("ann@x.org"), "not a plain hash");
assert.equal(hashSecret({ HASH_SECRET: "s" }, new Request("https://m.test/")), "s");
assert.equal(hashSecret({}, new Request("http://localhost:8788/")), "localhost-dev-key", "a fixed key for local development only");
assert.equal(hashSecret({}, new Request("https://m.test/")), null, "deployed without a key: no fingerprints");

// fixed-window rate limit
assert.deepEqual([await rateLimit(db, "k", 2, 1000, now), await rateLimit(db, "k", 2, 1000, now), await rateLimit(db, "k", 2, 1000, now)], [true, true, false]);
assert.equal(await rateLimit(db, "k", 2, 1000, now + 1000), true, "a new window");

// cross-site guard: non-GET needs our own Origin; the Paddle webhook is exempt
const post = (path: string, origin?: string) => new Request(`https://m.test${path}`, { method: "POST", headers: origin ? { origin } : {} });
assert.ok(sameOrigin(post("/api/x", "https://m.test")));
assert.ok(!sameOrigin(post("/api/x", "https://evil.test")));
assert.ok(!sameOrigin(post("/api/x")));
const mw = onRequest as unknown as (ctx: { request: Request; next: () => Promise<Response> }) => Promise<Response>;
const next = async () => new Response("ok", { headers: { "content-type": "text/plain" } });
assert.equal((await mw({ request: post("/api/review", "https://evil.test"), next })).status, 403);
assert.equal((await mw({ request: post("/api/review"), next })).status, 403);
const ok = await mw({ request: post("/api/review", "https://m.test"), next });
assert.equal(ok.status, 200);
assert.equal(ok.headers.get("cache-control"), "no-store");
assert.equal((await mw({ request: post("/api/pay/webhook"), next })).status, 200);
assert.equal((await mw({ request: new Request("https://m.test/api/me"), next })).status, 200);

// housekeeping: any API request (at most once a minute) clears what has expired
const hk = testD1();
const old = Date.now() - 1000;
await hk.prepare("INSERT INTO users (id, email, created_at) VALUES ('h1', 'h@x.org', 0)").run();
await hk.batch([
  hk.prepare("INSERT INTO sessions (id_hash, user_id, expires_at) VALUES ('s-old', 'h1', ?), ('s-live', 'h1', ?)").bind(old, Date.now() + 60_000),
  hk.prepare("INSERT INTO magic_links (token_hash, email, next, expires_at) VALUES ('m-old', 'h@x.org', '/', ?)").bind(old),
  hk.prepare("INSERT INTO rate_limits (key, count, expires_at) VALUES ('r-old', 1, ?)").bind(old),
  hk.prepare("INSERT INTO payment_events (id, type, received_at) VALUES ('evt_old', 't', ?), ('evt_new', 't', ?)").bind(Date.now() - 91 * 864e5, Date.now() - 89 * 864e5),
  hk.prepare("INSERT INTO coin_ledger (user_id, delta, kind, ref, created_at) VALUES ('h1', -4, 'review', 't-old', 0)"),
  hk.prepare("INSERT INTO review_tickets (id_hash, user_id, tier, coins, chunks, extract_left, synth_left, created_at, expires_at) VALUES ('t-old', 'h1', 'quick', 4, '{}', 0, 0, 0, ?)").bind(old),
  // welcome fingerprints: a live account's stays; a deleted account's, 12 months
  hk.prepare("INSERT INTO welcome_claims (email_hash, created_at, released_at) VALUES ('w-live', 0, NULL), ('w-old', 0, ?), ('w-new', 0, ?)").bind(Date.now() - 366 * 864e5, Date.now() - 364 * 864e5),
]);
const waits: Promise<unknown>[] = [];
const mwEnv = onRequest as unknown as (ctx: { request: Request; next: () => Promise<Response>; env: object; waitUntil: (p: Promise<unknown>) => void }) => Promise<Response>;
await mwEnv({ request: new Request("https://m.test/api/me"), next, env: { DB: hk }, waitUntil: (p) => void waits.push(p) });
await Promise.all(waits);
const count = async (t: string) => (await hk.prepare(`SELECT COUNT(*) AS n FROM ${t}`).first<{ n: number }>())?.n;
assert.deepEqual([await count("sessions"), await count("magic_links"), await count("rate_limits"), await count("review_tickets"), await count("payment_events")], [1, 0, 0, 0, 1], "expired rows gone; Paddle event ids kept 90 days");
assert.equal((await hk.prepare("SELECT SUM(delta) AS b FROM coin_ledger").first<{ b: number }>())?.b, 0, "the expired ticket was refunded on the way");
assert.deepEqual((await hk.prepare("SELECT email_hash AS h FROM welcome_claims ORDER BY h").all<{ h: string }>()).results.map((r) => r.h), ["w-live", "w-new"], "a deleted account's welcome fingerprint goes after 12 months");
console.log("auth.selfcheck: OK");
