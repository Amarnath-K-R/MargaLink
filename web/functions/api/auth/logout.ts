/// <reference types="@cloudflare/workers-types" />
// POST /api/auth/logout {all?: true}: signs this browser out, or every
// browser the account is signed in on.
import { endSession, getSession, readJson, sessionCookies, withCookies, type AccountEnv } from "../../../src/lib/auth.ts";

export const onRequestPost: PagesFunction<AccountEnv> = async ({ request, env }) => {
  const s = await getSession(env.DB, request, Date.now());
  if (s) await endSession(env.DB, s, (await readJson(request))?.all === true);
  return withCookies(Response.json({ ok: true }), sessionCookies(null));
};
