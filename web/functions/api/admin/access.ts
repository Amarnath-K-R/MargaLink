/// <reference types="@cloudflare/workers-types" />
// GET /api/admin/access: the beta and developer lists. POST {action: "add",
// role, emails, note?}: adds up to 200 addresses at once; {action: "remove",
// role, emailKey}: takes a role away (signing the person out if it was their
// last), refusing to remove the last developer. Developers only.
import { readJson, text } from "../../../src/lib/accounts/auth.ts";
import { addAccess, developerIn, listAccess, removeAccess, ROLES, type Role } from "../../../src/lib/access/access.ts";

const refuse = () => text("Only MargaLink's developers can open this.", 403);

export const onRequestGet: PagesFunction<{ DB: D1Database }> = async ({ env, data }) => {
  if (!developerIn(data)) return refuse();
  return Response.json({ entries: await listAccess(env.DB) });
};

export const onRequestPost: PagesFunction<{ DB: D1Database }> = async ({ request, env, data }) => {
  const dev = developerIn(data);
  if (!dev) return refuse();
  const body = await readJson(request);
  const role = body?.role as Role;
  if (!ROLES.includes(role)) return text("Choose a list: beta or developer.", 400);
  if (body?.action === "add") {
    const emails = body.emails;
    if (!Array.isArray(emails) || !emails.length || emails.length > 200 || !emails.every((e) => typeof e === "string" && e.length <= 320)) {
      return text("Add between 1 and 200 addresses at a time.", 400);
    }
    const note = typeof body.note === "string" ? body.note : undefined;
    return Response.json(await addAccess(env.DB, emails.map((email: string) => ({ email, role, note })), dev.session.userId, Date.now()));
  }
  if (body?.action === "remove" && typeof body.emailKey === "string") {
    const r = await removeAccess(env.DB, body.emailKey, role);
    return r.ok ? Response.json(r) : text("That's the last developer. Add another before removing this one.", 409);
  }
  return text("Unknown action.", 400);
};
