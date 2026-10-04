/// <reference types="@cloudflare/workers-types" />
// The M coin ledger's SQL (server-side only). Append-only: the balance is
// SUM(delta), a debit is one conditional INSERT (so two at once can't both
// spend the last coins), and UNIQUE(kind, ref) makes every row idempotent.
import { canonicalEmail, dueProGrants, ledgerLabel, maxPaidChars, proCoinsLeft, PRO, WELCOME_COINS, type LedgerKind } from "./coins.ts";
import { fingerprint, sha256Hex } from "./auth.ts";
import type { ReviewTier } from "../review/reviewTypes.ts";

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

/** Adds coins once per (kind, ref); false if that ref was credited already, or the account is gone (deleted meanwhile). */
export async function credit(db: D1Database, userId: string, coins: number, kind: LedgerKind, ref: string, now: number): Promise<boolean> {
  const r = await db
    .prepare("INSERT INTO coin_ledger (user_id, delta, kind, ref, created_at) SELECT ?1, ?2, ?3, ?4, ?5 WHERE EXISTS (SELECT 1 FROM users WHERE id = ?1) ON CONFLICT DO NOTHING")
    .bind(userId, coins, kind, ref, now)
    .run();
  return r.meta.changes === 1;
}

/**
 * A charge for an AI request in flight: taken if the balance covers it, and
 * recorded as pending in the same transaction, so a request that never
 * finishes is still refunded (sweepCharges). False when the balance is short.
 */
export async function holdCharge(db: D1Database, userId: string, coins: number, kind: LedgerKind, refundKind: LedgerKind, ref: string, now: number, ttlMs: number): Promise<boolean> {
  const [taken] = await db.batch([
    debitStatement(db, userId, coins, kind, ref, now),
    db
      .prepare("INSERT INTO pending_charges (ref, user_id, coins, refund_kind, expires_at) SELECT ?1, ?2, ?3, ?4, ?5 WHERE EXISTS (SELECT 1 FROM coin_ledger WHERE kind = ?6 AND ref = ?1)")
      .bind(ref, userId, coins, refundKind, now + ttlMs, kind),
  ]);
  return taken.meta.changes === 1;
}

/** The request answered: its charge stands. */
export async function settleCharge(db: D1Database, ref: string): Promise<void> {
  await db.prepare("DELETE FROM pending_charges WHERE ref = ?").bind(ref).run();
}

// Refunds the pending charges a condition picks, once each (the refund's ref is the charge's).
const refundPending = (db: D1Database, where: string, value: string | number, now: number) =>
  db.batch([
    db
      .prepare(
        `INSERT INTO coin_ledger (user_id, delta, kind, ref, created_at)
         SELECT p.user_id, p.coins, p.refund_kind, p.ref, ?2 FROM pending_charges p WHERE ${where} ON CONFLICT DO NOTHING`,
      )
      .bind(value, now),
    db.prepare(`DELETE FROM pending_charges WHERE ${where.replaceAll("p.", "")}`).bind(value),
  ]);

/** The request failed: its charge comes back, once. */
export async function refundCharge(db: D1Database, ref: string, now: number): Promise<void> {
  await refundPending(db, "p.ref = ?1", ref, now);
}

/** Requests that never finished, past their time: refunded, once. Anyone's request can run it. */
export async function sweepCharges(db: D1Database, now: number): Promise<void> {
  await refundPending(db, "p.expires_at <= ?1", now, now);
}

/** The welcome bonus, once per canonical address (its keyed fingerprint outlives account deletion by WELCOME_RELEASE_DAYS). */
export async function grantWelcome(db: D1Database, userId: string, email: string, now: number, secret: string): Promise<boolean> {
  const hash = await fingerprint(secret, canonicalEmail(email));
  const [paid] = await db.batch([
    db
      .prepare(
        `INSERT INTO coin_ledger (user_id, delta, kind, ref, created_at)
         SELECT ?1, ?2, 'welcome', ?1, ?3 WHERE NOT EXISTS (SELECT 1 FROM welcome_claims WHERE email_hash = ?4)
         ON CONFLICT DO NOTHING`,
      )
      .bind(userId, WELCOME_COINS, now, hash),
    db.prepare("INSERT INTO welcome_claims (email_hash, created_at) VALUES (?, ?) ON CONFLICT DO UPDATE SET released_at = NULL").bind(hash, now),
    db.prepare("UPDATE users SET welcome_hash = ? WHERE id = ?").bind(hash, userId),
  ]);
  return paid.meta.changes === 1;
}

