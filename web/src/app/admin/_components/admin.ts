// The console's requests and number formats, shared by its tabs.
export async function admin<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api/admin/${path}`, body === undefined ? undefined : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error((await res.text().catch(() => "")) || `Something went wrong (${res.status}). Try again.`);
  return (await res.json()) as T;
}

export const num = (n: number) => n.toLocaleString("en");
// An estimate at Anthropic's standard rates; null when a model has no price in stats.ts.
export const money = (c: number | null) => (c === null ? "Unknown" : `$${c.toFixed(2)}`);
export const when = (t: number) => new Date(t).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
export const date = (t: number) => new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

// What each AI route is, in the words the site uses.
export const FEATURES: Record<string, string> = { "/api/review": "AI review", "/api/figure": "Ask Claude", "/api/rewrite": "Rewrite" };

export type Totals = { calls: number; input: number; output: number; cost: number | null };
export type Stats = {
  overview: {
    users: { total: number; new7: number };
    active: { day: number; week: number; month: number };
    list: { beta: { listed: number; joined: number }; developer: { listed: number; joined: number } };
    requests: { day: number; errors: number; refused: number };
    ai: Totals;
    coins: { spent: number; welcomed: number; granted: number };
  };
  usage: {
    days: { day: string; requests: number; users: number; aiCalls: number; input: number; output: number; cost: number | null }[];
    routes: (Totals & { route: string })[];
    people: (Totals & { userId: string | null; email: string | null })[];
  };
};
