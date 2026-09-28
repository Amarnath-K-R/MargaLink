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

/**
 * The ledger statements an event calls for (none for events we don't act
 * on). Coins go to the user id our checkout put in custom_data; a pack's
 * ledger ref is its transaction, a reversal's "<transaction>:<adjustment>",
 * so a retried or re-sent event never counts twice.
 */
export async function paddleStatements(db: D1Database, e: PaddleEvent, prices: Record<string, Product>, now: number): Promise<D1PreparedStatement[]> {
  const d = e.data;
  if (e.event_type === "transaction.completed" && !d.subscription_id) {
    const txn = str(d.id);
    const userId = str(obj(d.custom_data).user_id);
    const priceId = str(obj(obj((d.items as unknown[] | undefined)?.[0]).price).id);
    const product = priceId ? prices[priceId] : undefined;
    if (!txn || !userId || !product || !("pack" in product)) {
      console.warn(`paddle: ${txn ?? "a transaction"} isn't a pack we can credit`);
      return [];
    }
    const coins = PACKS.find((p) => p.id === product.pack)!.coins;
    const total = Number(str(obj(obj(d.details).totals).total) ?? "0");
    return [
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
    ];
  }
  if (e.event_type === "adjustment.created" || e.event_type === "adjustment.updated") {
    // A refund once approved, or a chargeback: take back that share of the pack.
    if (!["refund", "chargeback"].includes(str(d.action) ?? "") || str(d.status) !== "approved") return [];
    const txn = str(d.transaction_id);
    const adj = str(d.id);
    if (!txn || !adj) return [];
    const p = await db.prepare("SELECT user_id AS userId, coins, total FROM purchases WHERE txn_id = ?").bind(txn).first<{ userId: string; coins: number; total: number }>();
    if (!p) return []; // not a pack (a Pro renewal), or the account is gone
    const taken = -((await db.prepare("SELECT COALESCE(SUM(delta), 0) AS s FROM coin_ledger WHERE kind = 'reversal' AND substr(ref, 1, length(?1)) = ?1").bind(`${txn}:`).first<number>("s")) ?? 0);
    const left = p.coins - taken;
    const share = str(d.type) === "partial" && p.total > 0 ? Math.round((p.coins * Number(str(obj(d.totals).total) ?? "0")) / p.total) : left;
    const coins = Math.min(left, share);
    if (coins <= 0) return [];
    return [db.prepare("INSERT INTO coin_ledger (user_id, delta, kind, ref, created_at) VALUES (?, ?, 'reversal', ?, ?) ON CONFLICT DO NOTHING").bind(p.userId, -coins, `${txn}:${adj}`, now)];
  }
  return [];
}