/**
 * Review runs past their expiry: each is refunded for the share it didn't
 * deliver, once (the refund's ref is the ticket's). Sections weigh by their
 * length and the final report like an average section (the checklist is in
 * the ticket as one, weighed as an average section), so padding a
 * review with tiny sections buys nothing; the result is rounded up, so any
 * part that didn't come back returns at least a coin. The parts that came
 * back are kept. Every expired ticket is deleted (its deliveries with it).
 * Anyone's request can run it; it touches only expired rows.
 */
export async function sweepTickets(db: D1Database, now: number) {
  await db.batch([
    db
      .prepare(
        `INSERT INTO coin_ledger (user_id, delta, kind, ref, created_at)
         SELECT user_id, refund, 'review_refund', id_hash, ?1 FROM (
           SELECT user_id, id_hash,
                  CASE WHEN total = 0 THEN coins * (1 - synthesized)
                       ELSE (coins * ((total - delivered) * n + (1 - synthesized) * total) + total * (n + 1) - 1) / (total * (n + 1)) END AS refund
           FROM (
             SELECT t.user_id, t.id_hash, t.coins, t.synthesized,
                    (SELECT COUNT(*) FROM json_each(t.chunks)) AS n,
                    (SELECT COALESCE(SUM(value), 0) FROM json_each(t.chunks)) AS total,
                    (SELECT COALESCE(SUM(json_extract(t.chunks, '$."' || d.chunk_id || '"')), 0) FROM review_deliveries d WHERE d.ticket = t.id_hash) AS delivered
             FROM review_tickets t WHERE t.expires_at <= ?1
           )
         ) WHERE refund > 0
         ON CONFLICT DO NOTHING`,
      )
      .bind(now),
    db.prepare("DELETE FROM review_tickets WHERE expires_at <= ?").bind(now),
  ]);
}

const PAYMENT_EVENT_DAYS = 90;

// How long a deleted account's welcome fingerprint is kept (the privacy page says 12 months).
export const WELCOME_RELEASE_DAYS = 365;

/**
 * On account deletion (run before the account's row goes): the welcome
 * fingerprint it holds starts its 12 months, unless another account holds
 * it too. Needs no key: the account remembers its own fingerprint.
 */
export const releaseWelcomeStatement = (db: D1Database, userId: string, now: number) =>
  db
    .prepare(
      `UPDATE welcome_claims SET released_at = ?1
       WHERE email_hash = (SELECT welcome_hash FROM users WHERE id = ?2)
         AND NOT EXISTS (SELECT 1 FROM users WHERE welcome_hash = welcome_claims.email_hash AND id != ?2)`,
    )
    .bind(now, userId);

/**
 * Clears what has expired: review tickets (refunding what they didn't
 * deliver), sign-in links (which hold an address), sessions and rate
 * counters. There's no scheduler on Pages, so any API request runs this, at
 * most once a minute (functions/api/_middleware.ts).
 */
export async function housekeeping(db: D1Database, now: number) {
  await sweepTickets(db, now);
  await sweepCharges(db, now);
  await db.batch([
    db.prepare("DELETE FROM magic_links WHERE expires_at <= ?").bind(now),
    db.prepare("DELETE FROM sessions WHERE expires_at <= ?").bind(now),
    db.prepare("DELETE FROM rate_limits WHERE expires_at <= ?").bind(now),
    // Paddle's event ids (no personal data) only need to outlive its retries.
    db.prepare("DELETE FROM payment_events WHERE received_at <= ?").bind(now - PAYMENT_EVENT_DAYS * 24 * 60 * 60 * 1000),
    db.prepare("DELETE FROM welcome_claims WHERE released_at <= ?").bind(now - WELCOME_RELEASE_DAYS * 24 * 60 * 60 * 1000),
  ]);
}

