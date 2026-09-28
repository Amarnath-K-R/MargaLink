/// <reference types="@cloudflare/workers-types" />
// Server-side sign-in helpers for the account Functions (functions/api/).
// Never imported by the browser. Web Crypto only, so the same code runs in
// the Workers runtime and in the Node selfchecks.
//
// A session is an opaque 32-byte token in an HttpOnly cookie; the database
// keeps only its sha256. A second, readable cookie (ml_in=1) just tells the
// page that someone is signed in, so signed-out visitors never call /api/me.
// Nothing here logs an email, a token or a request body.
import { isEmail, normalEmail } from "./coins.ts";

export const SESSION_COOKIE = "__Host-ml_session";
export const HINT_COOKIE = "ml_in";
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
export const randomToken = (bytes = 32) => b64url(crypto.getRandomValues(new Uint8Array(bytes)));
const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
export const sha256Hex = async (s: string) => hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
export const newId = () => hex(crypto.getRandomValues(new Uint8Array(16)).buffer);

/** Where to go after signing in: a path on this site, or `fallback`. Never another origin. */
export function safeNext(next: unknown, fallback = "/home"): string {
  if (typeof next !== "string" || next.length > 512 || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return fallback;
  if (/[\u0000-\u001f\u007f]/.test(next)) return fallback;
  const u = new URL(next, "https://margalink.invalid");
  return u.origin === "https://margalink.invalid" ? u.pathname + u.search + u.hash : fallback;
}

export function readCookie(req: Request, name: string): string | null {
  for (const part of (req.headers.get("cookie") ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
}

/** Set-Cookie values that sign this browser in with `token`, or out (null). */
export function sessionCookies(token: string | null): [string, string] {
  const age = token ? SESSION_TTL_MS / 1000 : 0;
  return [`${SESSION_COOKIE}=${token ?? ""}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${age}`, `${HINT_COOKIE}=${token ? "1" : ""}; Path=/; Secure; SameSite=Lax; Max-Age=${age}`];
}

export type Session = { token: string; idHash: string; userId: string; email: string; expiresAt: number };

export async function createSession(db: D1Database, userId: string, now: number): Promise<string> {
  const token = randomToken();
  await db.prepare("INSERT INTO sessions (id_hash, user_id, expires_at) VALUES (?, ?, ?)").bind(await sha256Hex(token), userId, now + SESSION_TTL_MS).run();
  return token;
}

export async function getSession(db: D1Database, req: Request, now: number): Promise<Session | null> {
  const token = readCookie(req, SESSION_COOKIE);
  if (!token || token.length > 100) return null;
  const idHash = await sha256Hex(token);
  const row = await db
    .prepare("SELECT s.user_id AS userId, s.expires_at AS expiresAt, u.email AS email FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id_hash = ? AND s.expires_at > ?")
    .bind(idHash, now)
    .first<{ userId: string; expiresAt: number; email: string }>();
  return row ? { token, idHash, ...row } : null;
}

/** Push the expiry out once a day at most; true when the cookie should be re-sent. */
export async function rollSession(db: D1Database, s: Session, now: number): Promise<boolean> {
  if (s.expiresAt - now > SESSION_TTL_MS - 24 * 60 * 60 * 1000) return false;
  await db.prepare("UPDATE sessions SET expires_at = ? WHERE id_hash = ?").bind(now + SESSION_TTL_MS, s.idHash).run();
  return true;
}

export async function endSession(db: D1Database, s: Session, everywhere: boolean) {
  await (everywhere ? db.prepare("DELETE FROM sessions WHERE user_id = ?").bind(s.userId) : db.prepare("DELETE FROM sessions WHERE id_hash = ?").bind(s.idHash)).run();
}

/**
 * The account for a verified email (and, from Google, its stable id),
 * creating it the first time. A known Google id wins; otherwise the email
 * links the two ways of signing in to one account, which is safe because
 * both prove the address (Google verifies it; a link proves the inbox).
 */
export async function signInUser(db: D1Database, who: { email: string; google?: string }, now: number): Promise<{ id: string; email: string; created: boolean }> {
  const email = normalEmail(who.email);
  if (who.google) {
    const linked = await db.prepare("SELECT u.id, u.email FROM identities i JOIN users u ON u.id = i.user_id WHERE i.provider = 'google' AND i.subject = ?").bind(who.google).first<{ id: string; email: string }>();
    if (linked) return { ...linked, created: false };
  }
  const id = newId();
  const inserted = await db.prepare("INSERT INTO users (id, email, created_at) VALUES (?, ?, ?) ON CONFLICT(email) DO NOTHING").bind(id, email, now).run();
  const user = (await db.prepare("SELECT id, email FROM users WHERE email = ?").bind(email).first<{ id: string; email: string }>())!;
  if (who.google) await db.prepare("INSERT INTO identities (provider, subject, user_id) VALUES ('google', ?, ?) ON CONFLICT DO NOTHING").bind(who.google, user.id).run();
  return { ...user, created: inserted.meta.changes === 1 };
}

/** The payload of a JWT, unverified (see checkIdClaims for why that's enough here). */
export function jwtPayload(jwt: string): unknown {
  try {
    const part = jwt.split(".")[1];
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(part.replaceAll("-", "+").replaceAll("_", "/")), (c) => c.charCodeAt(0))));
  } catch {
    return null;
  }
}

