/// <reference types="@cloudflare/workers-types" />
// GET /api/me: who is signed in and their M coin balance, plus what
// Paddle.js needs to open a checkout (public values only). The page only
// calls this when the ml_in hint cookie is set, so signed-out visitors make
// no request at all. Also where lazy housekeeping happens: unfinished
// reviews past their two hours are refunded, Pro's monthly coins are
// granted when due, and the session is extended. `access` says what the
// account may open while the beta runs (access/access.ts).
import { hashSecret, HINT_COOKIE, readCookie, rollSession, sessionCookies, withCookies, type AccountEnv } from "../../src/lib/accounts/auth.ts";
import { checkoutSig } from "../../src/lib/accounts/paddle.ts";
import { balance, grantDuePro, sweepTickets } from "../../src/lib/accounts/ledger.ts";
import { accessFor } from "../../src/lib/access/access.ts";

type Env = AccountEnv & { PADDLE_ENV?: string; PADDLE_CLIENT_TOKEN?: string; PADDLE_PRICE_IDS?: string };

// `checkout`: this account's signature, which the checkout passes back in
// custom_data so the webhook credits only the account that bought.
async function paddleConfig(env: Env, request: Request, userId: string) {
  const secret = hashSecret(env, request);
  if (!env.PADDLE_CLIENT_TOKEN || !env.PADDLE_PRICE_IDS || !secret) return null;
  try {
    const prices = JSON.parse(env.PADDLE_PRICE_IDS) as Record<string, string>;
    return { env: env.PADDLE_ENV === "production" ? "production" : "sandbox", token: env.PADDLE_CLIENT_TOKEN, prices, checkout: await checkoutSig(secret, userId) };
  } catch {
    return null;
  }
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const now = Date.now();
  const a = await accessFor(env.DB, request, now);
  if (!a) return withCookies(Response.json({ user: null }), readCookie(request, HINT_COOKIE) ? sessionCookies(null) : []);
  const s = a.session;
  await sweepTickets(env.DB, now);
  await grantDuePro(env.DB, s.userId, now);
  const rolled = await rollSession(env.DB, s, now);
  const sub = await env.DB.prepare("SELECT interval, status, cancel_at_end AS cancelAtEnd, period_end AS periodEnd FROM subscriptions WHERE user_id = ? AND status != 'canceled' ORDER BY event_at DESC LIMIT 1")
    .bind(s.userId)
    .first<{ interval: "month" | "year"; status: string; cancelAtEnd: number; periodEnd: number | null }>();
  const pro = sub ? { interval: sub.interval, status: sub.status, renews: sub.status === "active" && !sub.cancelAtEnd, periodEnd: sub.periodEnd } : null;
  const body = { user: { id: s.userId, email: s.email }, balance: await balance(env.DB, s.userId), pro, paddle: await paddleConfig(env, request, s.userId), access: { approved: a.approved, developer: a.developer } };
  return withCookies(Response.json(body), rolled ? sessionCookies(s.token) : []);
};
