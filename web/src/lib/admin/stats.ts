// What the developer console shows (functions/api/admin/*): the overview,
// AI usage and its cost, the users table and the activity log, all read from
// D1. Days are UTC. Costs are estimates at Anthropic's standard rates; a model
// with no price here shows as unknown, never as free.
const DAY = 24 * 60 * 60 * 1000;

// $ per million tokens (platform.claude.com/docs/en/about-claude/pricing, checked 2 October 2026).
export const PRICES: Record<string, { input: number; output: number }> = {
  "claude-sonnet-5": { input: 2, output: 10 },
};

export function aiCost(model: string | null, input: number, output: number): number | null {
  const p = model ? PRICES[model] : undefined;
  return p ? (input * p.input + output * p.output) / 1e6 : null;
}

// Token sums per model, folded into one figure (unknown if any model is).
type ModelSum = { model: string | null; calls: number; input: number; output: number };
function fold(rows: ModelSum[]) {
  let cost: number | null = 0;
  const t = { calls: 0, input: 0, output: 0 };
  for (const r of rows) {
    t.calls += r.calls;
    t.input += r.input ?? 0;
    t.output += r.output ?? 0;
    const c = aiCost(r.model, r.input ?? 0, r.output ?? 0);
    cost = cost === null || c === null ? null : cost + c;
  }
  return { ...t, cost };
}
// Groups rows by `key`, folding each group's per-model sums.
function byKey<K extends string>(rows: (ModelSum & Record<K, string | null>)[], key: K) {
  const groups = new Map<string | null, ModelSum[]>();
  for (const r of rows) groups.set(r[key], [...(groups.get(r[key]) ?? []), r]);
  return [...groups].map(([k, g]) => ({ key: k, ...fold(g) }));
}

const rows = async <T>(s: D1PreparedStatement) => (await s.all<T>()).results;

export async function overview(db: D1Database, now: number) {
  const [users, active, list, requests, ai, coins] = await db.batch([
    db.prepare("SELECT COUNT(*) AS total, COALESCE(SUM(created_at > ?), 0) AS new7 FROM users").bind(now - 7 * DAY),
    db
      .prepare(
        `SELECT COUNT(DISTINCT CASE WHEN at > ?1 THEN user_id END) AS day, COUNT(DISTINCT CASE WHEN at > ?2 THEN user_id END) AS week,
                COUNT(DISTINCT user_id) AS month FROM api_events WHERE user_id IS NOT NULL AND at > ?3`,
      )
      .bind(now - DAY, now - 7 * DAY, now - 30 * DAY),
    db.prepare("SELECT role, COUNT(*) AS listed, SUM(EXISTS (SELECT 1 FROM users u WHERE u.access_key = a.email_key)) AS joined FROM access_list a GROUP BY role"),
    db.prepare("SELECT COUNT(*) AS day, COALESCE(SUM(status >= 500), 0) AS errors, COALESCE(SUM(status >= 400 AND status < 500), 0) AS refused FROM api_events WHERE at > ?").bind(now - DAY),
    db.prepare("SELECT model, COUNT(*) AS calls, SUM(input_tokens) AS input, SUM(output_tokens) AS output FROM api_events WHERE model IS NOT NULL AND at > ? GROUP BY model").bind(now - 30 * DAY),
    db
      .prepare(
        `SELECT COALESCE(-SUM(CASE WHEN kind IN ('review', 'review_refund', 'figure', 'figure_refund') THEN delta END), 0) AS spent,
                COALESCE(SUM(CASE WHEN kind = 'welcome' THEN delta END), 0) AS welcomed, COALESCE(SUM(CASE WHEN kind = 'admin' THEN delta END), 0) AS granted
         FROM coin_ledger WHERE created_at > ?`,
      )
      .bind(now - 30 * DAY),
  ]);
  const role = (r: string) => {
    const row = (list.results as { role: string; listed: number; joined: number }[]).find((x) => x.role === r);
    return { listed: row?.listed ?? 0, joined: row?.joined ?? 0 };
  };
  return {
    users: users.results[0] as { total: number; new7: number },
    active: active.results[0] as { day: number; week: number; month: number },
    list: { beta: role("beta"), developer: role("developer") },
    requests: requests.results[0] as { day: number; errors: number; refused: number },
    ai: fold(ai.results as ModelSum[]),
    coins: coins.results[0] as { spent: number; welcomed: number; granted: number },
  };
}

