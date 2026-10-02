// The closed beta's access list, and the one door to an account while it
// runs. Addresses match by their canonical form (coins.ts canonicalEmail), so
// a tester listed as Ann.Lee+beta@googlemail.com can sign in as
// ann.lee@gmail.com or annlee@gmail.com (both match annlee@gmail.com). The sign-in handlers ask admitUser, the gates
// (functions/_middleware.ts, functions/api/_middleware.ts) ask accessFor, and
// the console (/api/admin/access) edits the list.
import { readCookie, SESSION_COOKIE, sha256Hex, signInUser, type Session } from "../accounts/auth.ts";
import { canonicalEmail, isEmail, normalEmail } from "../accounts/coins.ts";
import { grantWelcome } from "../accounts/ledger.ts";
import { NOTICE_VERSION } from "../accounts/notice.ts";
import { BETA } from "./beta.ts";

export type Role = "beta" | "developer";
export const ROLES: readonly Role[] = ["beta", "developer"];
export type Access = { session: Session; approved: boolean; developer: boolean };

/** Whether an address may sign in: any, with the beta off; otherwise a listed one. */
export async function mayEnter(db: D1Database, email: string): Promise<boolean> {
  return !BETA.on || !!(await db.prepare("SELECT 1 FROM access_list WHERE email_key = ?").bind(canonicalEmail(email)).first());
}

/**
 * Signs in a verified address (and, from Google, its stable id), or returns
 * null, before anything about it is stored, while the beta runs and the
 * address isn't listed. Records the canonical address the gates check, the
 * notice a new account signed up under, and the welcome coins.
 */
export async function admitUser(db: D1Database, who: { email: string; google?: string }, now: number, secret: string) {
  if (!(await mayEnter(db, who.email))) return null;
  const key = canonicalEmail(who.email);
  const user = await signInUser(db, who, now);
  await db
    .prepare(`UPDATE users SET access_key = ?${user.created ? `, notice_version = ${NOTICE_VERSION}` : ""} WHERE id = ?`)
    .bind(key, user.id)
    .run();
  await grantWelcome(db, user.id, user.email, now, secret);
  return user;
}

/** The session behind a request and what it may open, in one query; null when signed out. */
export async function accessFor(db: D1Database, req: Request, now: number): Promise<Access | null> {
  const token = readCookie(req, SESSION_COOKIE);
  if (!token || token.length > 100) return null;
  const idHash = await sha256Hex(token);
  const row = await db
    .prepare(
      `SELECT s.user_id AS userId, s.expires_at AS expiresAt, u.email AS email,
              (SELECT group_concat(role) FROM access_list a WHERE a.email_key = u.access_key) AS roles
       FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id_hash = ? AND s.expires_at > ?`,
    )
    .bind(idHash, now)
    .first<{ userId: string; expiresAt: number; email: string; roles: string | null }>();
  if (!row) return null;
  const { roles, ...rest } = row;
  const list = roles ? roles.split(",") : [];
  return { session: { token, idHash, ...rest }, approved: !BETA.on || list.length > 0, developer: list.includes("developer") };
}

/** For the console's handlers: the developer the API middleware let through (context.data.access), or null. */
export function developerIn(data: Record<string, unknown> | undefined): Access | null {
  const a = data?.access as Access | undefined;
  return a?.developer ? a : null;
}

/** Adds addresses to the list (one transaction); reports each by its canonical key, and the ones that aren't addresses as given. */
export async function addAccess(db: D1Database, entries: { email: string; role: Role; note?: string }[], by: string | null, now: number) {
  const invalid: string[] = [];
  const rows: { key: string; email: string; role: Role; note: string | null }[] = [];
  for (const e of entries) {
    const email = normalEmail(e.email);
    if (!isEmail(email) || !ROLES.includes(e.role)) invalid.push(e.email);
    else rows.push({ key: canonicalEmail(email), email, role: e.role, note: e.note?.trim().slice(0, 200) || null });
  }
  const results = rows.length
    ? await db.batch(
        rows.map((r) =>
          db
            .prepare("INSERT INTO access_list (email_key, email, role, note, added_by, added_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING")
            .bind(r.key, r.email, r.role, r.note, by, now),
        ),
      )
    : [];
  const added: string[] = [];
  const already: string[] = [];
  results.forEach((res, i) => (res.meta.changes === 1 ? added : already).push(rows[i].key));
  return { added, already, invalid };
}

/**
 * Takes a role away. Someone left with none is signed out everywhere at once
 * (their account and coins stay). The last developer can't be removed, or
 * no one could open the console again; the check is in the DELETE itself, so
 * two developers removing each other can't both succeed.
 */
export async function removeAccess(db: D1Database, emailKey: string, role: Role): Promise<{ ok: true } | { ok: false; reason: "last-developer" }> {
  const [removed] = await db.batch([
    db
      .prepare(
        `DELETE FROM access_list WHERE email_key = ?1 AND role = ?2
           AND (?2 <> 'developer' OR EXISTS (SELECT 1 FROM access_list WHERE role = 'developer' AND email_key <> ?1))`,
      )
      .bind(emailKey, role),
    db
      .prepare("DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE access_key = ?1) AND NOT EXISTS (SELECT 1 FROM access_list WHERE email_key = ?1)")
      .bind(emailKey),
  ]);
  if (removed.meta.changes === 0 && (await db.prepare("SELECT 1 FROM access_list WHERE email_key = ? AND role = ?").bind(emailKey, role).first())) {
    return { ok: false, reason: "last-developer" };
  }
  return { ok: true };
}

export type AccessEntry = { email_key: string; email: string; role: Role; note: string | null; added_at: number; user_id: string | null };

/** The list, developers first, newest first, each with the account that signed in with it (null until someone has). */
export async function listAccess(db: D1Database): Promise<AccessEntry[]> {
  const { results } = await db
    .prepare(
      `SELECT a.email_key, a.email, a.role, a.note, a.added_at,
              (SELECT id FROM users u WHERE u.access_key = a.email_key ORDER BY u.created_at LIMIT 1) AS user_id
       FROM access_list a ORDER BY a.role DESC, a.added_at DESC, a.email_key`,
    )
    .all<AccessEntry>();
  return results;
}
