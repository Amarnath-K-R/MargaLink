/// <reference types="@cloudflare/workers-types" />
// Runs before every /api Function. The API is same-origin only: a request
// that changes something (anything but GET/HEAD) must carry our own Origin,
// which with SameSite=Lax session cookies closes off cross-site requests.
// Paddle's webhook comes from Paddle, so it's exempt (it proves itself with
// a signature instead). Nothing from the API is cacheable or sniffable
// (Pages doesn't apply public/_headers to Functions). Every deployment also
// stays reachable at its own address (<hash>.margalink.pages.dev) with the
// live database and secrets, so the API answers only at the site's own
// address: an old deployment's bugs don't outlive their fix. And, at most
// once a minute, it clears expired rows after answering (housekeeping in
// ledger.ts), since Pages has no scheduler.
import { sameOrigin } from "../../src/lib/accounts/auth.ts";
import { housekeeping } from "../../src/lib/accounts/ledger.ts";

const HOUSEKEEPING_EVERY_MS = 60 * 1000;
let lastHousekeeping = 0;

const API_HEADERS = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
const refuse = (message: string) => new Response(message, { status: 403, headers: API_HEADERS });

export const onRequest: PagesFunction<{ DB?: D1Database }> = async ({ request, next, env, waitUntil }) => {
  const url = new URL(request.url);
  if (url.hostname.endsWith(".margalink.pages.dev")) return refuse("This is an old version of MargaLink. Use margalink.pages.dev.");
  const safe = request.method === "GET" || request.method === "HEAD";
  if (!safe && url.pathname !== "/api/pay/webhook" && !sameOrigin(request)) return refuse("Cross-site request refused");
  const now = Date.now();
  if (env?.DB && now - lastHousekeeping > HOUSEKEEPING_EVERY_MS) {
    lastHousekeeping = now;
    waitUntil(housekeeping(env.DB, now).catch((e) => console.error(`housekeeping failed: ${e instanceof Error ? e.message : e}`)));
  }
  const res = await next();
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(API_HEADERS)) out.headers.set(k, v);
  return out;
};
