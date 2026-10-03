// The console's activity log (api_events, migration 0010): one row per API
// request, written by functions/api/_middleware.ts after it answers. The
// account comes from the session's hash (never an address), the route is the
// path without its query (a sign-in code travels there), and an AI call adds
// its model and token counts. Nothing from a request or a reply, no IP. Kept
// 30 days, and deleted with the account.
export const EVENTS_KEPT_MS = 30 * 24 * 60 * 60 * 1000;

export type AiUsage = { model: string; input: number; output: number };
export type ApiEvent = { at: number; idHash: string | null; route: string; method: string; status: number; ms: number; ai?: AiUsage };

export function logEvent(db: D1Database, e: ApiEvent) {
  return db
    .prepare(
      `INSERT INTO api_events (at, user_id, route, method, status, ms, model, input_tokens, output_tokens)
       VALUES (?1, (SELECT user_id FROM sessions WHERE id_hash = ?2), ?3, ?4, ?5, ?6, ?7, ?8, ?9)`,
    )
    .bind(e.at, e.idHash, e.route.split("?")[0].slice(0, 100), e.method.slice(0, 10), e.status, Math.round(e.ms), e.ai?.model ?? null, e.ai?.input ?? null, e.ai?.output ?? null)
    .run();
}

export function purgeEvents(db: D1Database, now: number) {
  return db.prepare("DELETE FROM api_events WHERE at < ?").bind(now - EVENTS_KEPT_MS).run();
}

/** For callAnthropicTool's onUsage: adds a call's tokens to the request's row (a request may call more than once). */
export const usageSink = (data: Record<string, unknown>, model: string) => (u: { input: number; output: number }) => {
  const prev = data.ai as AiUsage | undefined;
  data.ai = { model, input: (prev?.input ?? 0) + u.input, output: (prev?.output ?? 0) + u.output } satisfies AiUsage;
};
