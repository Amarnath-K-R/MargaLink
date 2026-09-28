/// <reference types="@cloudflare/workers-types" />
// GET /api/account: what the account page shows (address, balance, coin
// history). GET /api/account?download=1: everything we hold about the
// account, as a JSON file. POST /api/account {delete: "<their address>"}:
// deletes the account and everything tied to it (foreign keys cascade);
// only the welcome fingerprint in welcome_claims stays (no address in it).
import { getSession, readJson, sessionCookies, text, withCookies, type AccountEnv } from "../../src/lib/auth.ts";
import { normalEmail } from "../../src/lib/coins.ts";
import { balance, history } from "../../src/lib/ledger.ts";

export const onRequestGet: PagesFunction<AccountEnv> = async ({ request, env }) => {
  const s = await getSession(env.DB, request, Date.now());
  if (!s) return text("Sign in first.", 401);
  const google = !!(await env.DB.prepare("SELECT 1 AS y FROM identities WHERE user_id = ?").bind(s.userId).first());
  if (new URL(request.url).searchParams.get("download") !== "1") {
    return Response.json({ email: s.email, balance: await balance(env.DB, s.userId), google, history: await history(env.DB, s.userId, 200) });
  }
  const account = await env.DB.prepare("SELECT email, created_at AS createdAt, notice_version AS noticeVersion FROM users WHERE id = ?").bind(s.userId).first();
  const sessions = (await env.DB.prepare("SELECT expires_at AS expiresAt FROM sessions WHERE user_id = ?").bind(s.userId).all()).results;
  const ledger = (await env.DB.prepare("SELECT kind, delta, ref, created_at AS at FROM coin_ledger WHERE user_id = ? ORDER BY id").bind(s.userId).all()).results;
  const data = { exportedAt: new Date().toISOString(), account, signInWithGoogle: google, sessions, coins: { balance: await balance(env.DB, s.userId), ledger } };
  return new Response(JSON.stringify(data, null, 2), {
    headers: { "content-type": "application/json", "content-disposition": 'attachment; filename="margalink-account-data.json"' },
  });
};

export const onRequestPost: PagesFunction<AccountEnv> = async ({ request, env }) => {
  const s = await getSession(env.DB, request, Date.now());
  if (!s) return text("Sign in first.", 401);
  const body = await readJson(request);
  if (typeof body?.delete !== "string" || normalEmail(body.delete) !== s.email) return text("Type your account's email address to confirm.", 400);
  await env.DB.prepare("DELETE FROM users WHERE id = ?").bind(s.userId).run();
  return withCookies(Response.json({ ok: true }), sessionCookies(null));
};