/**
 * Checks the claims of an id_token that came straight from Google's token
 * endpoint, over TLS, in exchange for our client secret and PKCE verifier.
 * OIDC Core 3.1.3.7 lets that skip the signature check; issuer, audience,
 * expiry and a verified email are still required.
 */
export function checkIdClaims(claims: unknown, clientId: string, now: number): { sub: string; email: string } | string {
  if (!claims || typeof claims !== "object") return "no claims";
  const c = claims as Record<string, unknown>;
  if (c.iss !== "https://accounts.google.com" && c.iss !== "accounts.google.com") return "wrong issuer";
  if (c.aud !== clientId) return "wrong audience";
  if (typeof c.exp !== "number" || c.exp * 1000 <= now) return "expired";
  if (c.email_verified !== true && c.email_verified !== "true") return "email not verified";
  if (typeof c.sub !== "string" || !c.sub) return "no subject";
  if (typeof c.email !== "string" || !isEmail(normalEmail(c.email))) return "no email";
  return { sub: c.sub, email: normalEmail(c.email) };
}

export async function pkce(): Promise<{ verifier: string; challenge: string }> {
  const verifier = randomToken(32);
  return { verifier, challenge: b64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)))) };
}

/** A state-changing request from our own pages (the API is same-origin only). */
export const sameOrigin = (req: Request) => req.headers.get("origin") === new URL(req.url).origin;

/** Fixed-window counter: true while `key` has been used at most `limit` times in the window. */
export async function rateLimit(db: D1Database, key: string, limit: number, windowMs: number, now: number): Promise<boolean> {
  const row = await db
    .prepare(
      `INSERT INTO rate_limits (key, count, expires_at) VALUES (?1, 1, ?2)
       ON CONFLICT(key) DO UPDATE SET
         count = CASE WHEN expires_at <= ?3 THEN 1 ELSE count + 1 END,
         expires_at = CASE WHEN expires_at <= ?3 THEN ?2 ELSE expires_at END
       RETURNING count`,
    )
    .bind(key, now + windowMs, now)
    .first<{ count: number }>();
  return (row?.count ?? Infinity) <= limit;
}

/** A per-day hash of the caller's IP, for rate limits: the address itself is never stored. */
export const ipKey = async (req: Request, now: number) => sha256Hex(`${req.headers.get("cf-connecting-ip") ?? "local"}:${new Date(now).toISOString().slice(0, 10)}`);