// No pass starts this close to a ticket's end: a synthesis may run for up to
// 290 s upstream, and must finish while its ticket still exists.
const CLAIM_MARGIN_MS = 5 * 60 * 1000;
// Tries per section: a first run's three (one and two retries) and one more
// from Retry. With "never again once delivered", a ticket can make Claude
// read each paid section at most this many times.
export const TRIES_PER_SECTION = 4;
export type PassRefusal = { status: 403 | 409; message: string };

/** A paid section that came back with a result. Recorded once, however often it's retried. */
export async function markDelivered(db: D1Database, ticket: string, chunkId: string) {
  const idHash = await sha256Hex(ticket);
  const r = await db
    .prepare("INSERT INTO review_deliveries (ticket, chunk_id) SELECT ?1, ?2 WHERE EXISTS (SELECT 1 FROM review_tickets WHERE id_hash = ?1) ON CONFLICT DO NOTHING")
    .bind(idHash, chunkId)
    .run();
  // A section run again (its first result never reached the browser) came back: new to the report, so the
  // final report may be put together once more. Refunds still count each section once (review_deliveries).
  if (r.meta.changes === 0) await db.prepare(`UPDATE review_tickets SET passes = json_set(passes, '$."redelivered"', ${REDELIVERED} + 1) WHERE id_hash = ?`).bind(idHash).run();
}

// The ticket's deliveries as the final report counts them: each section that came back, and each one that came back again.
const REDELIVERED = `COALESCE(json_extract(passes, '$."redelivered"'), 0)`;
const DELIVERIES = (ticketCol: string) => `((SELECT COUNT(*) FROM review_deliveries WHERE ticket = ${ticketCol}) + ${REDELIVERED})`;

/** How many deliveries the final report covers when it's put together now (the basis markSynthesized keeps). */
export async function deliveryCount(db: D1Database, ticket: string): Promise<number> {
  return (await db.prepare(`SELECT ${DELIVERIES("id_hash")} AS n FROM review_tickets WHERE id_hash = ?`).bind(await sha256Hex(ticket)).first<number>("n")) ?? 0;
}

/**
 * Spends one pass of a paid review, or says why not: 403 when the ticket
 * can't be used (not this account's, expired or about to, another depth, a
 * section not paid for or longer than paid, more paper than its price
 * covers), 409 when this section, the checklist or the final report is done
 * with (already delivered, or out of tries). Called before the upstream
 * request, so a refused pass never reaches Claude. The tries are counted in
 * the same statement that checks them.
 */
