/// <reference types="@cloudflare/workers-types" />
// GET /api/admin/events?route=&status=&user=&ai=1&before=&limit=: the
// activity log, newest first. route: a path prefix; status: its first digit
// (4 for refusals, 5 for failures); user: an account id; ai=1: AI calls only;
// before: the `next` of the previous page. Developers only.
import { text } from "../../../src/lib/accounts/auth.ts";
import { developerIn } from "../../../src/lib/access/access.ts";
import { eventPage } from "../../../src/lib/admin/stats.ts";

const int = (s: string | null, min: number, max: number) => {
  const n = s === null ? NaN : Number(s);
  return Number.isInteger(n) && n >= min && n <= max ? n : undefined;
};

export const onRequestGet: PagesFunction<{ DB: D1Database }> = async ({ request, env, data }) => {
  if (!developerIn(data)) return text("Only MargaLink's developers can open this.", 403);
  const q = new URL(request.url).searchParams;
  return Response.json(
    await eventPage(env.DB, {
      before: int(q.get("before"), 1, Number.MAX_SAFE_INTEGER),
      route: q.get("route")?.slice(0, 100),
      status: int(q.get("status"), 1, 5),
      user: q.get("user")?.slice(0, 64),
      ai: q.get("ai") === "1",
      limit: int(q.get("limit"), 1, 200) ?? 100,
    }),
  );
};
