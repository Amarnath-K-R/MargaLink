// Runnable check for Pro: subscription events kept in order, monthly
// coins granted once per month (a yearly plan drips), unspent Pro coins
// carried over up to the cap, nothing while a payment is overdue or after
// cancelling, a refunded Pro payment taking back its month, the customer
// portal, and deleting an account cancelling Pro at Paddle first.
//   node src/lib/pro.selfcheck.ts
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { testD1 } from "./testD1.ts";
import { createSession, signInUser } from "./auth.ts";
import { balance, debit, grantDuePro } from "./ledger.ts";
import { PRO } from "./coins.ts";
import { onRequestPost as webhook } from "../../functions/api/pay/webhook.ts";
import { onRequestPost as portal } from "../../functions/api/pay/portal.ts";
import { onRequestPost as account } from "../../functions/api/account.ts";
import { onRequestGet as me } from "../../functions/api/me.ts";

const SECRET = "whsec";
const env = { DB: testD1(), PADDLE_WEBHOOK_SECRET: SECRET, PADDLE_API_KEY: "pdl_key", PADDLE_ENV: "sandbox", PADDLE_PRICE_IDS: JSON.stringify({ S: "pri_s", PRO_MONTH: "pri_pm", PRO_YEAR: "pri_py" }) };
type Handler = (ctx: { request: Request; env: typeof env }) => Promise<Response>;
const DAY = 864e5;
const t0 = Date.parse("2026-10-01T00:00:00Z");
const iso = (t: number) => new Date(t).toISOString();

let seq = 0;
const deliver = (type: string, data: object, occurredAt = Date.now()) => {
  const raw = JSON.stringify({ event_id: `evt_${++seq}`, event_type: type, occurred_at: iso(occurredAt), data });
  const ts = Math.floor(Date.now() / 1000);
  const sig = `ts=${ts};h1=${createHmac("sha256", SECRET).update(`${ts}:${raw}`).digest("hex")}`;
  return (webhook as unknown as Handler)({ request: new Request("https://m.test/api/pay/webhook", { method: "POST", body: raw, headers: { "paddle-signature": sig } }), env });
};
const sub = (userId: string, o: { id?: string; status?: string; price?: string; start: number; end: number; cancel?: boolean }) => ({
  id: o.id ?? "sub_1",
  status: o.status ?? "active",
  customer_id: "ctm_1",
  custom_data: { user_id: userId },
  items: [{ price: { id: o.price ?? "pri_pm" } }],
  current_billing_period: { starts_at: iso(o.start), ends_at: iso(o.end) },
  scheduled_change: o.cancel ? { action: "cancel", effective_at: iso(o.end) } : null,
});

const u = await signInUser(env.DB, { email: "ann@x.org" }, t0);

// a monthly plan: the webhook records it; the month is granted once, however often asked
await deliver("subscription.created", sub(u.id, { start: t0, end: t0 + 31 * DAY }), t0);
await grantDuePro(env.DB, u.id, t0 + DAY);
await grantDuePro(env.DB, u.id, t0 + 2 * DAY);
assert.equal(await balance(env.DB, u.id), PRO.coinsPerMonth);

// renewals: unspent Pro coins carry over, up to the cap
await deliver("subscription.updated", sub(u.id, { start: t0 + 31 * DAY, end: t0 + 61 * DAY }), t0 + 31 * DAY);
await grantDuePro(env.DB, u.id, t0 + 32 * DAY);
assert.equal(await balance(env.DB, u.id), 200, "100 carried + 100 new");
await deliver("subscription.updated", sub(u.id, { start: t0 + 61 * DAY, end: t0 + 92 * DAY }), t0 + 61 * DAY);
await grantDuePro(env.DB, u.id, t0 + 62 * DAY);
assert.equal(await balance(env.DB, u.id), 200, "only 100 carry over; the rest lapse");
assert.ok(await debit(env.DB, u.id, 150, "admin", "spend", t0 + 63 * DAY));

// an older event arriving late changes nothing
await deliver("subscription.updated", sub(u.id, { status: "past_due", start: t0, end: t0 + 31 * DAY }), t0 + 5 * DAY);
const row = await env.DB.prepare("SELECT status, period_start AS s FROM subscriptions WHERE id = 'sub_1'").first<{ status: string; s: number }>();
assert.deepEqual([row?.status, row?.s], ["active", t0 + 61 * DAY]);

// overdue: no coins for the new period until it's paid
await deliver("subscription.past_due", sub(u.id, { status: "past_due", start: t0 + 92 * DAY, end: t0 + 122 * DAY }), t0 + 92 * DAY);
await grantDuePro(env.DB, u.id, t0 + 93 * DAY);
assert.equal(await balance(env.DB, u.id), 50);
await deliver("subscription.updated", sub(u.id, { start: t0 + 92 * DAY, end: t0 + 122 * DAY }), t0 + 94 * DAY);
await grantDuePro(env.DB, u.id, t0 + 94 * DAY);
assert.equal(await balance(env.DB, u.id), 150, "paid: granted; the 50 left carried over");

