// Signs a Playwright browser context in, for the smokes, through mocks: the
// ml_in hint cookie, /api/me, and /api/review/start, which charges the real
// reviewPrice from a running balance (402 when it's short) and hands out
// tickets. The returned state is live: read `starts`, or set `balance`.
// Never a real account; the real Functions are exercised by e2e_accounts.mjs.
import { reviewPrice } from "../src/lib/coins.ts";

export async function mockAccount(context, { balance = 100, email = "smoke@example.org", origin = "http://localhost:3000" } = {}) {
  const state = { balance, email, starts: [] };
  await context.addCookies([{ name: "ml_in", value: "1", url: origin }]);
  await context.route("**/api/me", (route) => route.fulfill({ json: { user: { email: state.email }, balance: state.balance } }));
  await context.route("**/api/review/start", (route) => {
    const body = route.request().postDataJSON();
    state.starts.push(body);
    const coins = reviewPrice(body.tier, body.chunks.reduce((n, c) => n + c.chars, 0));
    if (coins > state.balance) return route.fulfill({ status: 402, json: { coins, balance: state.balance } });
    state.balance -= coins;
    return route.fulfill({ json: { ticket: `ticket-${state.starts.length}`, coins, balance: state.balance } });
  });
  return state;
}
