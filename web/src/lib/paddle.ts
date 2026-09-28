/// <reference types="@cloudflare/workers-types" />
// Paddle Billing, server side: checking a webhook's signature, knowing
// which of our products a Paddle price is, and turning a webhook event
// into ledger changes. Paddle is the merchant of record: it takes the
// payment and the tax; we only ever see references and amounts.
import { PACKS, PRO, type PackId } from "./coins.ts";
import { fingerprint } from "./auth.ts";

/** What /api/me gives the signed-in buyer to pass in custom_data: proof the checkout was theirs. */
export const checkoutSig = (secret: string, userId: string) => fingerprint(secret, `checkout:${userId}`);

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
 * on), whose Pro coins may now be due, and whether to answer "not yet":
 * an event that refers to something we haven't seen (a refund of a purchase,
 * a dispute won before its chargeback) is left for Paddle to send again.
 * Coins go to the account our checkout named in custom_data, and only with
 * that account's signature (checkoutSig), so nobody can buy coins onto
 * someone else's account; Paddle copies it onto the subscription. A pack's
 * ledger ref is its transaction, a reversal's "<transaction>:<adjustment>",
 * so a retried or re-sent event never counts twice.
 */
export async function paddleStatements(
  db: D1Database,
  e: PaddleEvent,
  prices: Record<string, Product>,
  now: number,
  secret: string | null,
): Promise<{ statements: D1PreparedStatement[]; grantFor: string | null; retryLater?: boolean }> {
  const none = { statements: [], grantFor: null };
  const later = { statements: [], grantFor: null, retryLater: true };
  const d = e.data;
  const named = async (cd: unknown) => {
    const userId = str(obj(cd).user_id);
    const sig = str(obj(cd).sig);
    return userId && sig && secret && sameText(sig, await checkoutSig(secret, userId)) ? userId : null;
  };
  // An event about a subscription we already know may not carry custom_data, so it's looked up there.
  const knownOwner = async (subId: string | null) =>
    subId ? await db.prepare("SELECT user_id AS u FROM subscriptions WHERE id = ?").bind(subId).first<string>("u") : null;
  if (e.event_type.startsWith("subscription.")) {
    const id = str(d.id);
    const userId = (await named(d.custom_data)) ?? (await knownOwner(id));
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
    const userId = (await named(d.custom_data)) ?? (await knownOwner(str(d.subscription_id)));
    if (!txn) return none;
    if (!userId) return later; // its subscription hasn't arrived yet
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
    // A pack purchase; a quantity above one is that many packs.
    const txn = str(d.id);
    const userId = await named(d.custom_data);
    let coins = 0;
    let priceId: string | null = null;
    for (const item of (d.items as unknown[] | undefined) ?? []) {
      const id = str(obj(obj(item).price).id);
      const product = id ? prices[id] : undefined;
      if (!product || !("pack" in product)) continue;
      const quantity = Number(obj(item).quantity ?? 1);
      coins += PACKS.find((p) => p.id === product.pack)!.coins * (Number.isInteger(quantity) && quantity > 0 ? quantity : 1);
      priceId ??= id;
    }
    if (!txn || !userId || coins === 0) {
      console.warn(`paddle: ${txn ?? "a transaction"} isn't a pack we can credit`);
      return none;
    }
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
    const action = str(d.action) ?? "";
    const txn = str(d.transaction_id);
    const adj = str(d.id);
    if (!["refund", "chargeback", "chargeback_reverse"].includes(action) || str(d.status) !== "approved" || !txn || !adj) return none;
    const p = await db
      .prepare(
        `SELECT p.user_id AS userId, p.coins, p.total, p.subscription_id AS sub, p.period_start AS start, s.interval
         FROM purchases p LEFT JOIN subscriptions s ON s.id = p.subscription_id WHERE p.txn_id = ?`,
      )
      .bind(txn)
      .first<{ userId: string; coins: number; total: number; sub: string | null; start: number | null; interval: "month" | "year" | null }>();
    if (!p) return later; // its purchase hasn't arrived yet (or never will: Paddle stops retrying in time)
    // Everything this purchase put in or took out of the ledger shares a ref prefix:
    // a pack's is its transaction; a Pro payment's, the billing period it paid for.
    const prefix = p.sub ? `${p.sub}:${p.start}:` : `${txn}:`;
    const ref = p.sub ? `${prefix}r:${adj}` : `${prefix}${adj}`;
    const sum = (kinds: string) => `(SELECT COALESCE(SUM(delta), 0) FROM coin_ledger WHERE kind IN (${kinds}) AND substr(ref, 1, length(?5)) = ?5)`;

    if (action === "chargeback_reverse") {
      if (!(await db.prepare("SELECT 1 AS y FROM adjustments WHERE txn_id = ? AND action = 'chargeback'").bind(txn).first())) return later;
      // A dispute won: give back what this purchase's chargebacks took, once,
      // and let a Pro period count as paid again.
      return {
        grantFor: null,
        statements: [
          db
            .prepare(
              `INSERT INTO coin_ledger (user_id, delta, kind, ref, created_at)
               SELECT ?1, x, 'reinstated', ?2, ?3 FROM (
                 SELECT COALESCE((SELECT SUM(coins) FROM adjustments WHERE txn_id = ?4 AND action = 'chargeback'), 0) - ${sum("'reinstated'")} AS x
               ) WHERE x > 0 ON CONFLICT DO NOTHING`,
            )
            .bind(p.userId, `${prefix}x:${adj}`, now, txn, prefix),
          db
            .prepare(
              `INSERT INTO adjustments (id, txn_id, action, share, created_at)
               SELECT ?1, ?2, 'chargeback_reverse', -COALESCE((SELECT SUM(share) FROM adjustments WHERE txn_id = ?2 AND action IN ('chargeback', 'chargeback_reverse')), 0), ?3
               ON CONFLICT DO NOTHING`,
            )
            .bind(adj, txn, now),
        ],
      };
    }

    // A refund once approved, or a chargeback. The amount is worked out inside
    // the statement, from the ledger as it is then, so two landing at once
    // can't both take the same coins.
    const share = str(d.type) === "partial" && p.total > 0 ? Math.min(1, Number(str(obj(d.totals).total) ?? "0") / p.total) : 1;
    const record = db.prepare("INSERT INTO adjustments (id, txn_id, action, share, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT DO NOTHING").bind(adj, txn, action, share, now);
    const take = p.sub
      ? // Pro: the period is now worth its entitlement times what's left unrefunded; take back what was granted beyond that.
        db
          .prepare(
            `INSERT INTO coin_ledger (user_id, delta, kind, ref, created_at)
             SELECT ?1, -(net - allowed), 'pro_reversal', ?2, ?3 FROM (
               SELECT ${sum("'pro_grant', 'pro_reversal', 'reinstated'")} AS net,
                      CAST(?6 * (1 - MIN(1.0, (SELECT COALESCE(SUM(share), 0) FROM adjustments WHERE txn_id = ?4))) AS INTEGER) AS allowed
             ) WHERE net > allowed ON CONFLICT DO NOTHING`,
          )
          .bind(p.userId, ref, now, txn, prefix, PRO.coinsPerMonth * (p.interval === "year" ? 12 : 1))
      : // A pack: its share of the coins, never more than it has left.
        db
          .prepare(
            `INSERT INTO coin_ledger (user_id, delta, kind, ref, created_at)
             SELECT ?1, -x, 'reversal', ?2, ?3 FROM (
               SELECT MIN(?6, ?7 + ${sum("'reversal', 'reinstated'")}) AS x
             ) WHERE x > 0 ON CONFLICT DO NOTHING`,
          )
          .bind(p.userId, ref, now, txn, prefix, Math.round(p.coins * share), p.coins);
    const note = db.prepare("UPDATE adjustments SET coins = COALESCE((SELECT -delta FROM coin_ledger WHERE ref = ?1 AND kind IN ('reversal', 'pro_reversal')), 0) WHERE id = ?2").bind(ref, adj);
    return { statements: [record, take, note], grantFor: null };
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

/**
 * Cancels Pro at once. true: cancelled, or Paddle says there's nothing to
 * cancel (any 4xx but auth and rate limits: already cancelled, unknown).
 * false: Paddle couldn't be asked (down, rate-limited, our key refused), so
 * the caller mustn't assume it's cancelled.
 */
export async function cancelSubscription(env: PaddleApiEnv, subscriptionId: string): Promise<boolean> {
  const res = await api(env, `/subscriptions/${encodeURIComponent(subscriptionId)}/cancel`, { effective_from: "immediately" }).catch(() => null);
  if (!res) return false;
  return res.ok || (res.status >= 400 && res.status < 500 && ![401, 403, 429].includes(res.status));
}
