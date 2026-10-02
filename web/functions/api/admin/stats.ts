/// <reference types="@cloudflare/workers-types" />
// GET /api/admin/stats: the console's overview and its 30 days of AI usage.
// Developers only: the API middleware checks, and so does every console handler.
import { text } from "../../../src/lib/accounts/auth.ts";
import { developerIn } from "../../../src/lib/access/access.ts";
import { overview, usage } from "../../../src/lib/admin/stats.ts";

export const onRequestGet: PagesFunction<{ DB: D1Database }> = async ({ env, data }) => {
  if (!developerIn(data)) return text("Only MargaLink's developers can open this.", 403);
  const now = Date.now();
  const [o, u] = await Promise.all([overview(env.DB, now), usage(env.DB, now)]);
  return Response.json({ overview: o, usage: u });
};
