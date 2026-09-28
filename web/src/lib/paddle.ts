/// <reference types="@cloudflare/workers-types" />
// Paddle Billing, server side: checking a webhook's signature, knowing
// which of our products a Paddle price is, and turning a webhook event
// into ledger changes. Paddle is the merchant of record: it takes the
// payment and the tax; we only ever see references and amounts.
import { PACKS, type PackId } from "./coins.ts";

const MAX_SKEW_S = 300;

const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
const sameText = (a: string, b: string) => a.length === b.length && [...a].reduce((d, c, i) => d | (c.charCodeAt(0) ^ b.charCodeAt(i)), 0) === 0;

/**
 * Paddle-Signature: "ts=<unix seconds>;h1=<hex>[;h1=<hex>…]", h1 being
 * HMAC-SHA256 over "<ts>:<raw body>" with the notification destination's
 * secret. Any h1 may match (Paddle sends two while a secret rotates); the
 * timestamp must be within five minutes, so a captured request can't be
 * replayed later (and a replay inside that window is caught by event id).
 */
export async function verifyPaddleSignature(header: string | null, raw: string, secret: string, nowMs: number): Promise<boolean> {
  if (!header) return false;
  const parts = header.split(";").map((p) => p.split("="));
  const ts = parts.find(([k]) => k === "ts")?.[1];
  const sigs = parts.filter(([k, v]) => k === "h1" && v).map(([, v]) => v.toLowerCase());
  if (!ts || !/^\d+$/.test(ts) || sigs.length === 0 || Math.abs(nowMs / 1000 - Number(ts)) > MAX_SKEW_S) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const want = hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${ts}:${raw}`)));
  return sigs.some((s) => sameText(s, want));
}

export type Product = { pack: PackId } | { pro: "month" | "year" };

/** PADDLE_PRICE_IDS, e.g. {"S":"pri_…","M":"pri_…","L":"pri_…","PRO_MONTH":"pri_…","PRO_YEAR":"pri_…"}, as price id -> product. */
export function parsePriceIds(json: string | undefined): Record<string, Product> {
  let named: Record<string, unknown>;
  try {
    named = JSON.parse(json ?? "{}");
  } catch {
    return {};
  }
  const out: Record<string, Product> = {};
  for (const [name, id] of Object.entries(named ?? {})) {
    if (typeof id !== "string") continue;
    if (PACKS.some((p) => p.id === name)) out[id] = { pack: name as PackId };
    else if (name === "PRO_MONTH") out[id] = { pro: "month" };
    else if (name === "PRO_YEAR") out[id] = { pro: "year" };
  }
  return out;
}

export type PaddleEvent = { event_id: string; event_type: string; occurred_at: string; data: Record<string, unknown> };

export const isPaddleEvent = (v: unknown): v is PaddleEvent =>
  !!v && typeof v === "object" && typeof (v as PaddleEvent).event_id === "string" && typeof (v as PaddleEvent).event_type === "string" && !!(v as PaddleEvent).data && typeof (v as PaddleEvent).data === "object";

type Rec = Record<string, unknown>;
const obj = (v: unknown): Rec => (v && typeof v === "object" ? (v as Rec) : {});
const str = (v: unknown) => (typeof v === "string" ? v : null);

const when = (v: unknown) => {
  const t = Date.parse(str(v) ?? "");
  return Number.isFinite(t) ? t : null;
};

/**
 * The ledger statements an event calls for (none for events we don't act
 * on), and whose Pro coins may now be due. Coins go to the user id our
 * checkout put in custom_data (Paddle copies it onto the subscription); a
 * pack's ledger ref is its transaction, a reversal's
 * "<transaction>:<adjustment>", so a retried or re-sent event never counts
 * twice.
 */
export async function paddleStatements(db: D1Database, e: PaddleEvent, prices: Record<string, Product>, now: number): Promise<{ statements: D1PreparedStatement[]; grantFor: string | null }> {
  const none = { statements: [], grantFor: null };
  const d = e.data;
  if (e.event_type.startsWith("subscription.")) {
    const id = str(d.id);
    const userId = str(obj(d.custom_data).user_id);
    const priceId = str(obj(obj((d.items as unknown[] | undefined)?.[0]).price).id);
    const product = priceId ? prices[priceId] : undefined;
    if (!id || !userId || !product || !("pro" in product)) {
      console.warn(`paddle: ${id ?? "a subscription"} isn't a Pro plan we can match to an account`);
      return none;
    }
    const period = obj(d.current_billing_period);
    return {
      statements: [
        db
          .prepare(
            `INSERT INTO subscriptions (id, user_id, customer_id, price_id, interval, status, period_start, period_end, cancel_at_end, event_at)
             SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10 WHERE EXISTS (SELECT 1 FROM users WHERE id = ?2)
             ON CONFLICT(id) DO UPDATE SET customer_id = excluded.customer_id, price_id = excluded.price_id, interval = excluded.interval,
               status = excluded.status, period_start = excluded.period_start, period_end = excluded.period_end,
               cancel_at_end = excluded.cancel_at_end, event_at = excluded.event_at
             WHERE excluded.event_at >= subscriptions.event_at`,
          )
          .bind(id, userId, str(d.customer_id) ?? "", priceId, product.pro, str(d.status) ?? "", when(period.starts_at), when(period.ends_at), str(obj(d.scheduled_change).action) === "cancel" ? 1 : 0, when(e.occurred_at) ?? now),
      ],
      grantFor: userId,
    };
  }
  if (e.event_type === "transaction.completed" && d.subscription_id) {
    // A Pro payment adds nothing itself (the month's grant does); it's kept so a refund can find its month.
    const txn = str(d.id);
    const userId = str(obj(d.custom_data).user_id);
    if (!txn || !userId) return none;
    return {
      statements: [
        db
          .prepare(
            `INSERT INTO purchases (txn_id, user_id, customer_id, price_id, coins, total, currency, subscription_id, period_start, created_at)
             SELECT ?1, ?2, ?3, ?4, 0, ?5, ?6, ?7, ?8, ?9 WHERE EXISTS (SELECT 1 FROM users WHERE id = ?2) ON CONFLICT DO NOTHING`,
          )
          .bind(txn, userId, str(d.customer_id), str(obj(obj((d.items as unknown[] | undefined)?.[0]).price).id) ?? "", Number(str(obj(obj(d.details).totals).total) ?? "0"), str(d.currency_code) ?? "", str(d.subscription_id), when(obj(d.billing_period).starts_at), now),
      ],
      grantFor: userId,
    };
  }
  if (e.event_type === "transaction.completed") {
    const txn = str(d.id);
    const userId = str(obj(d.custom_data).user_id);
    const priceId = str(obj(obj((d.items as unknown[] | undefined)?.[0]).price).id);
    const product = priceId ? prices[priceId] : undefined;
    if (!txn || !userId || !product || !("pack" in product)) {
      console.warn(`paddle: ${txn ?? "a transaction"} isn't a pack we can credit`);
      return none;
    }
    const coins = PACKS.find((p) => p.id === product.pack)!.coins;
    const total = Number(str(obj(obj(d.details).totals).total) ?? "0");
    return {
      grantFor: null,
      statements: [
      db
        .prepare(
          `INSERT INTO purchases (txn_id, user_id, customer_id, price_id, coins, total, currency, created_at)
           SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8 WHERE EXISTS (SELECT 1 FROM users WHERE id = ?2) ON CONFLICT DO NOTHING`,
        )
        .bind(txn, userId, str(d.customer_id), priceId, coins, total, str(d.currency_code) ?? "", now),
      db
        .prepare(
          `INSERT INTO coin_ledger (user_id, delta, kind, ref, created_at)
           SELECT ?1, ?2, 'pack', ?3, ?4 WHERE EXISTS (SELECT 1 FROM users WHERE id = ?1) ON CONFLICT DO NOTHING`,
        )
        .bind(userId, coins, txn, now),
      ],
    };
  }
  if (e.event_type === "adjustment.created" || e.event_type === "adjustment.updated") {
    // A refund once approved, or a chargeback: take back that share of what
    // it bought (a pack's coins, or the Pro month's grants).
    if (!["refund", "chargeback"].includes(str(d.action) ?? "") || str(d.status) !== "approved") return none;
    const txn = str(d.transaction_id);
    const adj = str(d.id);
    if (!txn || !adj) return none;
    const p = await db
      .prepare("SELECT user_id AS userId, coins, total, subscription_id AS sub, period_start AS start FROM purchases WHERE txn_id = ?")
      .bind(txn)
      .first<{ userId: string; coins: number; total: number; sub: string | null; start: number | null }>();
    if (!p) return none; // not ours, or the account is gone
    const bought = p.sub
      ? ((await db.prepare("SELECT COALESCE(SUM(delta), 0) AS s FROM coin_ledger WHERE kind = 'pro_grant' AND substr(ref, 1, length(?1)) = ?1").bind(`${p.sub}:${p.start}:`).first<number>("s")) ?? 0)
      : p.coins;
    const taken = -((await db.prepare("SELECT COALESCE(SUM(delta), 0) AS s FROM coin_ledger WHERE kind = 'reversal' AND substr(ref, 1, length(?1)) = ?1").bind(`${txn}:`).first<number>("s")) ?? 0);
    const left = bought - taken;
    const share = str(d.type) === "partial" && p.total > 0 ? Math.round((bought * Number(str(obj(d.totals).total) ?? "0")) / p.total) : left;
    const coins = Math.min(left, share);
    if (coins <= 0) return none;
    return {
      statements: [db.prepare("INSERT INTO coin_ledger (user_id, delta, kind, ref, created_at) VALUES (?, ?, 'reversal', ?, ?) ON CONFLICT DO NOTHING").bind(p.userId, -coins, `${txn}:${adj}`, now)],
      grantFor: null,
    };
  }
  return none;
}

// Paddle's API, for the customer portal and cancelling Pro before an account is deleted.
export type PaddleApiEnv = { PADDLE_API_KEY?: string; PADDLE_ENV?: string };
const api = (env: PaddleApiEnv, path: string, body: unknown) =>
  fetch(`${env.PADDLE_ENV === "production" ? "https://api.paddle.com" : "https://sandbox-api.paddle.com"}${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${env.PADDLE_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });

/** A signed link to Paddle's customer portal (manage or cancel Pro, receipts), or null. */
export async function portalUrl(env: PaddleApiEnv, customerId: string, subscriptionId: string | null): Promise<string | null> {
  const res = await api(env, `/customers/${encodeURIComponent(customerId)}/portal-sessions`, subscriptionId ? { subscription_ids: [subscriptionId] } : {});
  if (!res.ok) return null;
  const data = obj(obj((await res.json()) as unknown).data);
  return str(obj(obj(data.urls).general).overview);
}

export async function cancelSubscription(env: PaddleApiEnv, subscriptionId: string): Promise<boolean> {
  return (await api(env, `/subscriptions/${encodeURIComponent(subscriptionId)}/cancel`, { effective_from: "immediately" })).ok;
}
