/// <reference types="@cloudflare/workers-types" />
// The M coin ledger's SQL (server-side only). Append-only: the balance is
// SUM(delta), a debit is one conditional INSERT (so two at once can't both
// spend the last coins), and UNIQUE(kind, ref) makes every row idempotent.
import { canonicalEmail, ledgerLabel, WELCOME_COINS, type LedgerKind } from "./coins.ts";
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

export type LedgerEntry = { kind: LedgerKind; label: string; delta: number; at: number };

export async function history(db: D1Database, userId: string, limit: number): Promise<LedgerEntry[]> {
  const { results } = await db.prepare("SELECT kind, delta, created_at AS at FROM coin_ledger WHERE user_id = ? ORDER BY id DESC LIMIT ?").bind(userId, limit).all<{ kind: LedgerKind; delta: number; at: number }>();
  return results.map((r) => ({ ...r, label: ledgerLabel(r.kind) }));
}
