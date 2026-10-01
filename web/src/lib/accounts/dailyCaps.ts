/// <reference types="@cloudflare/workers-types" />
// Daily limits on the two AI features, counted in D1's rate_limits table
// with one atomic upsert per use (the KV counters these replace were
// get-then-put, and lost counts when requests arrived together). Two
// limits each: the service's (the owner's Anthropic spend) and each
// account's, so that one account, refunded for every try that fails,
// can't use up everyone's day. Keys carry the UTC date and expire after two
// days (housekeeping clears them).
import { DAILY_PASS_CAP } from "../review/reviewPasses.ts";

export const DAILY = {
  // A review is one pass per section plus a cross-check: a typical one 4-8,
  // a long thorough one about 27, retries included in the budget.
  reviewPass: { all: DAILY_PASS_CAP, user: 150 },
  figure: { all: 200, user: 50 },
} as const;
export type Feature = keyof typeof DAILY;

const TTL_MS = 2 * 24 * 60 * 60 * 1000;
const day = (now: number) => new Date(now).toISOString().slice(0, 10);

export const capKeys = (f: Feature, userId: string, now: number) => ({ all: `${f}:${day(now)}`, user: `${f}:${userId}:${day(now)}` });

/** What's left today: service-wide, and for this account. */
export async function leftToday(db: D1Database, f: Feature, userId: string, now: number): Promise<{ all: number; user: number }> {
  const k = capKeys(f, userId, now);
  const rows = (await db.prepare("SELECT key, count FROM rate_limits WHERE key IN (?1, ?2) AND expires_at > ?3").bind(k.all, k.user, now).all<{ key: string; count: number }>()).results;
  const used = (key: string) => rows.find((r) => r.key === key)?.count ?? 0;
  return { all: Math.max(0, DAILY[f].all - used(k.all)), user: Math.max(0, DAILY[f].user - used(k.user)) };
}

/** Counts one use against both limits. */
export async function countUse(db: D1Database, f: Feature, userId: string, now: number): Promise<void> {
  const k = capKeys(f, userId, now);
  const upsert = (key: string) =>
    db.prepare("INSERT INTO rate_limits (key, count, expires_at) VALUES (?1, 1, ?2) ON CONFLICT(key) DO UPDATE SET count = count + 1").bind(key, now + TTL_MS);
  await db.batch([upsert(k.all), upsert(k.user)]);
}
