/// <reference types="@cloudflare/workers-types" />
// GET /api/auth/google/start?next=/path[&popup=1]: off to Google's consent
// screen (scope "openid email" only: no name, no photo). The state, the PKCE
// verifier and where to return go in a 10-minute HttpOnly cookie that only
// the callback reads.
import { b64url, OAUTH_COOKIE, pkce, randomToken, redirect, safeNext, type AccountEnv } from "../../../../src/lib/auth.ts";

export const onRequestGet: PagesFunction<AccountEnv> = async ({ request, env }) => {
  const url = new URL(request.url);
  const next = safeNext(url.searchParams.get("next"));
  const popup = url.searchParams.get("popup") === "1";
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.GOOGLE_REDIRECT_URI) return redirect(`/signin?error=google-off&next=${encodeURIComponent(next)}${popup ? "&popup=1" : ""}`);
  const state = randomToken(16);
  const { verifier, challenge } = await pkce();
  const to = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  to.search = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: env.GOOGLE_REDIRECT_URI,
    response_type: "code",
    scope: "openid email",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    prompt: "select_account",
  }).toString();
  const value = [state, verifier, popup ? "1" : "0", b64url(new TextEncoder().encode(next))].join(".");
  return redirect(to.toString(), [`${OAUTH_COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`]);
};