// a refunded Pro payment takes back that month's coins
await deliver("transaction.completed", { id: "txn_r", subscription_id: "sub_1", customer_id: "ctm_1", currency_code: "USD", custom_data: { user_id: u.id }, items: [{ price: { id: "pri_pm" } }], details: { totals: { total: "900" } }, billing_period: { starts_at: iso(t0 + 92 * DAY), ends_at: iso(t0 + 122 * DAY) } });
assert.equal(await balance(env.DB, u.id), 150, "a Pro payment itself adds nothing; the month's grant does");
await deliver("adjustment.created", { id: "adj_r", action: "refund", status: "approved", type: "full", transaction_id: "txn_r", subscription_id: "sub_1", totals: { total: "900" } });
assert.equal(await balance(env.DB, u.id), 50);

// cancelled: no more months
await deliver("subscription.canceled", sub(u.id, { status: "canceled", start: t0 + 92 * DAY, end: t0 + 122 * DAY }), t0 + 100 * DAY);
await grantDuePro(env.DB, u.id, t0 + 130 * DAY);
assert.equal(await balance(env.DB, u.id), 50);

// a yearly plan drips a month at a time
const y = await signInUser(env.DB, { email: "yan@x.org" }, t0);
await deliver("subscription.created", sub(y.id, { id: "sub_y", price: "pri_py", start: t0, end: t0 + 365 * DAY }), t0);
await grantDuePro(env.DB, y.id, t0 + 45 * DAY);
assert.equal(await balance(env.DB, y.id), 200, "two months in");
await grantDuePro(env.DB, y.id, t0 + 400 * DAY);
assert.equal(await balance(env.DB, y.id), 200, "then the cap: 100 carried + 100, month after month");
const grants = await env.DB.prepare("SELECT COUNT(*) AS n FROM coin_ledger WHERE user_id = ? AND kind = 'pro_grant'").bind(y.id).first<{ n: number }>();
assert.equal(grants?.n, 12, "twelve grants in a year, no more");

// a charge landing between the grant's read of the ledger and its write doesn't make too much lapse
const w = await signInUser(env.DB, { email: "wes@x.org" }, t0);
await deliver("subscription.created", sub(w.id, { id: "sub_w", start: t0, end: t0 + 31 * DAY }), t0);
await grantDuePro(env.DB, w.id, t0 + DAY);
await deliver("subscription.updated", sub(w.id, { id: "sub_w", start: t0 + 31 * DAY, end: t0 + 61 * DAY }), t0 + 31 * DAY);
await grantDuePro(env.DB, w.id, t0 + 32 * DAY);
assert.equal(await balance(env.DB, w.id), 200);
await deliver("subscription.updated", sub(w.id, { id: "sub_w", start: t0 + 61 * DAY, end: t0 + 92 * DAY }), t0 + 61 * DAY);
let raced = false;
const racy = new Proxy(env.DB, {
  get(target, prop) {
    if (prop === "batch" && !raced) {
      return async (stmts: D1PreparedStatement[]) => {
        raced = true;
        await debit(env.DB, w.id, 150, "review", "raced", t0 + 62 * DAY);
        return target.batch(stmts);
      };
    }
    const v = Reflect.get(target, prop);
    return typeof v === "function" ? v.bind(target) : v;
  },
}) as D1Database;
await grantDuePro(racy, w.id, t0 + 62 * DAY);
assert.equal(await balance(env.DB, w.id), 150, "200 - 150 spent = 50 Pro left, nothing to lapse, + 100");

// a yearly plan refunded by half: the year's allowance halves, and the drips stop there
const h = await signInUser(env.DB, { email: "hal@x.org" }, t0);
await deliver("subscription.created", sub(h.id, { id: "sub_h", price: "pri_py", start: t0, end: t0 + 365 * DAY }), t0);
const yearTxn = (id: string, userId: string, subId: string) => ({ id, subscription_id: subId, customer_id: "ctm_1", currency_code: "USD", custom_data: { user_id: userId }, items: [{ price: { id: "pri_py" } }], details: { totals: { total: "9000" } }, billing_period: { starts_at: iso(t0), ends_at: iso(t0 + 365 * DAY) } });
await deliver("transaction.completed", yearTxn("txn_h", h.id, "sub_h"));
await grantDuePro(env.DB, h.id, t0 + DAY);
await deliver("adjustment.created", { id: "adj_h", action: "refund", status: "approved", type: "partial", transaction_id: "txn_h", subscription_id: "sub_h", totals: { total: "4500" } });
assert.equal(await balance(env.DB, h.id), 100, "one month in, well within half a year's coins: nothing taken back");
await grantDuePro(env.DB, h.id, t0 + 400 * DAY);
const hGrants = await env.DB.prepare("SELECT COUNT(*) AS n, SUM(delta) AS s FROM coin_ledger WHERE user_id = ? AND kind = 'pro_grant'").bind(h.id).first<{ n: number; s: number }>();
assert.deepEqual([hGrants?.n, hGrants?.s], [6, 600], "six months of a half-refunded year");

