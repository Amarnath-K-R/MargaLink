/// <reference types="@cloudflare/workers-types" />
// POST /api/pay/webhook: Paddle tells us about payments. Exempt from the
// Origin check (_middleware.ts) because it comes from Paddle; it proves
// itself with a signature instead. Each event is handled once: its id is
// recorded in the same transaction as its effects, so a retry is only
// acknowledged. Anything we don't act on is acknowledged too, or Paddle
// would keep retrying it. Never logs a body.
import { isPaddleEvent, paddleStatements, parsePriceIds, verifyPaddleSignature } from "../../../src/lib/paddle.ts";
import { text, type AccountEnv } from "../../../src/lib/auth.ts";
import { grantDuePro } from "../../../src/lib/ledger.ts";

type Env = AccountEnv & { PADDLE_WEBHOOK_SECRET?: string; PADDLE_PRICE_IDS?: string };

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const now = Date.now();
  if (!env.PADDLE_WEBHOOK_SECRET) return text("Payments aren't set up", 503);
  const raw = await request.text();
  if (!(await verifyPaddleSignature(request.headers.get("paddle-signature"), raw, env.PADDLE_WEBHOOK_SECRET, now))) return text("Bad signature", 401);
  let event: unknown;
  try {
    event = JSON.parse(raw);
  } catch {
    return text("Invalid JSON body", 400);
  }
  if (!isPaddleEvent(event)) return text("Not a Paddle event", 400);

  if (await env.DB.prepare("SELECT 1 AS y FROM payment_events WHERE id = ?").bind(event.event_id).first()) return text("Already handled", 200);
  const { statements, grantFor } = await paddleStatements(env.DB, event, parsePriceIds(env.PADDLE_PRICE_IDS), now);
  // A plain INSERT: if another delivery of this event won the race, the
  // whole batch rolls back and the retry finds it handled.
  await env.DB.batch([env.DB.prepare("INSERT INTO payment_events (id, type, received_at) VALUES (?, ?, ?)").bind(event.event_id, event.event_type, now), ...statements]);
  // A Pro plan that started or renewed: its month's coins now, not at the next visit.
  if (grantFor) await grantDuePro(env.DB, grantFor, now);
  return text("OK", 200);
};
