/// <reference types="@cloudflare/workers-types" />
// Daily limits on the AI features, in D1's rate_limits table. Three per
// feature: the service's (the owner's Anthropic spend); each account's, so
// that one account, refunded for every try that fails, can't use up
// everyone's day; and a share of the service's for accounts that never
// bought coins, so throwaway accounts on welcome coins can't book out paying
// ones. A use is reserved before the upstream call with one conditional
// increment per limit, so requests arriving together can't all slip under
// one. Keys carry the UTC date and expire after two days (housekeeping).
import { DAILY_PASS_CAP } from "../review/reviewPasses.ts";

export const DAILY = {
  // A review is one pass per section plus a cross-check: a typical one 4-8,
  // a long thorough one about 27, retries included in the budget.
  reviewPass: { all: DAILY_PASS_CAP, user: 150, free: 900 },
  figure: { all: 200, user: 50, free: 120 },
  // At most about $130 a day of Claude at the largest Expand; raise after the beta.
  rewrite: { all: 1000, user: 100, free: 400 },
} as const;
export type Feature = keyof typeof DAILY;

const TTL_MS = 2 * 24 * 60 * 60 * 1000;
const day = (now: number) => new Date(now).toISOString().slice(0, 10);

export const capKeys = (f: Feature, userId: string, now: number) => ({ all: `${f}:${day(now)}`, user: `${f}:${userId}:${day(now)}`, free: `${f}:free:${day(now)}` });

// Has this account ever bought coins (a pack, or Pro)?
const paying = async (db: D1Database, userId: string) =>
  !!(await db.prepare("SELECT 1 AS y FROM coin_ledger WHERE user_id = ? AND kind IN ('pack', 'pro_grant') LIMIT 1").bind(userId).first());

/** What's left today: service-wide (for a free account, of the free share too), and for this account. Advisory: reserveUse decides. */
export async function leftToday(db: D1Database, f: Feature, userId: string, now: number): Promise<{ all: number; user: number }> {
  const k = capKeys(f, userId, now);
  const rows = (await db.prepare("SELECT key, count FROM rate_limits WHERE key IN (?1, ?2, ?3) AND expires_at > ?4").bind(k.all, k.user, k.free, now).all<{ key: string; count: number }>()).results;
  const left = (key: string, limit: number) => Math.max(0, limit - (rows.find((r) => r.key === key)?.count ?? 0));
  const all = left(k.all, DAILY[f].all);
  return { all: (await paying(db, userId)) ? all : Math.min(all, left(k.free, DAILY[f].free)), user: left(k.user, DAILY[f].user) };
}

export type Reservation = { ok: true; release: () => Promise<void> } | { ok: false; full: "all" | "user" };

/**
 * Reserves one use before the upstream call: each limit is incremented only
 * while under it (one statement per key, in one batch), and if any is full,
 * what this request took on the others is given back. `release()` hands the
 * use back when the request is refused for another reason before the call.
 */
export async function reserveUse(db: D1Database, f: Feature, userId: string, now: number): Promise<Reservation> {
  const k = capKeys(f, userId, now);
  const limits: [name: "all" | "user" | "free", key: string, limit: number][] = [
    ["all", k.all, DAILY[f].all],
    ["user", k.user, DAILY[f].user],
    ...((await paying(db, userId)) ? [] : [["free", k.free, DAILY[f].free] as ["free", string, number]]),
  ];
  const res = await db.batch(
    limits.map(([, key, limit]) =>
      db
        .prepare("INSERT INTO rate_limits (key, count, expires_at) VALUES (?1, 1, ?2) ON CONFLICT(key) DO UPDATE SET count = count + 1 WHERE rate_limits.count < ?3 RETURNING count")
        .bind(key, now + TTL_MS, limit),
    ),
  );
  const took = limits.filter((_, i) => res[i].results.length > 0);
  const giveBack = () => (took.length ? db.batch(took.map(([, key]) => db.prepare("UPDATE rate_limits SET count = count - 1 WHERE key = ? AND count > 0").bind(key))).then(() => {}) : Promise.resolve());
  if (took.length === limits.length) return { ok: true, release: giveBack };
  await giveBack();
  return { ok: false, full: took.some(([name]) => name === "user") ? "all" : "user" };
}
