// Runnable check for paddle.ts and functions/api/pay/webhook.ts: Paddle's
// signature (checked against node:crypto as an independent oracle), a pack
// purchase credited once however often Paddle retries, refunds (pending,
// then approved; full and partial) and chargebacks taking coins back once,
// and everything unsigned, unknown or malformed changing nothing.
//   node src/lib/paddle.selfcheck.ts
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { testD1 } from "./testD1.ts";
import { signInUser } from "./auth.ts";
import { balance } from "./ledger.ts";
import { parsePriceIds, verifyPaddleSignature } from "./paddle.ts";
import { onRequestPost as webhook } from "../../functions/api/pay/webhook.ts";

const SECRET = "pdl_ntfset_test_secret";
const sign = (raw: string, ts: number, secret = SECRET) => `ts=${ts};h1=${createHmac("sha256", secret).update(`${ts}:${raw}`).digest("hex")}`;
const now = Date.now();
const nowS = Math.floor(now / 1000);

// --- the signature
const body = '{"event_id":"evt_1"}';
assert.equal(await verifyPaddleSignature(sign(body, nowS), body, SECRET, now), true);
assert.equal(await verifyPaddleSignature(sign(body, nowS, "other"), body, SECRET, now), false, "wrong secret");
assert.equal(await verifyPaddleSignature(sign(body, nowS), `${body} `, SECRET, now), false, "tampered body");
assert.equal(await verifyPaddleSignature(sign(body, nowS - 301), body, SECRET, now), false, "too old");
assert.equal(await verifyPaddleSignature(sign(body, nowS + 301), body, SECRET, now), false, "from the future");
const rotated = `${sign(body, nowS, "old").replace(/^ts=\d+;/, `ts=${nowS};`)};${sign(body, nowS).split(";")[1]}`;
assert.equal(await verifyPaddleSignature(rotated, body, SECRET, now), true, "any h1 may match (secret rotation)");
for (const bad of [null, "", "garbage", `ts=${nowS}`, `h1=abc`, `ts=x;h1=${"0".repeat(64)}`]) assert.equal(await verifyPaddleSignature(bad, body, SECRET, now), false, String(bad));

// --- price ids come from the environment
const PRICES = JSON.stringify({ S: "pri_s", M: "pri_m", L: "pri_l", PRO_MONTH: "pri_pm", PRO_YEAR: "pri_py" });
assert.deepEqual(parsePriceIds(PRICES)["pri_m"], { pack: "M" });
assert.deepEqual(parsePriceIds(PRICES)["pri_py"], { pro: "year" });
assert.deepEqual(parsePriceIds(undefined), {});
assert.deepEqual(parsePriceIds("not json"), {});

// --- the webhook
const env = { DB: testD1(), PADDLE_WEBHOOK_SECRET: SECRET, PADDLE_PRICE_IDS: PRICES };
type Handler = (ctx: { request: Request; env: typeof env }) => Promise<Response>;
const deliver = async (event: object, opts: { e?: object; header?: string } = {}) => {
  const raw = JSON.stringify(event);
  const req = new Request("https://m.test/api/pay/webhook", { method: "POST", body: raw, headers: { "paddle-signature": opts.header ?? sign(raw, Math.floor(Date.now() / 1000)) } });
  return (webhook as unknown as Handler)({ request: req, env: (opts.e ?? env) as typeof env });
};
const u = await signInUser(env.DB, { email: "ann@x.org" }, now);
const txn = (id: string, eventId: string, price: string, total: string, userId: string | null = u.id) => ({
  event_id: eventId,
  event_type: "transaction.completed",
  occurred_at: new Date().toISOString(),
  data: { id, status: "completed", customer_id: "ctm_1", subscription_id: null, currency_code: "USD", custom_data: userId ? { user_id: userId } : null, items: [{ price: { id: price }, quantity: 1 }], details: { totals: { total } } },
});
const adj = (id: string, eventId: string, txnId: string, action: string, status: string, type: string, total: string, eventType = "adjustment.created") => ({
  event_id: eventId,
  event_type: eventType,
  occurred_at: new Date().toISOString(),
  data: { id, action, status, type, transaction_id: txnId, totals: { total } },
});

// unsigned, unconfigured, malformed
assert.equal((await deliver(txn("txn_1", "evt_a", "pri_s", "600"), { header: "ts=1;h1=00" })).status, 401);
assert.equal((await deliver(txn("txn_1", "evt_a", "pri_s", "600"), { e: { ...env, PADDLE_WEBHOOK_SECRET: undefined } })).status, 503);
assert.equal(await balance(env.DB, u.id), 0, "nothing changed");

// a pack: credited once, however often it's delivered
assert.equal((await deliver(txn("txn_1", "evt_a", "pri_s", "600"))).status, 200);
assert.equal((await deliver(txn("txn_1", "evt_a", "pri_s", "600"))).status, 200, "a retry is acknowledged");
assert.equal((await deliver(txn("txn_1", "evt_a2", "pri_s", "600"))).status, 200, "even under a new event id");
assert.equal(await balance(env.DB, u.id), 50);

// refunds: pending does nothing; approved takes the coins back, once
assert.equal((await deliver(adj("adj_1", "evt_b", "txn_1", "refund", "pending_approval", "full", "600"))).status, 200);
assert.equal(await balance(env.DB, u.id), 50, "a refund still pending changes nothing");
await deliver(adj("adj_1", "evt_c", "txn_1", "refund", "approved", "full", "600", "adjustment.updated"));
await deliver(adj("adj_1", "evt_c2", "txn_1", "refund", "approved", "full", "600", "adjustment.updated"));
assert.equal(await balance(env.DB, u.id), 0);

// a partial refund takes back its share; a chargeback, whatever is left
await deliver(txn("txn_2", "evt_d", "pri_m", "1500"));
assert.equal(await balance(env.DB, u.id), 150);
await deliver(adj("adj_2", "evt_e", "txn_2", "refund", "approved", "partial", "500"));
assert.equal(await balance(env.DB, u.id), 100, "a third of the price, a third of the coins");
await deliver(adj("adj_3", "evt_f", "txn_2", "chargeback", "approved", "full", "1500"));
assert.equal(await balance(env.DB, u.id), 0, "never more than was bought");

// spent coins can't escape a refund: the balance goes negative and blocks spending
await deliver(txn("txn_3", "evt_g", "pri_s", "600"));
await env.DB.prepare("INSERT INTO coin_ledger (user_id, delta, kind, ref, created_at) VALUES (?, -30, 'review', 'r1', 0)").bind(u.id).run();
await deliver(adj("adj_4", "evt_h", "txn_3", "refund", "approved", "full", "600"));
assert.equal(await balance(env.DB, u.id), -30);

// unknown price, unknown or missing user, other events: acknowledged, no coins
const before = await balance(env.DB, u.id);
assert.equal((await deliver(txn("txn_4", "evt_i", "pri_unknown", "600"))).status, 200);
assert.equal((await deliver(txn("txn_5", "evt_j", "pri_s", "600", "no-such-user"))).status, 200);
assert.equal((await deliver(txn("txn_6", "evt_k", "pri_s", "600", null))).status, 200);
assert.equal((await deliver({ event_id: "evt_l", event_type: "customer.updated", occurred_at: "", data: {} })).status, 200);
assert.equal(await balance(env.DB, u.id), before);
assert.equal((await deliver({ nope: 1 })).status, 400);
console.log("paddle.selfcheck: OK");
