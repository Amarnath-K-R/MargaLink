/// <reference types="@cloudflare/workers-types" />
// The M coin ledger's SQL (server-side only). Append-only: the balance is
// SUM(delta), a debit is one conditional INSERT (so two at once can't both
// spend the last coins), and UNIQUE(kind, ref) makes every row idempotent.
import { canonicalEmail, dueProGrants, ledgerLabel, proCoinsLeft, PRO, WELCOME_COINS, type LedgerKind } from "./coins.ts";
import { sha256Hex } from "./auth.ts";

export async function balance(db: D1Database, userId: string): Promise<number> {
  return (await db.prepare("SELECT COALESCE(SUM(delta), 0) AS b FROM coin_ledger WHERE user_id = ?").bind(userId).first<number>("b")) ?? 0;
}

/** The statement for a debit that only happens if the balance covers it. */
export const debitStatement = (db: D1Database, userId: string, coins: number, kind: LedgerKind, ref: string, now: number) =>
  db
    .prepare(
      `INSERT INTO coin_ledger (user_id, delta, kind, ref, created_at)
       SELECT ?1, -?2, ?3, ?4, ?5 WHERE (SELECT COALESCE(SUM(delta), 0) FROM coin_ledger WHERE user_id = ?1) >= ?2
       ON CONFLICT DO NOTHING`,
    )
    .bind(userId, coins, kind, ref, now);

/** Takes `coins` if the balance covers them; false if it doesn't (or `ref` was charged already). */
export async function debit(db: D1Database, userId: string, coins: number, kind: LedgerKind, ref: string, now: number): Promise<boolean> {
  return (await debitStatement(db, userId, coins, kind, ref, now).run()).meta.changes === 1;
}

/** Adds coins once per (kind, ref); false if that ref was credited already. */
export async function credit(db: D1Database, userId: string, coins: number, kind: LedgerKind, ref: string, now: number): Promise<boolean> {
  const r = await db.prepare("INSERT INTO coin_ledger (user_id, delta, kind, ref, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT DO NOTHING").bind(userId, coins, kind, ref, now).run();
  return r.meta.changes === 1;
}

/** The welcome bonus, once per canonical address ever (the fingerprint outlives account deletion). */
export async function grantWelcome(db: D1Database, userId: string, email: string, now: number): Promise<boolean> {
  const hash = await sha256Hex(canonicalEmail(email));
  const [paid] = await db.batch([
    db
      .prepare(
        `INSERT INTO coin_ledger (user_id, delta, kind, ref, created_at)
         SELECT ?1, ?2, 'welcome', ?1, ?3 WHERE NOT EXISTS (SELECT 1 FROM welcome_claims WHERE email_hash = ?4)
         ON CONFLICT DO NOTHING`,
      )
      .bind(userId, WELCOME_COINS, now, hash),
    db.prepare("INSERT INTO welcome_claims (email_hash, created_at) VALUES (?, ?) ON CONFLICT DO NOTHING").bind(hash, now),
  ]);
  return paid.meta.changes === 1;
}

/**
 * Review runs past their expiry: an unfinished one's coins come back (once:
 * the refund's ref is the ticket's), and every expired ticket is deleted, so
 * none outlives its two hours by more than the next sweep. Anyone's request
 * can run it; it touches only expired rows.
 */
export async function sweepTickets(db: D1Database, now: number) {
  await db.batch([
    db
      .prepare(
        `INSERT INTO coin_ledger (user_id, delta, kind, ref, created_at)
         SELECT user_id, coins, 'review_refund', id_hash, ?1 FROM review_tickets WHERE expires_at <= ?1 AND synthesized = 0
         ON CONFLICT DO NOTHING`,
      )
      .bind(now),
    db.prepare("DELETE FROM review_tickets WHERE expires_at <= ?").bind(now),
  ]);
}

/**
 * Spends one pass of a paid review, or says why not: the ticket must be
 * this account's and unexpired, the tier the one paid for, an extract pass
 * a section that was paid for and no longer than paid, and the ticket's
 * budget for that kind of pass not yet used up. Called before the upstream
 * request, so a refused pass never reaches Claude.
 */
