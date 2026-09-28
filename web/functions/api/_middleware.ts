/// <reference types="@cloudflare/workers-types" />
// Runs before every /api Function. The API is same-origin only: a request
// that changes something (anything but GET/HEAD) must carry our own Origin,
// which with SameSite=Lax session cookies closes off cross-site requests.
// Paddle's webhook comes from Paddle, so it's exempt (it proves itself with
// a signature instead). Nothing from the API is cacheable. And, at most once
// a minute, it clears expired rows after answering (housekeeping in
// ledger.ts), since Pages has no scheduler.
import { sameOrigin } from "../../src/lib/auth.ts";
import { housekeeping } from "../../src/lib/ledger.ts";

const HOUSEKEEPING_EVERY_MS = 60 * 1000;
let lastHousekeeping = 0;

export const onRequest: PagesFunction<{ DB?: D1Database }> = async ({ request, next, env, waitUntil }) => {
  const safe = request.method === "GET" || request.method === "HEAD";
  if (!safe && new URL(request.url).pathname !== "/api/pay/webhook" && !sameOrigin(request)) return new Response("Cross-site request refused", { status: 403 });
  const now = Date.now();
  if (env?.DB && now - lastHousekeeping > HOUSEKEEPING_EVERY_MS) {
    lastHousekeeping = now;
    waitUntil(housekeeping(env.DB, now).catch((e) => console.error(`housekeeping failed: ${e instanceof Error ? e.message : e}`)));
  }
  const res = await next();
  const out = new Response(res.body, res);
  out.headers.set("Cache-Control", "no-store");
  return out;
};
