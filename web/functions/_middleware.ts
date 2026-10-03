/// <reference types="@cloudflare/workers-types" />
// The page gate (the closed beta). public/_routes.json sends every request
// here but the static assets (access/policy.ts routesJson): /api/* goes
// straight on to the API's own gate; every other path is read canonically
// (pageNeeds), so /HOME or /h%6Fme is judged as /home. The dashboard and
// tools (each page, its .txt payloads, what Next's router fetches on a
// client-side navigation, and its folder): signed out, to the sign-in page,
// which comes back here after; not on the list, the sign-in page says so;
// not a developer, /admin goes to /home. A payload request gets a bare 401
// instead, so the router falls back to loading the page, which then
// redirects; so does a HEAD, which Next sends to check a link before
// prefetching it: a redirect there would be remembered as where the link
// leads ("/home is /signin") until the page reloads, so a person who signs
// in on a page that loaded signed out couldn't follow its links. A browser
// opens a page with a GET, which still gets the redirect. Pages doesn't apply public/_headers to a response that passed
// through a Function, so every page served here gets its headers from
// PAGE_HEADERS, and a gated one is cached nowhere shared (it depends on who's
// asking).
import { accessFor } from "../src/lib/access/access.ts";
import { PAGE_HEADERS, pageNeeds } from "../src/lib/access/policy.ts";

const NO_STORE = { "Cache-Control": "no-store" };

export const onRequest: PagesFunction<{ DB?: D1Database }> = async ({ request, next, env }) => {
  const url = new URL(request.url);
  if (/^\/api\//i.test(url.pathname)) return next();
  const need = pageNeeds(url.pathname);
  if (need !== "public") {
    const access = env?.DB ? await accessFor(env.DB, request, Date.now()) : null;
    const to = !access
      ? `/signin?next=${encodeURIComponent(url.pathname + url.search)}`
      : !access.approved
        ? "/signin?error=not-approved"
        : need === "developer" && !access.developer
          ? "/home"
          : null;
    if (to) return request.method === "HEAD" || /\.txt$/i.test(url.pathname) ? new Response(null, { status: 401, headers: NO_STORE }) : new Response(null, { status: 302, headers: { Location: to, ...NO_STORE } });
  }
  const res = await next();
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(PAGE_HEADERS)) out.headers.set(k, v);
  if (need !== "public") out.headers.set("Cache-Control", "private, no-cache");
  return out;
};
