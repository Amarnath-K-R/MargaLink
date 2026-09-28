/// <reference types="@cloudflare/workers-types" />
// GET /api/auth/google/callback: Google sends the browser back here with a
// code. We check the state against our cookie, swap the code (with our
// secret and the PKCE verifier) for an id_token, check its claims, and sign
// the account in. A popup lands on /signin?done=1, which closes itself; the
// page that opened it notices on focus.
import { checkIdClaims, createSession, jwtPayload, OAUTH_COOKIE, readCookie, redirect, safeNext, sessionCookies, signInUser, type AccountEnv } from "../../../../src/lib/auth.ts";
import { grantWelcome } from "../../../../src/lib/ledger.ts";

const decodeNext = (s: string) => {
  try {
    return new TextDecoder().decode(Uint8Array.from(atob(s.replaceAll("-", "+").replaceAll("_", "/")), (c) => c.charCodeAt(0)));
  } catch {
    return null;
  }
};

export const onRequestGet: PagesFunction<AccountEnv> = async ({ request, env }) => {
  const now = Date.now();
  const url = new URL(request.url);
  const [state, verifier, popup, nextB64] = (readCookie(request, OAUTH_COOKIE) ?? "").split(".");
  const next = safeNext(decodeNext(nextB64 ?? ""));
  const clear = `${OAUTH_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
  const fail = (code: string) => redirect(`/signin?error=${code}&next=${encodeURIComponent(next)}${popup === "1" ? "&popup=1" : ""}`, [clear]);

  if (!state || !verifier || url.searchParams.get("state") !== state) return fail("state");
  if (url.searchParams.get("error")) return fail("cancelled");
  const code = url.searchParams.get("code");
  if (!code || !env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.GOOGLE_REDIRECT_URI) return fail("google");

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, redirect_uri: env.GOOGLE_REDIRECT_URI, grant_type: "authorization_code", code_verifier: verifier }).toString(),
  });
  if (!res.ok) return fail("google");
  const { id_token } = (await res.json()) as { id_token?: string };
  const who = checkIdClaims(jwtPayload(id_token ?? ""), env.GOOGLE_CLIENT_ID, now);
  if (typeof who === "string") return fail("google");

  const user = await signInUser(env.DB, { email: who.email, google: who.sub }, now);
  await grantWelcome(env.DB, user.id, user.email, now);
  const token = await createSession(env.DB, user.id, now);
  return redirect(popup === "1" ? `/signin?done=1&next=${encodeURIComponent(next)}` : next, [clear, ...sessionCookies(token)]);
};
