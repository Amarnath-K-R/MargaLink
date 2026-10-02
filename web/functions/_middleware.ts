/// <reference types="@cloudflare/workers-types" />
// The page gate (the closed beta). Runs only on the paths public/_routes.json
// lists: /api/*, which goes straight on to the API's own gate, and the
// dashboard and tools (access/policy.ts): each page, its .txt payloads (what
// Next's router fetches on a client-side navigation) and its folder. Signed
// out: to the sign-in page, which comes back here after. Not on the list:
// the sign-in page says so. Not a developer: /admin goes to /home. A payload
// request gets a bare 401 instead, so the router falls back to loading the
// page, which then redirects. Pages doesn't apply public/_headers to a
// Function's response, so a page let through gets them here, and is cached
// nowhere shared (it depends on who's asking).
import { accessFor } from "../src/lib/access/access.ts";
import { PAGE_HEADERS, pageNeeds } from "../src/lib/access/policy.ts";

const NO_STORE = { "Cache-Control": "no-store" };

export const onRequest: PagesFunction<{ DB?: D1Database }> = async ({ request, next, env }) => {
  const url = new URL(request.url);
  const need = url.pathname.startsWith("/api/") ? "public" : pageNeeds(url.pathname);
  if (need === "public") return next();
  const access = env?.DB ? await accessFor(env.DB, request, Date.now()) : null;
  const to = !access
    ? `/signin?next=${encodeURIComponent(url.pathname + url.search)}`
    : !access.approved
      ? "/signin?error=not-approved"
      : need === "developer" && !access.developer
        ? "/home"
        : null;
  if (to) return url.pathname.endsWith(".txt") ? new Response(null, { status: 401, headers: NO_STORE }) : new Response(null, { status: 302, headers: { Location: to, ...NO_STORE } });
  const res = await next();
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(PAGE_HEADERS)) out.headers.set(k, v);
  out.headers.set("Cache-Control", "private, no-cache");
  return out;
};
