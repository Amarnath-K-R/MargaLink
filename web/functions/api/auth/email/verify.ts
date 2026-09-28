/// <reference types="@cloudflare/workers-types" />
// POST /api/auth/email/verify {token}: spends a sign-in link (deleted as it
// is read, so it works once) and signs the browser in. Opening the link
// proves the inbox, which is the email verification.
import { createSession, readJson, sessionCookies, sha256Hex, signInUser, text, withCookies, type AccountEnv } from "../../../../src/lib/auth.ts";
import { grantWelcome } from "../../../../src/lib/ledger.ts";

export const onRequestPost: PagesFunction<AccountEnv> = async ({ request, env }) => {
  const now = Date.now();
  const body = await readJson(request);
  const token = typeof body?.token === "string" ? body.token : "";
  const gone = () => text("This sign-in link has expired or was already used. Ask for a new one.", 400);
  if (!token || token.length > 100) return gone();
  const link = await env.DB.prepare("DELETE FROM magic_links WHERE token_hash = ? RETURNING email, next, expires_at AS expiresAt")
    .bind(await sha256Hex(token))
    .first<{ email: string; next: string; expiresAt: number }>();
  if (!link || link.expiresAt <= now) return gone();

  const user = await signInUser(env.DB, { email: link.email }, now);
  await grantWelcome(env.DB, user.id, user.email, now);
  return withCookies(Response.json({ next: link.next }), sessionCookies(await createSession(env.DB, user.id, now)));
};
