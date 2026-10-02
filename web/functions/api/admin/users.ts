/// <reference types="@cloudflare/workers-types" />
// GET /api/admin/users: every account, with its balance, roles, when it was
// last seen and its AI use. POST {userId, coins}: gives an account coins
// (an "Adjustment" in its history), 1 to 10,000 at a time. Developers only.
import { randomToken, readJson, text } from "../../../src/lib/accounts/auth.ts";
import { balance, credit } from "../../../src/lib/accounts/ledger.ts";
import { developerIn } from "../../../src/lib/access/access.ts";
import { userTable } from "../../../src/lib/admin/stats.ts";

const refuse = () => text("Only MargaLink's developers can open this.", 403);

export const onRequestGet: PagesFunction<{ DB: D1Database }> = async ({ env, data }) => {
  if (!developerIn(data)) return refuse();
  return Response.json({ users: await userTable(env.DB) });
};

export const onRequestPost: PagesFunction<{ DB: D1Database }> = async ({ request, env, data }) => {
  if (!developerIn(data)) return refuse();
  const body = await readJson(request);
  const userId = typeof body?.userId === "string" ? body.userId : "";
  const coins = body?.coins;
  if (!userId || typeof coins !== "number" || !Number.isInteger(coins) || coins < 1 || coins > 10_000) return text("Give a whole number of coins, from 1 to 10,000.", 400);
  if (!(await credit(env.DB, userId, coins, "admin", `admin:${randomToken()}`, Date.now()))) return text("There's no such account.", 404);
  return Response.json({ balance: await balance(env.DB, userId) });
};