export async function usage(db: D1Database, now: number) {
  const since = now - 30 * DAY;
  const day = "strftime('%Y-%m-%d', at / 1000, 'unixepoch')";
  const [traffic, aiDays, routes, people] = await Promise.all([
    rows<{ day: string; requests: number; users: number }>(db.prepare(`SELECT ${day} AS day, COUNT(*) AS requests, COUNT(DISTINCT user_id) AS users FROM api_events WHERE at > ? GROUP BY day`).bind(since)),
    rows<ModelSum & { day: string }>(db.prepare(`SELECT ${day} AS day, model, COUNT(*) AS calls, SUM(input_tokens) AS input, SUM(output_tokens) AS output FROM api_events WHERE model IS NOT NULL AND at > ? GROUP BY day, model`).bind(since)),
    rows<ModelSum & { route: string }>(db.prepare("SELECT route, model, COUNT(*) AS calls, SUM(input_tokens) AS input, SUM(output_tokens) AS output FROM api_events WHERE model IS NOT NULL AND at > ? GROUP BY route, model").bind(since)),
    rows<ModelSum & { userId: string | null; email: string | null }>(
      db
        .prepare(
          `SELECT e.user_id AS userId, u.email, e.model, COUNT(*) AS calls, SUM(e.input_tokens) AS input, SUM(e.output_tokens) AS output
           FROM api_events e LEFT JOIN users u ON u.id = e.user_id WHERE e.model IS NOT NULL AND e.at > ? GROUP BY e.user_id, e.model`,
        )
        .bind(since),
    ),
  ]);
  const ai = new Map(byKey(aiDays, "day").map((d) => [d.key, d]));
  const seen = new Map(traffic.map((t) => [t.day, t]));
  const days = Array.from({ length: 30 }, (_, i) => {
    const key = new Date(now - (29 - i) * DAY).toISOString().slice(0, 10);
    const a = ai.get(key);
    return { day: key, requests: seen.get(key)?.requests ?? 0, users: seen.get(key)?.users ?? 0, aiCalls: a?.calls ?? 0, input: a?.input ?? 0, output: a?.output ?? 0, cost: a ? a.cost : 0 };
  });
  const heaviest = (a: { input: number; output: number }, b: { input: number; output: number }) => b.input + b.output - (a.input + a.output);
  const emails = new Map(people.map((p) => [p.userId, p.email]));
  return {
    days,
    routes: byKey(routes, "route").map(({ key, ...t }) => ({ route: key!, ...t })).sort(heaviest),
    people: byKey(people, "userId").map(({ key, ...t }) => ({ userId: key, email: emails.get(key) ?? null, ...t })).sort(heaviest).slice(0, 20),
  };
}

export type UserRow = { id: string; email: string; createdAt: number; balance: number; roles: string[]; lastSeen: number | null; aiCalls: number; input: number; output: number; cost: number | null };

/** Every account (up to 500), most recently seen first, then newest; AI use over the log's 30 days. */
export async function userTable(db: D1Database): Promise<UserRow[]> {
  const [list, ai] = await Promise.all([
    rows<{ id: string; email: string; createdAt: number; balance: number; roles: string | null; lastSeen: number | null }>(
      db.prepare(
        `SELECT u.id, u.email, u.created_at AS createdAt,
                (SELECT COALESCE(SUM(delta), 0) FROM coin_ledger c WHERE c.user_id = u.id) AS balance,
                (SELECT group_concat(role) FROM access_list a WHERE a.email_key = u.access_key) AS roles,
                (SELECT MAX(at) FROM api_events e WHERE e.user_id = u.id) AS lastSeen
         FROM users u ORDER BY lastSeen IS NULL, lastSeen DESC, u.created_at DESC LIMIT 500`,
      ),
    ),
    rows<ModelSum & { userId: string }>(
      db.prepare("SELECT user_id AS userId, model, COUNT(*) AS calls, SUM(input_tokens) AS input, SUM(output_tokens) AS output FROM api_events WHERE model IS NOT NULL AND user_id IS NOT NULL GROUP BY user_id, model"),
    ),
  ]);
  const use = new Map(byKey(ai, "userId").map((u) => [u.key, u]));
  return list.map((u) => {
    const a = use.get(u.id);
    return { ...u, roles: u.roles ? u.roles.split(",").sort() : [], aiCalls: a?.calls ?? 0, input: a?.input ?? 0, output: a?.output ?? 0, cost: a ? a.cost : 0 };
  });
}

export type EventFilter = { before?: number; route?: string; status?: number; user?: string; ai?: boolean; limit: number };

/** The activity log, newest first, a page at a time (`next`: the id to pass as `before`). */
export async function eventPage(db: D1Database, f: EventFilter) {
  const events = await rows<{ id: number; at: number; route: string; method: string; status: number; ms: number; model: string | null; input: number | null; output: number | null; userId: string | null; email: string | null }>(
    db
      .prepare(
        `SELECT e.id, e.at, e.route, e.method, e.status, e.ms, e.model, e.input_tokens AS input, e.output_tokens AS output, e.user_id AS userId, u.email
         FROM api_events e LEFT JOIN users u ON u.id = e.user_id
         WHERE (?1 IS NULL OR e.id < ?1) AND (?2 IS NULL OR substr(e.route, 1, length(?2)) = ?2) AND (?3 IS NULL OR e.status / 100 = ?3)
           AND (?4 IS NULL OR e.user_id = ?4) AND (?5 = 0 OR e.model IS NOT NULL)
         ORDER BY e.id DESC LIMIT ?6`,
      )
      .bind(f.before ?? null, f.route || null, f.status ?? null, f.user || null, f.ai ? 1 : 0, f.limit),
  );
  return { events, next: events.length === f.limit ? events[events.length - 1].id : null };
}
