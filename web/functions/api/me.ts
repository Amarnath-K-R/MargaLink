/// <reference types="@cloudflare/workers-types" />
// GET /api/me: who is signed in and their M coin balance. The page only
// calls this when the ml_in hint cookie is set, so signed-out visitors make
// no request at all. Also where lazy housekeeping happens: unfinished
// reviews past their two hours are refunded, and the session is extended.
import { getSession, HINT_COOKIE, readCookie, rollSession, sessionCookies, withCookies, type AccountEnv } from "../../src/lib/auth.ts";
import { balance, sweepTickets } from "../../src/lib/ledger.ts";

export const onRequestGet: PagesFunction<AccountEnv> = async ({ request, env }) => {
  const now = Date.now();
  const s = await getSession(env.DB, request, now);
  if (!s) return withCookies(Response.json({ user: null }), readCookie(request, HINT_COOKIE) ? sessionCookies(null) : []);
  await sweepTickets(env.DB, now);
  const rolled = await rollSession(env.DB, s, now);
  return withCookies(Response.json({ user: { email: s.email }, balance: await balance(env.DB, s.userId) }), rolled ? sessionCookies(s.token) : []);
};