// refunded in full in its first month: that month taken back, no more months
const f = await signInUser(env.DB, { email: "fay@x.org" }, t0);
await deliver("subscription.created", sub(f.id, { id: "sub_f", price: "pri_py", start: t0, end: t0 + 365 * DAY }), t0);
await deliver("transaction.completed", yearTxn("txn_f", f.id, "sub_f"));
await grantDuePro(env.DB, f.id, t0 + DAY);
await deliver("adjustment.created", { id: "adj_f", action: "refund", status: "approved", type: "full", transaction_id: "txn_f", subscription_id: "sub_f", totals: { total: "9000" } });
assert.equal(await balance(env.DB, f.id), 0);
await grantDuePro(env.DB, f.id, t0 + 400 * DAY);
assert.equal(await balance(env.DB, f.id), 0, "no months after a full refund");
assert.equal((await env.DB.prepare("SELECT kind FROM coin_ledger WHERE user_id = ? AND delta < 0").bind(f.id).first<{ kind: string }>())?.kind, "pro_reversal");

// /api/me says what the plan is
const yCookie = `__Host-ml_session=${await createSession(env.DB, y.id, Date.now())}`;
const mine = (await (await (me as unknown as Handler)({ request: new Request("https://m.test/api/me", { headers: { cookie: yCookie } }), env })).json()) as { pro: unknown };
assert.deepEqual(mine.pro, { interval: "year", status: "active", renews: true, periodEnd: t0 + 365 * DAY });

// the customer portal, and deleting an account with Pro
const calls: { url: string; body: string }[] = [];
let paddleUp = true;
let alreadyCancelled = false;
globalThis.fetch = (async (url: string, init?: RequestInit) => {
  calls.push({ url, body: String(init?.body ?? "") });
  if (!paddleUp) return new Response("{}", { status: 500 });
  if (alreadyCancelled && url.includes("/cancel")) return Response.json({ error: { code: "subscription_update_when_canceled" } }, { status: 400 });
  if (url.includes("/portal-sessions")) return Response.json({ data: { urls: { general: { overview: "https://customer-portal.paddle.com/x" } } } });
  return Response.json({ data: {} });
}) as typeof fetch;
const post = (h: unknown, path: string, body: unknown, cookie: string) =>
  (h as Handler)({ request: new Request(`https://m.test${path}`, { method: "POST", body: JSON.stringify(body), headers: { cookie } }), env });
assert.equal((await post(portal, "/api/pay/portal", {}, "")).status, 401);
const r = await post(portal, "/api/pay/portal", {}, yCookie);
assert.deepEqual(await r.json(), { url: "https://customer-portal.paddle.com/x" });
assert.equal(calls[0].url, "https://sandbox-api.paddle.com/customers/ctm_1/portal-sessions");
const aCookie = `__Host-ml_session=${await createSession(env.DB, u.id, Date.now())}`;
assert.equal((await post(portal, "/api/pay/portal", {}, aCookie)).status, 200, "a cancelled plan's portal still opens (receipts)");

paddleUp = false;
assert.equal((await post(account, "/api/account", { delete: "yan@x.org" }, yCookie)).status, 502, "Pro couldn't be cancelled: nothing is deleted");
assert.ok(await env.DB.prepare("SELECT 1 FROM users WHERE id = ?").bind(y.id).first());
paddleUp = true;
// Paddle says there's nothing to cancel (already cancelled there): that doesn't block deleting
const z = await signInUser(env.DB, { email: "zed@x.org" }, t0);
await deliver("subscription.created", sub(z.id, { id: "sub_z", start: t0, end: t0 + 31 * DAY }), t0);
const zCookie = `__Host-ml_session=${await createSession(env.DB, z.id, Date.now())}`;
alreadyCancelled = true;
assert.equal((await post(account, "/api/account", { delete: "zed@x.org" }, zCookie)).status, 200);
alreadyCancelled = false;
calls.length = 0;
assert.equal((await post(account, "/api/account", { delete: "yan@x.org" }, yCookie)).status, 200);
assert.equal(calls[0].url, "https://sandbox-api.paddle.com/subscriptions/sub_y/cancel");
assert.equal(JSON.parse(calls[0].body).effective_from, "immediately");
assert.equal(await env.DB.prepare("SELECT 1 FROM subscriptions WHERE id = 'sub_y'").first(), null, "gone with the account");
calls.length = 0;
assert.equal((await post(account, "/api/account", { delete: "ann@x.org" }, aCookie)).status, 200);
assert.equal(calls.length, 0, "a cancelled plan isn't cancelled again");
console.log("pro.selfcheck: OK");
