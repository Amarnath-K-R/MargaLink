/// <reference types="@cloudflare/workers-types" />
// GET /api/me: who is signed in and their M coin balance, plus what
// Paddle.js needs to open a checkout (public values only). The page only
// calls this when the ml_in hint cookie is set, so signed-out visitors make
// no request at all. Also where lazy housekeeping happens: unfinished
// reviews past their two hours are refunded, and the session is extended.
import { getSession, HINT_COOKIE, readCookie, rollSession, sessionCookies, withCookies, type AccountEnv } from "../../src/lib/auth.ts";
import { balance, sweepTickets } from "../../src/lib/ledger.ts";

type Env = AccountEnv & { PADDLE_ENV?: string; PADDLE_CLIENT_TOKEN?: string; PADDLE_PRICE_IDS?: string };

function paddleConfig(env: Env) {
  if (!env.PADDLE_CLIENT_TOKEN || !env.PADDLE_PRICE_IDS) return null;
  try {
    return { env: env.PADDLE_ENV === "production" ? "production" : "sandbox", token: env.PADDLE_CLIENT_TOKEN, prices: JSON.parse(env.PADDLE_PRICE_IDS) as Record<string, string> };
  } catch {
    return null;
  }
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const now = Date.now();
  const s = await getSession(env.DB, request, now);
  if (!s) return withCookies(Response.json({ user: null }), readCookie(request, HINT_COOKIE) ? sessionCookies(null) : []);
  await sweepTickets(env.DB, now);
  const rolled = await rollSession(env.DB, s, now);
  const body = { user: { id: s.userId, email: s.email }, balance: await balance(env.DB, s.userId), paddle: paddleConfig(env) };
  return withCookies(Response.json(body), rolled ? sessionCookies(s.token) : []);
};
