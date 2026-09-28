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

const env = { DB: testD1(), GOOGLE_CLIENT_ID: "cid", GOOGLE_CLIENT_SECRET: "sec", GOOGLE_REDIRECT_URI: "https://m.test/api/auth/google/callback", RESEND_API_KEY: "re", EMAIL_FROM: "MargaLink <signin@m.test>" };
type Handler = (ctx: { request: Request; env: typeof env }) => Promise<Response>;
const run = (h: unknown, request: Request, e: object = env) => (h as Handler)({ request, env: e as typeof env });
const post = (path: string, body: unknown, cookie = "") => new Request(`https://m.test${path}`, { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json", cookie } });
const get = (path: string, cookie = "") => new Request(`https://m.test${path}`, { headers: { cookie } });
const cookieHeader = (res: Response) => res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");

// stub the outside world
const sent: { to: string[]; text: string }[] = [];
let idToken = "";
let tokenForm: URLSearchParams | null = null;
globalThis.fetch = (async (url: string, init?: RequestInit) => {
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
const link = sent[0].text.match(/https:\/\/m\.test\/signin\/verify#t=([\w-]+)&e=([^\s]+)/);
assert.ok(link, sent[0].text);
assert.equal(decodeURIComponent(link[2]), "ann@example.org");
assert.equal((await env.DB.prepare("SELECT next FROM magic_links").first<{ next: string }>())?.next, "/home", "an unsafe next is dropped");
assert.equal((await env.DB.prepare("SELECT COUNT(*) AS n FROM magic_links WHERE token_hash = ?").bind(link[1]).first<{ n: number }>())?.n, 0, "only the hash is stored");

r = await run(emailVerify, post("/api/auth/email/verify", { token: link[1] }));
assert.equal(r.status, 200);
assert.deepEqual(await r.json(), { next: "/home" });
const annCookie = cookieHeader(r);
assert.match(annCookie, /__Host-ml_session=[\w-]{40,}; ml_in=1/);
assert.equal((await run(emailVerify, post("/api/auth/email/verify", { token: link[1] }))).status, 400, "single use");
assert.equal((await run(emailVerify, post("/api/auth/email/verify", { token: "x" }))).status, 400);

r = await run(me, get("/api/me", annCookie));
const annMe = (await r.json()) as { user: { id: string; email: string }; balance: number; paddle: unknown };
assert.deepEqual([annMe.user.email, annMe.balance, annMe.paddle], ["ann@example.org", 10, null], "no Paddle config, no checkout");
assert.match(annMe.user.id, /^[0-9a-f]{32}$/, "the id checkout names in custom_data");
assert.equal(r.headers.getSetCookie().length, 0, "a fresh session isn't re-sent");

// rate limits: three per address per 15 minutes
for (let i = 0; i < 2; i++) assert.equal((await run(emailRequest, post("/api/auth/email/request", { email: "ann@example.org" }))).status, 200);
assert.equal((await run(emailRequest, post("/api/auth/email/request", { email: "ann@example.org" }))).status, 429);
// not set up, and the localhost dev log
assert.equal((await run(emailRequest, post("/api/auth/email/request", { email: "b@x.org" }), { ...env, RESEND_API_KEY: undefined })).status, 503);
const logged: string[] = [];
const log = console.log;
console.log = (s: string) => void logged.push(s);
r = await run(emailRequest, new Request("http://localhost:8788/api/auth/email/request", { method: "POST", body: JSON.stringify({ email: "dev@x.org" }) }), { ...env, RESEND_API_KEY: undefined, DEV_EMAIL_LOG: "1" });
console.log = log;
assert.equal(r.status, 200);
assert.match(logged.join(""), /http:\/\/localhost:8788\/signin\/verify#t=/);

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
assert.deepEqual(withPaddle.paddle, { env: "sandbox", token: "test_tok", prices: { S: "pri_s" } });
assert.ok(!JSON.stringify(withPaddle).includes("secret"));
await run(logout, post("/api/auth/logout", { all: true }, annCookie));
assert.deepEqual(await (await run(me, get("/api/me", annCookie))).json(), { user: null });
assert.equal((await run(me, get("/api/me"))).headers.getSetCookie().length, 0, "no hint, nothing to clear");
console.log("signin.selfcheck: OK");
