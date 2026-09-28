/// <reference types="@cloudflare/workers-types" />
// POST /api/auth/email/verify {token}: spends a sign-in link (deleted as it
// is read, so it works once) and signs the browser in. Opening the link
// proves the inbox, which is the email verification. With {token, peek:
// true} it only says which address the link is for, so the page can ask
// "Sign in as …?" truthfully before anything is spent.
import { createSession, readJson, safeNext, sessionCookies, sha256Hex, signInUser, text, withCookies, type AccountEnv } from "../../../../src/lib/auth.ts";
import { grantWelcome } from "../../../../src/lib/ledger.ts";

export const onRequestPost: PagesFunction<AccountEnv> = async ({ request, env }) => {
  const now = Date.now();
  const body = await readJson(request);
  const token = typeof body?.token === "string" ? body.token : "";
  const gone = () => text("This sign-in link has expired or was already used. Ask for a new one.", 400);
  if (!token || token.length > 100) return gone();
  const hash = await sha256Hex(token);
  if (body?.peek === true) {
    const email = await env.DB.prepare("SELECT email FROM magic_links WHERE token_hash = ? AND expires_at > ?").bind(hash, now).first<string>("email");
    return email ? Response.json({ email }) : gone();
  }
  const link = await env.DB.prepare("DELETE FROM magic_links WHERE token_hash = ? RETURNING email, next, expires_at AS expiresAt").bind(hash).first<{ email: string; next: string; expiresAt: number }>();
  if (!link || link.expiresAt <= now) return gone();

  const user = await signInUser(env.DB, { email: link.email }, now);
  await grantWelcome(env.DB, user.id, user.email, now);
  return withCookies(Response.json({ next: safeNext(link.next), email: user.email }), sessionCookies(await createSession(env.DB, user.id, now)));
};
