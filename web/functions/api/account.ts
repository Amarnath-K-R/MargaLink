/// <reference types="@cloudflare/workers-types" />
// GET /api/account: what the account page shows (address, balance, coin
// history). GET /api/account?download=1: everything we hold about the
// account, as a JSON file. POST /api/account {delete: "<their address>"}:
// deletes the account and everything tied to it (foreign keys cascade);
// only the welcome fingerprint in welcome_claims stays (no address in it),
// for 12 months (housekeeping deletes it then).
// Pro is cancelled at Paddle first, so a deleted account is never charged.
import { fingerprint, getSession, hashSecret, readJson, sessionCookies, text, withCookies, type AccountEnv } from "../../src/lib/auth.ts";
import { cancelSubscription, type PaddleApiEnv } from "../../src/lib/paddle.ts";
import { normalEmail } from "../../src/lib/coins.ts";
import { balance, history, releaseWelcomeStatement } from "../../src/lib/ledger.ts";

type Env = AccountEnv & PaddleApiEnv;

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const s = await getSession(env.DB, request, Date.now());
  if (!s) return text("Sign in first.", 401);
  const google = !!(await env.DB.prepare("SELECT 1 AS y FROM identities WHERE user_id = ?").bind(s.userId).first());
  if (new URL(request.url).searchParams.get("download") !== "1") {
    const agreed = await env.DB.prepare("SELECT created_at AS since, notice_version AS noticeVersion FROM users WHERE id = ?").bind(s.userId).first<{ since: number; noticeVersion: number }>();
    return Response.json({ email: s.email, balance: await balance(env.DB, s.userId), google, history: await history(env.DB, s.userId, 200), ...agreed });
  }
  const account = await env.DB.prepare("SELECT id, email, created_at AS createdAt, notice_version AS noticeVersion FROM users WHERE id = ?").bind(s.userId).first();
  const identities = (await env.DB.prepare("SELECT provider, subject FROM identities WHERE user_id = ?").bind(s.userId).all()).results;
  const sessions = (await env.DB.prepare("SELECT expires_at AS expiresAt FROM sessions WHERE user_id = ?").bind(s.userId).all()).results;
  const ledger = (await env.DB.prepare("SELECT kind, delta, ref, created_at AS at FROM coin_ledger WHERE user_id = ? ORDER BY id").bind(s.userId).all()).results;
  const purchases = (
    await env.DB.prepare(
      "SELECT txn_id AS txn, customer_id AS customer, price_id AS price, coins, total, currency, subscription_id AS subscription, period_start AS periodStart, created_at AS at FROM purchases WHERE user_id = ?",
    )
      .bind(s.userId)
      .all()
  ).results;
  const subscriptions = (
    await env.DB.prepare("SELECT id, customer_id AS customer, price_id AS price, interval, status, period_start AS periodStart, period_end AS periodEnd, cancel_at_end AS cancelAtEnd FROM subscriptions WHERE user_id = ?")
      .bind(s.userId)
      .all()
  ).results;
  const adjustments = (
    await env.DB.prepare("SELECT a.id, a.txn_id AS txn, a.action, a.share, a.coins, a.created_at AS at FROM adjustments a JOIN purchases p ON p.txn_id = a.txn_id WHERE p.user_id = ?").bind(s.userId).all()
  ).results;
  // A running review's ticket: section ids and lengths, tries, which came back. Never text.
  const reviews = (
    await env.DB.prepare(
      `SELECT t.tier, t.coins, t.chunks, t.passes, t.synthesized, t.created_at AS startedAt, t.expires_at AS expiresAt,
              (SELECT json_group_array(chunk_id) FROM review_deliveries d WHERE d.ticket = t.id_hash) AS delivered
       FROM review_tickets t WHERE t.user_id = ?`,
    )
      .bind(s.userId)
      .all()
  ).results;
  // Who has received this account's data (the right to know who it was shared with).
  const usedAi = ledger.some((e) => ["review", "figure"].includes(String(e.kind)));
  const sharedWith = [
    { name: "Cloudflare", what: "Hosts the site and this account's database (its main copy in the Asia Pacific region)." },
    ...(google ? [{ name: "Google", what: "Confirmed your email address and gave us its id for you when you signed in with Google." }] : []),
    { name: "Resend", what: "Sent your sign-in emails: your address and each link, if you asked for one." },
    ...(purchases.length || subscriptions.length ? [{ name: "Paddle", what: "Sold you coins or Pro as merchant of record; the purchases above are its references." }] : []),
    ...(usedAi ? [{ name: "Anthropic", what: "Received the text you chose to send for AI reviews or Ask Claude requests, never your account details." }] : []),
  ];
  const data = { exportedAt: new Date().toISOString(), account, signInWithGoogle: google, identities, sessions, coins: { balance: await balance(env.DB, s.userId), ledger }, purchases, subscriptions, adjustments, reviews, sharedWith };
  return new Response(JSON.stringify(data, null, 2), {
    headers: { "content-type": "application/json", "content-disposition": 'attachment; filename="margalink-account-data.json"' },
  });
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const s = await getSession(env.DB, request, Date.now());
  if (!s) return text("Sign in first.", 401);
  const body = await readJson(request);
  if (typeof body?.delete !== "string" || normalEmail(body.delete) !== s.email) return text("Type your account's email address to confirm.", 400);
  const live = (await env.DB.prepare("SELECT id FROM subscriptions WHERE user_id = ? AND status != 'canceled'").bind(s.userId).all<{ id: string }>()).results;
  for (const sub of live) {
    if (!(await cancelSubscription(env, sub.id))) return text("We couldn't cancel your Pro subscription, so nothing was deleted. Try again in a minute.", 502);
  }
  // The account cascades; what's keyed by its address (sign-in links, their counters) goes too.
  const secret = hashSecret(env, request);
  const fp = secret ? await fingerprint(secret, s.email) : null;
  await env.DB.batch([
    env.DB.prepare("DELETE FROM users WHERE id = ?").bind(s.userId),
    env.DB.prepare("DELETE FROM magic_links WHERE email = ?").bind(s.email),
    // the address's counters: mail15:<fp>:<network>, mailday:<fp>:<network>, mailall:<fp>
    ...(fp ? [env.DB.prepare("DELETE FROM rate_limits WHERE instr(key, ?) > 0").bind(`:${fp}`)] : []),
    ...(secret ? [await releaseWelcomeStatement(env.DB, s.email, Date.now(), secret)] : []),
  ]);
  return withCookies(Response.json({ ok: true }), sessionCookies(null));
};
