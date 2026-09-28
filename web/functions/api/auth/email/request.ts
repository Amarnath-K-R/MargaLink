/// <reference types="@cloudflare/workers-types" />
// POST /api/auth/email/request {email, next, turnstile?}: emails a one-time
// sign-in link (15 minutes). The link carries only the token, in its
// #fragment, which never reaches a server; the page asks the server which
// address it's for, and asks the person before spending it, so a mail
// scanner opening the link can't use it up.
//
// Limits, all keyed by fingerprints made with HASH_SECRET (never the address
// or IP itself): 3 per address per 15 minutes and 10 a day from any one
// network, 30 a day per address in all; 10 an hour per network (an IPv6 /64
// is one); and for addresses without an account yet,
// 5 a day per network and 90 a day in all (Resend's free tier). Only new
// addresses draw on that daily budget, so a flood of made-up addresses can't
// lock out anyone who already has an account. While it's spent, or a
// network has used its 5, a new address is told so and an existing one
// isn't: the only times the answer depends on whether an account exists.
// With TURNSTILE_SECRET set, a request must also pass Cloudflare Turnstile.
import { fingerprint, hashSecret, networkKey, randomToken, rateLimit, readJson, safeNext, sha256Hex, text, type AccountEnv } from "../../../../src/lib/auth.ts";
import { isEmail, normalEmail } from "../../../../src/lib/coins.ts";

const LINK_TTL_MS = 15 * 60 * 1000;
const MIN = 60 * 1000;
const DAY = 24 * 60 * MIN;

async function passesTurnstile(secret: string, token: unknown, req: Request): Promise<boolean> {
  if (typeof token !== "string" || !token || token.length > 2048) return false;
  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ secret, response: token, remoteip: req.headers.get("cf-connecting-ip") ?? "" }).toString(),
  });
  return res.ok && ((await res.json()) as { success?: boolean }).success === true;
}

export const onRequestPost: PagesFunction<AccountEnv> = async ({ request, env }) => {
  const now = Date.now();
  const body = await readJson(request);
  const email = typeof body?.email === "string" ? normalEmail(body.email) : "";
  if (!isEmail(email)) return text("Enter a valid email address.", 400);
  const next = safeNext(body?.next);
  const url = new URL(request.url);
  const dev = env.DEV_EMAIL_LOG === "1" && url.hostname === "localhost";
  const secret = hashSecret(env, request);
  if (!secret || (!dev && (!env.RESEND_API_KEY || !env.EMAIL_FROM))) return text("Email sign-in isn't set up yet. Use Google for now.", 503);
  if (env.TURNSTILE_SECRET && !(await passesTurnstile(env.TURNSTILE_SECRET, body?.turnstile, request))) {
    return text("The check above the button didn't pass. Try it again, then send the link.", 400);
  }

  const db = env.DB;
  const who = await fingerprint(secret, email);
  const net = await networkKey(secret, request, now);
  // Per address *and* network, so a stranger asking for your links from
  // their network can't lock you out of yours; plus a looser ceiling per
  // address across all networks, against spamming an inbox.
  if (!(await rateLimit(db, `mail15:${who}:${net}`, 3, 15 * MIN, now))) return text("Too many sign-in emails for this address. Try again in 15 minutes.", 429);
  if (!(await rateLimit(db, `mailday:${who}:${net}`, 10, DAY, now)) || !(await rateLimit(db, `mailall:${who}`, 30, DAY, now))) {
    return text("Too many sign-in emails for this address today. Try again tomorrow, or use Google.", 429);
  }
  if (!(await rateLimit(db, `mailip:${net}`, 10, 60 * MIN, now))) return text("Too many sign-in emails from this network. Try again in an hour.", 429);
  const known = await db.prepare("SELECT 1 AS y FROM users WHERE email = ?").bind(email).first();
  if (!known) {
    if (!(await rateLimit(db, `mailnew:${net}`, 5, DAY, now))) return text("Too many new sign-ups from this network today. Use Google, or try again tomorrow.", 429);
    if (!(await rateLimit(db, "mail-new", 90, DAY, now))) return text("Email sign-up is busy today. Use Google, or try again tomorrow.", 503);
  }

  const token = randomToken();
  const hash = await sha256Hex(token);
  await db.prepare("INSERT INTO magic_links (token_hash, email, next, expires_at) VALUES (?, ?, ?, ?)").bind(hash, email, next, now + LINK_TTL_MS).run();
  const link = `${url.origin}/signin/verify#t=${token}`;
  if (dev) {
    console.log(`[dev] sign-in link: ${link}`);
    return Response.json({ ok: true });
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: [email],
      subject: "Your MargaLink sign-in link",
      text: `Here is your link to sign in to MargaLink:\n\n${link}\n\nIt works once, within 15 minutes. If you didn't ask for it, ignore this email: nobody can sign in without the link.`,
      html: `<p>Here is your link to sign in to MargaLink:</p><p><a href="${link}">Sign in to MargaLink</a></p><p>It works once, within 15 minutes. If you didn't ask for it, ignore this email: nobody can sign in without the link.</p>`,
    }),
  });
  if (!res.ok) {
    await db.prepare("DELETE FROM magic_links WHERE token_hash = ?").bind(hash).run();
    console.error(`sign-in email failed: ${res.status}`);
    return text("We couldn't send the email. Try again in a minute.", 502);
  }
  return Response.json({ ok: true });
};
