/// <reference types="@cloudflare/workers-types" />
// Runs before every /api Function. The API is same-origin only: a request
// that changes something (anything but GET/HEAD) must carry our own Origin,
// which with SameSite=Lax session cookies closes off cross-site requests.
// Paddle's webhook comes from Paddle, so it's exempt (it proves itself with
// a signature instead). Nothing from the API is cacheable or sniffable
// (Pages doesn't apply public/_headers to Functions). Every deployment also
// stays reachable at its own address (<hash>.margalink.pages.dev) with the
// live database and secrets, so the API answers only at the site's own
// address: an old deployment's bugs don't outlive their fix. While the beta
// runs, the AI features need an invited account and /api/admin a developer
// (access/policy.ts apiNeeds); the handlers still check their own session.
// At most once a minute, it clears expired rows after answering
// (housekeeping in ledger.ts, and the activity log's 30 days), since Pages
// has no scheduler. Every request is logged for the console after it's
// answered (telemetry/apiEvents.ts: metadata only).
import { readCookie, SESSION_COOKIE, sameOrigin, sha256Hex } from "../../src/lib/accounts/auth.ts";
import { housekeeping } from "../../src/lib/accounts/ledger.ts";
import { accessFor } from "../../src/lib/access/access.ts";
import { apiNeeds } from "../../src/lib/access/policy.ts";
import { logEvent, purgeEvents, type AiUsage } from "../../src/lib/telemetry/apiEvents.ts";

const HOUSEKEEPING_EVERY_MS = 60 * 1000;
let lastHousekeeping = 0;

const API_HEADERS = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
const refuse = (message: string, status = 403) => new Response(message, { status, headers: API_HEADERS });

type Ctx = EventContext<{ DB?: D1Database }, string, Record<string, unknown>>;

async function answer({ request, next, env, data }: Ctx, url: URL, now: number): Promise<Response> {
  if (url.hostname.endsWith(".margalink.pages.dev")) return refuse("This is an old version of MargaLink. Use margalink.com.");
  const safe = request.method === "GET" || request.method === "HEAD";
  if (!safe && url.pathname !== "/api/pay/webhook" && !sameOrigin(request)) return refuse("Cross-site request refused");
  const need = apiNeeds(url.pathname);
  if (need !== "public") {
    const access = env?.DB ? await accessFor(env.DB, request, now) : null;
    if (!access) return refuse("Sign in first.", 401);
    if (!access.approved) return refuse("This account isn't on the beta list.");
    if (need === "developer" && !access.developer) return refuse("Only MargaLink's developers can open this.");
    if (data) data.access = access;
  }
  const res = await next();
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(API_HEADERS)) out.headers.set(k, v);
  return out;
}

export const onRequest: PagesFunction<{ DB?: D1Database }> = async (ctx) => {
  const { request, env, data, waitUntil } = ctx;
  const url = new URL(request.url);
  const now = Date.now();
  // A handler that throws is logged as a 500 (the failures the log is for), then rethrown for Pages to answer.
  let res: Response | null = null;
  let crash: unknown = null;
  try {
    res = await answer(ctx, url, now);
  } catch (e) {
    crash = e;
  }
  const ms = Date.now() - now;
  if (env?.DB) {
    const db = env.DB;
    const token = readCookie(request, SESSION_COOKIE);
    const chores: Promise<unknown>[] = [
      // ponytail: /api/me (every tab focus) will be most of the rows; skip or sample it here if the table grows too fast
      logEvent(db, { at: now, idHash: token && token.length <= 100 ? await sha256Hex(token) : null, route: url.pathname, method: request.method, status: res?.status ?? 500, ms, ai: data?.ai as AiUsage | undefined }),
    ];
    if (now - lastHousekeeping > HOUSEKEEPING_EVERY_MS) {
      lastHousekeeping = now;
      chores.push(housekeeping(db, now), purgeEvents(db, now));
    }
    waitUntil(Promise.all(chores).catch((e) => console.error(`after-request chores failed: ${e instanceof Error ? e.message : e}`)));
  }
  if (!res) throw crash;
  return res;
};