export async function claimReviewPass(
  db: D1Database,
  ticket: string,
  userId: string,
  want: { pass: "section" | "checklist" | "editor"; tier: string; paperChars: number; chunkId?: string; chars?: number },
  now: number,
): Promise<PassRefusal | null> {
  const refuse = (status: 403 | 409, message: string) => ({ status, message });
  if (!ticket || ticket.length > 100) return refuse(403, "This review has no ticket. Start it again from the review page.");
  const idHash = await sha256Hex(ticket);
  const t = await db
    .prepare(
      `SELECT tier, coins, chunks, passes, synthesized, synth_basis, synth_left, ${DELIVERIES("id_hash")} AS delivered
       FROM review_tickets WHERE id_hash = ? AND user_id = ? AND expires_at > ?`,
    )
    .bind(idHash, userId, now + CLAIM_MARGIN_MS)
    .first<{ tier: string; coins: number; chunks: string; passes: string; synthesized: number; synth_basis: number; synth_left: number; delivered: number }>();
  if (!t) return refuse(403, "This review's ticket has expired. Start a new review; what the old one didn't finish is refunded automatically.");
  if (t.tier !== want.tier) return refuse(403, "This pass doesn't match the review that was paid for.");
  // Every pass carries the paper; it may not be longer than the price paid for.
  if (want.paperChars > maxPaidChars(t.tier as ReviewTier, t.coins)) return refuse(403, "This pass sends more of the paper than the review paid for.");
  if (want.pass === "editor") {
    // Only over parts that came back, and again only once more have (a Retry fixed one).
    if (t.delivered === 0) return refuse(409, "No section of this review has come back yet, so there's nothing to put together.");
    if (t.delivered <= t.synth_basis) return refuse(409, "This review's report is already put together.");
    const r = await db
      .prepare(
        `UPDATE review_tickets SET synth_left = synth_left - 1
         WHERE id_hash = ?1 AND synth_left > 0 AND expires_at > ?2 AND ${DELIVERIES("?1")} > synth_basis`,
      )
      .bind(idHash, now + CLAIM_MARGIN_MS)
      .run();
    return r.meta.changes === 1 ? null : refuse(409, "The final report has no tries left; its share of the coins comes back automatically.");
  }
  const id = want.chunkId ?? "";
  const paid = (JSON.parse(t.chunks) as Record<string, number>)[id];
  if (!paid || (want.chars ?? Infinity) > paid) return refuse(403, "This section wasn't part of the review that was paid for.");
  // A section that came back may be run once more, within its tries: its result is lost if the browser
  // stopped waiting (a Cancel, a dropped connection) after the server finished it, and nothing is kept here to send again.
  const again = `$."re:${id}"`;
  const delivered = !!(await db.prepare("SELECT 1 AS y FROM review_deliveries WHERE ticket = ? AND chunk_id = ?").bind(idHash, id).first());
  if (delivered && (JSON.parse(t.passes) as Record<string, number>)[`re:${id}`]) return refuse(409, "This section was already reviewed, and run again once.");
  const r = await db
    .prepare(
      `UPDATE review_tickets SET extract_left = extract_left - 1, passes = json_set(passes, ?2, COALESCE(json_extract(passes, ?2), 0) + 1${delivered ? ", ?5, 1" : ""})
       WHERE id_hash = ?1 AND extract_left > 0 AND expires_at > ?3 AND COALESCE(json_extract(passes, ?2), 0) < ?4${delivered ? " AND json_extract(passes, ?5) IS NULL" : ""}`,
    )
    .bind(idHash, `$."${id}"`, now + CLAIM_MARGIN_MS, TRIES_PER_SECTION, ...(delivered ? [again] : [])) // id is CHUNK_ID-shaped (s3, s3-p2) or CHECKLIST_ID
    .run();
  return r.meta.changes === 1 ? null : refuse(409, "This part has no tries left; its share of the coins comes back automatically.");
}

/** A review whose synthesis came back: it's finished, so its coins are kept. `basis`: the sections it covered. */
export async function markSynthesized(db: D1Database, ticket: string, basis: number) {
  await db.prepare("UPDATE review_tickets SET synthesized = 1, synth_basis = MAX(synth_basis, ?2) WHERE id_hash = ?1").bind(await sha256Hex(ticket), basis).run();
}

/** The sections of a paid review that came back (their chunk ids). */
export async function deliveredChunks(db: D1Database, ticket: string): Promise<Set<string>> {
  const rows = await db.prepare("SELECT chunk_id FROM review_deliveries WHERE ticket = ?").bind(await sha256Hex(ticket)).all<{ chunk_id: string }>();
  return new Set(rows.results.map((r) => r.chunk_id));
}

/** What a Pro billing period is worth: a month's or a year's coins, times the share of its payment not refunded. */
const periodAllowance = (db: D1Database, subId: string, periodStart: number, interval: "month" | "year") =>
  db
    .prepare(
      `SELECT CAST(?1 * (1 - MIN(1.0, COALESCE((SELECT SUM(a.share) FROM adjustments a JOIN purchases p ON p.txn_id = a.txn_id
         WHERE p.subscription_id = ?2 AND p.period_start = ?3), 0))) AS INTEGER) AS allowed`,
    )
    .bind(PRO.coinsPerMonth * (interval === "year" ? 12 : 1), subId, periodStart)
    .first<number>("allowed");

