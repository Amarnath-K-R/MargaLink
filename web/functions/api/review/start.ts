/// <reference types="@cloudflare/workers-types" />
// POST /api/review/start {tier, journalId, chunks: [{id, chars, review}]}:
// charges a review's price in M coins and returns a ticket that every pass of
// that review sends as X-Review-Ticket (functions/api/review.ts). The body is
// every chunk the review sends, as ids and character counts, and which of
// them are reviewed: no paper text reaches this endpoint. The price covers the
// whole paper (every pass carries it); the ticket row keeps the reviewed ids,
// their billed lengths and, at thorough, the checklist, for two hours. The
// charge and the ticket are one transaction; an unfinished run is refunded by
// sweepTickets (ledger.ts) once the ticket expires.
import { getSession, randomToken, readJson, sha256Hex, text, type AccountEnv } from "../../../src/lib/accounts/auth.ts";
import { reviewPrice, REVIEW_TICKET_TTL_MS } from "../../../src/lib/accounts/coins.ts";
import { balance, debitStatement, sweepTickets } from "../../../src/lib/accounts/ledger.ts";
import { findJournalRules } from "../../../src/lib/journals/journalRules.ts";
import { CHECKLIST_ID, parseStartRequest, passBudget } from "../../../src/lib/review/reviewPasses.ts";
import { billedChars } from "../../../src/lib/review/reviewLimits.ts";
import { TIER_PLAN } from "../../../src/lib/review/reviewPrompt.ts";
import { DAILY, leftToday } from "../../../src/lib/accounts/dailyCaps.ts";

type Env = AccountEnv;

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const now = Date.now();
  const s = await getSession(env.DB, request, now);
  if (!s) return text("Sign in to get a review.", 401);
  const req = parseStartRequest(await readJson(request));
  if (typeof req === "string") return text(req, 400);
  if (!findJournalRules(req.journalId)) return text("No pilot rules for this journal", 400);

  const reviewed = req.chunks.filter((c) => c.review);
  const checklist = TIER_PLAN[req.tier].checklist;
  const passes = reviewed.length + (checklist ? 1 : 0) + 1; // the sections, the checklist, the final report
  // Don't take coins for a review today's capacity (the service's, or this account's) can't finish.
  const cap = await leftToday(env.DB, "reviewPass", s.userId, now);
  if (cap.all < passes) return text("Reviews are fully booked for today. Try again tomorrow; nothing was charged.", 429);
  if (cap.user < passes) return text(`This account has reached today's limit of ${DAILY.reviewPass.user} review passes. It resets at midnight UTC; nothing was charged.`, 429);

  await sweepTickets(env.DB, now);
  // The price covers the whole paper, which every pass carries; the ticket weighs the parts that
  // run (each reviewed section by its billed length, the checklist as an average one) for refunds.
  const coins = reviewPrice(req.tier, req.chunks.reduce((n, c) => n + billedChars(c.chars), 0));
  const weights: [string, number][] = reviewed.map((c) => [c.id, billedChars(c.chars)]);
  if (checklist) weights.push([CHECKLIST_ID, Math.round(weights.reduce((n, [, w]) => n + w, 0) / weights.length)]);
  const budget = passBudget(reviewed.length, checklist);
  const ticket = randomToken();
  const idHash = await sha256Hex(ticket); // the ticket itself is only ever in the browser
  const [, created] = await env.DB.batch([
    debitStatement(env.DB, s.userId, coins, "review", idHash, now),
    env.DB.prepare(
      `INSERT INTO review_tickets (id_hash, user_id, tier, coins, chunks, extract_left, synth_left, created_at, expires_at)
       SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9 WHERE EXISTS (SELECT 1 FROM coin_ledger WHERE kind = 'review' AND ref = ?1)`,
    ).bind(idHash, s.userId, req.tier, coins, JSON.stringify(Object.fromEntries(weights)), budget.sections, budget.editor, now, now + REVIEW_TICKET_TTL_MS),
  ]);
  const left = await balance(env.DB, s.userId);
  if (created.meta.changes !== 1) return Response.json({ coins, balance: left }, { status: 402 });
  return Response.json({ ticket, coins, balance: left });
};
