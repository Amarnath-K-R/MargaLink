/// <reference types="@cloudflare/workers-types" />
// POST /api/pay/portal: a link to Paddle's customer portal, where Pro is
// managed or cancelled and receipts live. The link is signed by Paddle for
// this customer and opened in a new tab.
import { getSession, text, type AccountEnv } from "../../../src/lib/auth.ts";
import { portalUrl, type PaddleApiEnv } from "../../../src/lib/paddle.ts";

export const onRequestPost: PagesFunction<AccountEnv & PaddleApiEnv> = async ({ request, env }) => {
  const s = await getSession(env.DB, request, Date.now());
  if (!s) return text("Sign in first.", 401);
  if (!env.PADDLE_API_KEY) return text("Payments aren't set up yet.", 503);
  const sub = await env.DB.prepare("SELECT id, customer_id AS customerId FROM subscriptions WHERE user_id = ? ORDER BY event_at DESC LIMIT 1")
    .bind(s.userId)
    .first<{ id: string; customerId: string }>();
  const customerId =
    sub?.customerId ?? (await env.DB.prepare("SELECT customer_id FROM purchases WHERE user_id = ? AND customer_id IS NOT NULL LIMIT 1").bind(s.userId).first<string>("customer_id"));
  if (!customerId) return text("There's nothing to manage yet: no purchases on this account.", 404);
  const url = await portalUrl(env, customerId, sub?.id ?? null);
  return url ? Response.json({ url }) : text("Paddle didn't answer. Try again in a minute.", 502);
};