/**
 * Pro's monthly coins, granted when first due (from /api/me and the
 * webhook; there's no scheduler). Before each month's coins arrive, unspent
 * Pro coins above the carry-over cap lapse. Only while the plan is active
 * (not overdue, paused or cancelled), and never beyond what the period's
 * payment, less any refund of it, is worth. The lapse is worked out from the
 * ledger as read; the write only happens if nothing else touched this
 * account's ledger since (otherwise it's worked out again), and each grant
 * is a plain INSERT on a unique ref, so a racing call makes this one stop,
 * never grant twice.
 */
export async function grantDuePro(db: D1Database, userId: string, now: number) {
  const subs = (
    await db
      .prepare("SELECT id, interval, period_start AS periodStart, period_end AS periodEnd FROM subscriptions WHERE user_id = ? AND status = 'active' AND period_start IS NOT NULL")
      .bind(userId)
      .all<{ id: string; interval: "month" | "year"; periodStart: number; periodEnd: number }>()
  ).results;
  for (const s of subs) {
    const have = new Set((await db.prepare("SELECT ref FROM coin_ledger WHERE user_id = ? AND kind = 'pro_grant'").bind(userId).all<{ ref: string }>()).results.map((r) => r.ref));
    const todo = dueProGrants({ ...s, active: true }, now).filter((ref) => !have.has(ref));
    if (todo.length === 0) continue;
    const allowed = (await periodAllowance(db, s.id, s.periodStart, s.interval)) ?? 0;
    const prefix = `${s.id}:${s.periodStart}:`;
    refs: for (const ref of todo) {
      for (let attempt = 0; attempt < 3; attempt++) {
        const entries = (await db.prepare("SELECT id, kind, delta, ref FROM coin_ledger WHERE user_id = ? ORDER BY id").bind(userId).all<{ id: number; kind: LedgerKind; delta: number; ref: string }>()).results;
        const granted = entries.filter((e) => e.kind === "pro_grant" && e.ref.startsWith(prefix)).reduce((n, e) => n + e.delta, 0);
        const amount = Math.min(PRO.coinsPerMonth, allowed - granted);
        if (amount <= 0) break refs; // this period's worth is all granted (or refunded)
        const lapse = Math.max(0, proCoinsLeft(entries) - PRO.carryCap);
        const seen = entries.length ? entries[entries.length - 1].id : 0;
        // Only if the ledger is as read: no row newer than `seen` except this grant's own.
        const insert = (delta: number, kind: LedgerKind) =>
          db
            .prepare(
              `INSERT INTO coin_ledger (user_id, delta, kind, ref, created_at)
               SELECT ?1, ?2, ?3, ?4, ?5 WHERE NOT EXISTS (SELECT 1 FROM coin_ledger WHERE user_id = ?1 AND id > ?6 AND ref != ?4)`,
            )
            .bind(userId, delta, kind, ref, now, seen);
        let results: D1Result[];
        try {
          results = await db.batch([...(lapse > 0 ? [insert(-lapse, "pro_expire")] : []), insert(amount, "pro_grant")]);
        } catch {
          break refs; // granted by a concurrent call; it carries on from here
        }
        if (results[results.length - 1].meta.changes === 1) break;
        // the ledger moved under us: read it again
      }
    }
  }
}

export type LedgerEntry = { kind: LedgerKind; label: string; delta: number; at: number };

export async function history(db: D1Database, userId: string, limit: number): Promise<LedgerEntry[]> {
  const { results } = await db.prepare("SELECT kind, delta, created_at AS at FROM coin_ledger WHERE user_id = ? ORDER BY id DESC LIMIT ?").bind(userId, limit).all<{ kind: LedgerKind; delta: number; at: number }>();
  return results.map((r) => ({ ...r, label: ledgerLabel(r.kind) }));
}
