/// <reference types="@cloudflare/workers-types" />
// Runs before every /api Function. The API is same-origin only: a request
// that changes something (anything but GET/HEAD) must carry our own Origin,
// which with SameSite=Lax session cookies closes off cross-site requests.
// Paddle's webhook comes from Paddle, so it's exempt (it proves itself with
// a signature instead). Nothing from the API is cacheable.
import { sameOrigin } from "../../src/lib/auth.ts";

export const onRequest: PagesFunction = async ({ request, next }) => {
  const safe = request.method === "GET" || request.method === "HEAD";
  if (!safe && new URL(request.url).pathname !== "/api/pay/webhook" && !sameOrigin(request)) return new Response("Cross-site request refused", { status: 403 });
  const res = await next();
  const out = new Response(res.body, res);
  out.headers.set("Cache-Control", "no-store");
  return out;
};
