/// <reference types="@cloudflare/workers-types" />
// POST /api/auth/email/request {email, next}: emails a one-time sign-in
// link (15 minutes). The same answer whether or not the address has an
// account. Limits: 3 per address per 15 minutes and 10 a day, 10 an hour
// per network, 90 a day in all (Resend's free tier). The link carries the
// token in its #fragment, which never reaches a server, and the page asks
// before using it, so a mail scanner opening the link can't spend it.
import { ipKey, randomToken, rateLimit, readJson, safeNext, sha256Hex, text, type AccountEnv } from "../../../../src/lib/auth.ts";
import { isEmail, normalEmail } from "../../../../src/lib/coins.ts";

const LINK_TTL_MS = 15 * 60 * 1000;
const MIN = 60 * 1000;

export const onRequestPost: PagesFunction<AccountEnv> = async ({ request, env }) => {
  const now = Date.now();
  const body = await readJson(request);
  const email = typeof body?.email === "string" ? normalEmail(body.email) : "";
  if (!isEmail(email)) return text("Enter a valid email address.", 400);
  const next = safeNext(body?.next);
  const url = new URL(request.url);
  const dev = env.DEV_EMAIL_LOG === "1" && url.hostname === "localhost";
  if (!dev && (!env.RESEND_API_KEY || !env.EMAIL_FROM)) return text("Email sign-in isn't set up yet. Use Google for now.", 503);

  const db = env.DB;
  await db.batch([db.prepare("DELETE FROM magic_links WHERE expires_at <= ?").bind(now), db.prepare("DELETE FROM rate_limits WHERE expires_at <= ?").bind(now)]);
  const who = await sha256Hex(email);
  if (!(await rateLimit(db, `mail15:${who}`, 3, 15 * MIN, now)) || !(await rateLimit(db, `mailday:${who}`, 10, 24 * 60 * MIN, now))) {
    return text("Too many sign-in emails for this address. Try again in 15 minutes.", 429);
  }
  if (!(await rateLimit(db, `mailip:${await ipKey(request, now)}`, 10, 60 * MIN, now))) return text("Too many sign-in emails from this network. Try again in an hour.", 429);
  if (!(await rateLimit(db, "mail-all", 90, 24 * 60 * MIN, now))) return text("Email sign-in is busy today. Use Google, or try again tomorrow.", 503);

  const token = randomToken();
  const hash = await sha256Hex(token);
  await db.prepare("INSERT INTO magic_links (token_hash, email, next, expires_at) VALUES (?, ?, ?, ?)").bind(hash, email, next, now + LINK_TTL_MS).run();
  const link = `${url.origin}/signin/verify#t=${token}&e=${encodeURIComponent(email)}`;
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
