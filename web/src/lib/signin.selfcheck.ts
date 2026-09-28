// Runnable check for the sign-in Functions (functions/api/auth/*, me.ts):
// the email link end to end (sent once, used once, rate-limited), Google's
// code flow (state, PKCE, claims), welcome coins, /api/me, and signing out.
// Drives the real handlers with Google and Resend stubbed.
//   node src/lib/signin.selfcheck.ts
import assert from "node:assert/strict";
import { testD1 } from "./testD1.ts";
import { onRequestPost as emailRequest } from "../../functions/api/auth/email/request.ts";
import { onRequestPost as emailVerify } from "../../functions/api/auth/email/verify.ts";
import { onRequestGet as googleStart } from "../../functions/api/auth/google/start.ts";
import { onRequestGet as googleCallback } from "../../functions/api/auth/google/callback.ts";
import { onRequestPost as logout } from "../../functions/api/auth/logout.ts";
import { onRequestGet as me } from "../../functions/api/me.ts";

const env = { DB: testD1(), HASH_SECRET: "test-key", GOOGLE_CLIENT_ID: "cid", GOOGLE_CLIENT_SECRET: "sec", GOOGLE_REDIRECT_URI: "https://m.test/api/auth/google/callback", RESEND_API_KEY: "re", EMAIL_FROM: "MargaLink <signin@m.test>" };
type Handler = (ctx: { request: Request; env: typeof env }) => Promise<Response>;
const run = (h: unknown, request: Request, e: object = env) => (h as Handler)({ request, env: e as typeof env });
const post = (path: string, body: unknown, cookie = "", ip = "203.0.113.1") =>
  new Request(`https://m.test${path}`, { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json", cookie, "cf-connecting-ip": ip } });
const get = (path: string, cookie = "") => new Request(`https://m.test${path}`, { headers: { cookie } });
const cookieHeader = (res: Response) => res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");

// stub the outside world
const sent: { to: string[]; text: string }[] = [];
let idToken = "";
let tokenForm: URLSearchParams | null = null;
let human = true;
globalThis.fetch = (async (url: string, init?: RequestInit) => {
  if (url === "https://challenges.cloudflare.com/turnstile/v0/siteverify") {
    const form = new URLSearchParams(init!.body as string);
    return Response.json({ success: human && form.get("secret") === "ts-secret" && form.get("response") === "ts-token" });
  }
  if (url === "https://api.resend.com/emails") {
    sent.push(JSON.parse(init!.body as string));
    return new Response("{}", { status: 200 });
  }
  if (url === "https://oauth2.googleapis.com/token") {
    tokenForm = new URLSearchParams(init!.body as string);
    return Response.json({ id_token: idToken });
  }
  throw new Error(`unexpected fetch ${url}`);
}) as typeof fetch;

// --- email link
assert.equal((await run(emailRequest, post("/api/auth/email/request", { email: "nope" }))).status, 400);
let r = await run(emailRequest, post("/api/auth/email/request", { email: " Ann@Example.org ", next: "//evil.com" }));
assert.equal(r.status, 200);
assert.deepEqual(sent[0].to, ["ann@example.org"]);
assert.ok(!sent[0].text.includes("—"), "no em dashes in the email");
const link = sent[0].text.match(/https:\/\/m\.test\/signin\/verify#t=([\w-]+)\s/);
assert.ok(link, sent[0].text);
assert.ok(!sent[0].text.includes("verify#t=" + link[1] + "&"), "the link carries no address to show");
assert.equal((await env.DB.prepare("SELECT next FROM magic_links").first<{ next: string }>())?.next, "/home", "an unsafe next is dropped");
assert.equal((await env.DB.prepare("SELECT COUNT(*) AS n FROM magic_links WHERE token_hash = ?").bind(link[1]).first<{ n: number }>())?.n, 0, "only the hash is stored");

// the page asks which account the link is for, without spending it
r = await run(emailVerify, post("/api/auth/email/verify", { token: link[1], peek: true }));
assert.deepEqual(await r.json(), { email: "ann@example.org" });
assert.equal((await run(emailVerify, post("/api/auth/email/verify", { token: "nope", peek: true }))).status, 400);
r = await run(emailVerify, post("/api/auth/email/verify", { token: link[1] }));
assert.equal(r.status, 200);
assert.deepEqual(await r.json(), { next: "/home", email: "ann@example.org" });
const annCookie = cookieHeader(r);
assert.match(annCookie, /__Host-ml_session=[\w-]{40,}; ml_in=1/);
assert.equal((await run(emailVerify, post("/api/auth/email/verify", { token: link[1] }))).status, 400, "single use");
assert.equal((await run(emailVerify, post("/api/auth/email/verify", { token: "x" }))).status, 400);

r = await run(me, get("/api/me", annCookie));
const annMe = (await r.json()) as { user: { id: string; email: string }; balance: number; paddle: unknown };
assert.deepEqual([annMe.user.email, annMe.balance, annMe.paddle], ["ann@example.org", 10, null], "no Paddle config, no checkout");
assert.match(annMe.user.id, /^[0-9a-f]{32}$/, "the id checkout names in custom_data");
assert.equal(r.headers.getSetCookie().length, 0, "a fresh session isn't re-sent");

// a stored destination is checked again on the way out
const { sha256Hex } = await import("./auth.ts");
await env.DB.prepare("INSERT INTO magic_links (token_hash, email, next, expires_at) VALUES (?, 'ann@example.org', '/..//evil.com', ?)").bind(await sha256Hex("planted-token-planted-token-planted-token"), Date.now() + 60_000).run();
r = await run(emailVerify, post("/api/auth/email/verify", { token: "planted-token-planted-token-planted-token" }));
assert.equal(((await r.json()) as { next: string }).next, "/home");

// rate limits: three per address per 15 minutes from one network...
for (let i = 0; i < 2; i++) assert.equal((await run(emailRequest, post("/api/auth/email/request", { email: "ann@example.org" }))).status, 200);
r = await run(emailRequest, post("/api/auth/email/request", { email: "ann@example.org" }));
assert.equal(r.status, 429);
assert.match(await r.text(), /15 minutes/);
// ...but a stranger's requests from their network don't lock the owner out of theirs
assert.equal((await run(emailRequest, post("/api/auth/email/request", { email: "ann@example.org" }, "", "198.51.100.200"))).status, 200, "another network still gets a link");
// the day's limit per network says "tomorrow", not "15 minutes"
await env.DB.prepare("UPDATE rate_limits SET expires_at = 0 WHERE key LIKE 'mail15:%'").run();
const { fingerprint, networkKey } = await import("./auth.ts");
const annFp = await fingerprint("test-key", "ann@example.org");
const annNet = await networkKey("test-key", new Request("https://m.test/", { headers: { "cf-connecting-ip": "203.0.113.1" } }), Date.now());
await env.DB.prepare("INSERT INTO rate_limits (key, count, expires_at) VALUES (?, 10, ?) ON CONFLICT(key) DO UPDATE SET count = 10").bind(`mailday:${annFp}:${annNet}`, Date.now() + 3_600_000).run();
r = await run(emailRequest, post("/api/auth/email/request", { email: "ann@example.org" }));
assert.equal(r.status, 429);
assert.match(await r.text(), /tomorrow/);
// and an address has a ceiling across all networks (30 a day), against spam
await env.DB.prepare("INSERT INTO rate_limits (key, count, expires_at) VALUES (?, 30, ?) ON CONFLICT(key) DO UPDATE SET count = 30").bind(`mailall:${annFp}`, Date.now() + 3_600_000).run();
r = await run(emailRequest, post("/api/auth/email/request", { email: "ann@example.org" }, "", "192.0.2.77"));
assert.equal(r.status, 429);
assert.match(await r.text(), /tomorrow/);
// not set up, and the localhost dev log
assert.equal((await run(emailRequest, post("/api/auth/email/request", { email: "b@x.org" }), { ...env, RESEND_API_KEY: undefined })).status, 503);
const logged: string[] = [];
const log = console.log;
console.log = (s: string) => void logged.push(s);
r = await run(emailRequest, new Request("http://localhost:8788/api/auth/email/request", { method: "POST", body: JSON.stringify({ email: "dev@x.org" }) }), { ...env, RESEND_API_KEY: undefined, DEV_EMAIL_LOG: "1" });
console.log = log;
assert.equal(r.status, 200);
assert.match(logged.join(""), /http:\/\/localhost:8788\/signin\/verify#t=[\w-]+$/);

// new addresses: five a day per network (an IPv6 /64 counts as one)
for (let i = 1; i <= 5; i++) assert.equal((await run(emailRequest, post("/api/auth/email/request", { email: `new${i}@x.org` }, "", `2001:db8:5:6::${i}`))).status, 200, `new ${i}`);
assert.equal((await run(emailRequest, post("/api/auth/email/request", { email: "new6@x.org" }, "", "2001:db8:5:6:ffff::1"))).status, 429, "same /64");
assert.equal((await run(emailRequest, post("/api/auth/email/request", { email: "new6@x.org" }, "", "2001:db8:5:7::1"))).status, 200, "another network");
// the day's budget for new addresses spent: people with an account still get their link
await env.DB.prepare("INSERT INTO rate_limits (key, count, expires_at) VALUES ('mail-new', 90, ?) ON CONFLICT(key) DO UPDATE SET count = 90").bind(Date.now() + 3_600_000).run();
assert.equal((await run(emailRequest, post("/api/auth/email/request", { email: "new7@x.org" }, "", "198.51.100.7"))).status, 503);
const { signInUser } = await import("./auth.ts");
await signInUser(env.DB, { email: "old@x.org" }, Date.now());
assert.equal((await run(emailRequest, post("/api/auth/email/request", { email: "old@x.org" }, "", "198.51.100.7"))).status, 200);
await env.DB.prepare("DELETE FROM rate_limits WHERE key = 'mail-new'").run();
// deployed without a fingerprint key: fail closed
const keyless = { ...env, HASH_SECRET: undefined };
assert.equal((await run(emailRequest, post("/api/auth/email/request", { email: "k@x.org" }), keyless)).status, 503);
assert.equal((await run(emailVerify, post("/api/auth/email/verify", { token: "x".repeat(43) }), keyless)).status, 503);
// with Turnstile configured, a request needs a passing token
const guarded = { ...env, TURNSTILE_SECRET: "ts-secret" };
assert.equal((await run(emailRequest, post("/api/auth/email/request", { email: "t1@x.org" }, "", "192.0.2.9"), guarded)).status, 400);
assert.equal((await run(emailRequest, post("/api/auth/email/request", { email: "t1@x.org", turnstile: "ts-token" }, "", "192.0.2.9"), guarded)).status, 200);
human = false;
assert.equal((await run(emailRequest, post("/api/auth/email/request", { email: "t2@x.org", turnstile: "ts-token" }, "", "192.0.2.9"), guarded)).status, 400);
human = true;

// --- Google
r = await run(googleStart, get("/api/auth/google/start?next=/review&popup=1"));
assert.equal(r.status, 302);
const to = new URL(r.headers.get("location")!);
assert.equal(to.origin + to.pathname, "https://accounts.google.com/o/oauth2/v2/auth");
assert.equal(to.searchParams.get("scope"), "openid email");
assert.equal(to.searchParams.get("code_challenge_method"), "S256");
assert.equal(to.searchParams.get("redirect_uri"), env.GOOGLE_REDIRECT_URI);
const oauth = cookieHeader(r);
assert.match(r.headers.getSetCookie()[0], /^__Host-ml_oauth=.+; Path=\/; HttpOnly; Secure; SameSite=Lax; Max-Age=600$/);
const state = to.searchParams.get("state")!;

// a callback with the wrong state, or no cookie, is refused
r = await run(googleCallback, get(`/api/auth/google/callback?code=c&state=wrong`, oauth));
assert.match(r.headers.get("location")!, /^\/signin\?error=state/);
r = await run(googleCallback, get(`/api/auth/google/callback?code=c&state=${state}`));
assert.match(r.headers.get("location")!, /^\/signin\?error=state/);

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
const claims = { iss: "https://accounts.google.com", aud: "cid", exp: Date.now() / 1000 + 300, email_verified: true, sub: "g-ann", email: "ann@example.org" };
idToken = `${b64({})}.${b64({ ...claims, aud: "someone-else" })}.s`;
r = await run(googleCallback, get(`/api/auth/google/callback?code=c&state=${state}`, oauth));
assert.match(r.headers.get("location")!, /^\/signin\?error=google/, "claims are checked");

idToken = `${b64({})}.${b64(claims)}.s`;
r = await run(googleCallback, get(`/api/auth/google/callback?code=the-code&state=${state}`, oauth));
assert.equal(r.headers.get("location"), "/signin?done=1&next=%2Freview", "a popup lands on the page that closes it");
assert.equal(tokenForm!.get("code"), "the-code");
assert.ok(tokenForm!.get("code_verifier")!.length >= 43, "PKCE verifier sent");
const googleCookie = cookieHeader(r);
assert.match(googleCookie, /__Host-ml_oauth=; __Host-ml_session=/, "the oauth cookie is cleared");
r = await run(me, get("/api/me", googleCookie));
assert.deepEqual(await r.json(), { user: { id: annMe.user.id, email: "ann@example.org" }, balance: 10, pro: null, paddle: null }, "same account, no second welcome");

// --- sign out, and a stale hint is cleared
r = await run(logout, post("/api/auth/logout", {}, googleCookie));
assert.equal(r.status, 200);
assert.ok(r.headers.getSetCookie().every((c) => c.endsWith("Max-Age=0")));
r = await run(me, get("/api/me", googleCookie));
assert.deepEqual(await r.json(), { user: null });
assert.equal(r.headers.getSetCookie().length, 2, "hint cookie cleared");
assert.equal(((await (await run(me, get("/api/me", annCookie))).json()) as { balance: number }).balance, 10, "the other device is still in");
// with Paddle configured, the page gets what Paddle.js needs (never a secret)
const paddled = { ...env, PADDLE_ENV: "sandbox", PADDLE_CLIENT_TOKEN: "test_tok", PADDLE_PRICE_IDS: '{"S":"pri_s"}', PADDLE_API_KEY: "secret", PADDLE_WEBHOOK_SECRET: "secret" };
const withPaddle = (await (await run(me, get("/api/me", annCookie), paddled)).json()) as { paddle: unknown };
const { checkoutSig } = await import("./paddle.ts");
assert.deepEqual(withPaddle.paddle, { env: "sandbox", token: "test_tok", prices: { S: "pri_s" }, checkout: await checkoutSig("test-key", annMe.user.id) });
assert.ok(!JSON.stringify(withPaddle).includes("secret"));
await run(logout, post("/api/auth/logout", { all: true }, annCookie));
assert.deepEqual(await (await run(me, get("/api/me", annCookie))).json(), { user: null });
assert.equal((await run(me, get("/api/me"))).headers.getSetCookie().length, 0, "no hint, nothing to clear");
console.log("signin.selfcheck: OK");