export async function claimReviewPass(
  db: D1Database,
  ticket: string,
  userId: string,
  want: { pass: "extract" | "synthesize"; tier: string; chunkId?: string; chars?: number },
  now: number,
): Promise<string | null> {
  if (!ticket || ticket.length > 100) return "This review has no ticket. Start it again from the review page.";
  const idHash = await sha256Hex(ticket);
  const t = await db.prepare("SELECT tier, chunks FROM review_tickets WHERE id_hash = ? AND user_id = ? AND expires_at > ?").bind(idHash, userId, now).first<{ tier: string; chunks: string }>();
  if (!t) return "This review's ticket has expired. Start a new review; an unfinished one is refunded automatically.";
  if (t.tier !== want.tier) return "This pass doesn't match the review that was paid for.";
  if (want.pass === "extract") {
    const paid = (JSON.parse(t.chunks) as Record<string, number>)[want.chunkId ?? ""];
    if (!paid || (want.chars ?? Infinity) > paid) return "This section wasn't part of the review that was paid for.";
  }
  const col = want.pass === "extract" ? "extract_left" : "synth_left";
  const r = await db.prepare(`UPDATE review_tickets SET ${col} = ${col} - 1 WHERE id_hash = ? AND ${col} > 0 AND expires_at > ?`).bind(idHash, now).run();
  return r.meta.changes === 1 ? null : "This review has used all its passes. Start a new one.";
}

/** A review whose synthesis came back: it's finished, so its coins are kept. */
export async function markSynthesized(db: D1Database, ticket: string) {
  await db.prepare("UPDATE review_tickets SET synthesized = 1 WHERE id_hash = ?").bind(await sha256Hex(ticket)).run();
}

/**
 * Pro's monthly coins, granted when first due (from /api/me and the
 * webhook; there's no scheduler). Before each month's coins arrive, unspent
 * Pro coins above the carry-over cap lapse. Only while the plan is active:
 * not overdue, paused or cancelled. Each grant is a plain INSERT on a unique
 * ref, so a call racing this one makes it stop, never grant twice.
 */
export async function grantDuePro(db: D1Database, userId: string, now: number) {
  const subs = (
    await db
      .prepare("SELECT id, interval, period_start AS periodStart, period_end AS periodEnd FROM subscriptions WHERE user_id = ? AND status = 'active' AND period_start IS NOT NULL")
      .bind(userId)
      .all<{ id: string; interval: "month" | "year"; periodStart: number; periodEnd: number }>()
  ).results;
  const due = subs.flatMap((s) => dueProGrants({ ...s, active: true }, now));
  if (due.length === 0) return;
  const have = new Set((await db.prepare("SELECT ref FROM coin_ledger WHERE user_id = ? AND kind = 'pro_grant'").bind(userId).all<{ ref: string }>()).results.map((r) => r.ref));
  const todo = due.filter((ref) => !have.has(ref));
  if (todo.length === 0) return;
  const entries = (await db.prepare("SELECT kind, delta FROM coin_ledger WHERE user_id = ? ORDER BY id").bind(userId).all<{ kind: LedgerKind; delta: number }>()).results;
  const insert = (delta: number, kind: LedgerKind, ref: string) =>
    db.prepare("INSERT INTO coin_ledger (user_id, delta, kind, ref, created_at) VALUES (?, ?, ?, ?, ?)").bind(userId, delta, kind, ref, now);
  for (const ref of todo) {
    const lapse = Math.max(0, proCoinsLeft(entries) - PRO.carryCap);
    try {
      await db.batch([...(lapse > 0 ? [insert(-lapse, "pro_expire", ref)] : []), insert(PRO.coinsPerMonth, "pro_grant", ref)]);
    } catch {
      return; // granted by a concurrent call; it carries on from here
    }
    if (lapse > 0) entries.push({ kind: "pro_expire", delta: -lapse });
    entries.push({ kind: "pro_grant", delta: PRO.coinsPerMonth });
  }
}

export type LedgerEntry = { kind: LedgerKind; label: string; delta: number; at: number };

export async function history(db: D1Database, userId: string, limit: number): Promise<LedgerEntry[]> {
  const { results } = await db.prepare("SELECT kind, delta, created_at AS at FROM coin_ledger WHERE user_id = ? ORDER BY id DESC LIMIT ?").bind(userId, limit).all<{ kind: LedgerKind; delta: number; at: number }>();
  return results.map((r) => ({ ...r, label: ledgerLabel(r.kind) }));
}
