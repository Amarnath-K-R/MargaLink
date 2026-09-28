/// <reference types="@cloudflare/workers-types" />
// POST /api/review/start {tier, journalId, chunks: [{id, chars}]}: charges a
// review's price in M coins and returns a ticket that every pass of that
// review sends as X-Review-Ticket (functions/api/review.ts). The body is
// section ids and character counts only: no paper text reaches this
// endpoint, and the ticket row keeps just those ids and counts, for two
// hours. The charge and the ticket are one transaction; an unfinished run is
// refunded by sweepTickets (ledger.ts) once the ticket expires.
import { getSession, randomToken, readJson, sha256Hex, text, type AccountEnv } from "../../../src/lib/auth.ts";
import { reviewPrice, REVIEW_TICKET_TTL_MS } from "../../../src/lib/coins.ts";
import { balance, debitStatement, sweepTickets } from "../../../src/lib/ledger.ts";
import { findJournalRules } from "../../../src/lib/journalRules.ts";
import { DAILY_PASS_CAP, parseStartRequest, passBudget } from "../../../src/lib/reviewPasses.ts";

type Env = AccountEnv & { REVIEWS_KV: KVNamespace };

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const now = Date.now();
  const s = await getSession(env.DB, request, now);
  if (!s) return text("Sign in to get a review.", 401);
  const req = parseStartRequest(await readJson(request));
  if (typeof req === "string") return text(req, 400);
  if (!findJournalRules(req.journalId)) return text("No pilot rules for this journal", 400);

  // Don't take coins for a review today's capacity can't finish.
  const budget = passBudget(req.chunks.length);
  const used = parseInt((await env.REVIEWS_KV.get(`review-pass-count:${new Date(now).toISOString().slice(0, 10)}`)) ?? "0", 10);
  if (used + req.chunks.length + 1 > DAILY_PASS_CAP) return text("Reviews are fully booked for today. Try again tomorrow; nothing was charged.", 429);

  await sweepTickets(env.DB, now);
  const coins = reviewPrice(req.tier, req.chunks.reduce((n, c) => n + c.chars, 0));
  const ticket = randomToken();
  const idHash = await sha256Hex(ticket); // the ticket itself is only ever in the browser
  const [, created] = await env.DB.batch([
    debitStatement(env.DB, s.userId, coins, "review", idHash, now),
    env.DB.prepare(
      `INSERT INTO review_tickets (id_hash, user_id, tier, coins, chunks, extract_left, synth_left, created_at, expires_at)
       SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9 WHERE EXISTS (SELECT 1 FROM coin_ledger WHERE kind = 'review' AND ref = ?1)`,
    ).bind(idHash, s.userId, req.tier, coins, JSON.stringify(Object.fromEntries(req.chunks.map((c) => [c.id, c.chars]))), budget.extract, budget.synthesize, now, now + REVIEW_TICKET_TTL_MS),
  ]);
  const left = await balance(env.DB, s.userId);
  if (created.meta.changes !== 1) return Response.json({ coins, balance: left }, { status: 402 });
  return Response.json({ ticket, coins, balance: left });
};
