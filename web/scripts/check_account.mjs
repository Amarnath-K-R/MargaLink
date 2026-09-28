// Dev-only: the account flows in a real browser against mocked account APIs
// (the real Functions are exercised by e2e_accounts.mjs): a signed-out
// visitor makes no account request; the email link (sent, then confirmed on
// the verify page, then the token gone from the address bar); Google's popup
// closing itself; the account page's history and a delete that needs the
// address typed; and buying a pack with Paddle.js stubbed, the balance
// updating when the webhook's coins arrive.
import { chromium } from "playwright";
import { mockAccount } from "./mock_account.mjs";

const O = "http://localhost:3000";
const browser = await chromium.launch();
function check(label, ok) {
  console.log(`${ok ? "ok  " : "FAIL"} ${label}`);
  if (!ok) process.exit(1);
}
const errors = [];
const watch = (page) => {
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && !/Failed to load resource/.test(m.text()) && errors.push(m.text()));
};

// --- signed out: nothing asked of the account API
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  watch(page);
  const asked = [];
  page.on("request", (r) => /\/api\/(me|account)/.test(r.url()) && asked.push(r.url()));
  for (const p of ["/", "/home", "/pricing", "/review", "/terms"]) await page.goto(O + p, { waitUntil: "networkidle" });
  check("signed out, no page asks the account API", asked.length === 0);
  check("the pricing page invites signing in to buy", (await page.goto(O + "/pricing"), await page.getByRole("link", { name: "Sign in to buy" }).count()) === 3);

  // the email link
  let requested = null;
  await ctx.route("**/api/auth/email/request", (r) => ((requested = r.request().postDataJSON()), r.fulfill({ json: { ok: true } })));
  await page.goto(O + "/signin?next=/review");
  await page.fill("#signin-email", "ann@example.org");
  await page.click("text=Send the link");
  await page.waitForSelector("text=Check your email");
  check("the link is asked for with the page to return to", requested?.email === "ann@example.org" && requested?.next === "/review");

  // the verify page asks first, then signs in and clears the token
  let spent = 0;
  await ctx.route("**/api/auth/email/verify", async (r) => {
    spent++;
    await ctx.addCookies([{ name: "ml_in", value: "1", url: O }]);
    return r.fulfill({ json: { next: "/review" } });
  });
  await ctx.route("**/api/me", (r) => r.fulfill({ json: spent ? { user: { id: "u1", email: "ann@example.org" }, balance: 10, paddle: null } : { user: null } }));
  await page.goto(O + "/signin/verify#t=tok123&e=ann%40example.org");
  await page.waitForSelector("text=Sign in as ann@example.org?");
  check("opening the link spends nothing", spent === 0);
  await page.locator(".sheet button", { hasText: "Sign in" }).click();
  await page.waitForSelector("text=You're signed in as ann@example.org");
  check("confirming signs in", spent === 1);
  check("the token leaves the address bar", !(await page.evaluate(() => location.href)).includes("tok123"));
  await page.waitForSelector('a[href="/account"][aria-label^="10 M coins"]');
  check("the tray shows the balance", true);

  // Google: the popup lands on /signin?done=1 and closes itself
  await page.goto(O + "/signin");
  await ctx.route("**/api/auth/google/start**", (r) => r.fulfill({ status: 302, headers: { location: "/signin?done=1&next=%2Fhome" } }));
  await ctx.clearCookies();
  await page.goto(O + "/signin");
  const [popup] = await Promise.all([page.waitForEvent("popup"), page.getByRole("button", { name: "Continue with Google" }).click()]);
  await popup.waitForEvent("close", { timeout: 10000 });
  check("Google's popup closes itself when it's done", popup.isClosed());
  await ctx.close();
}

// --- the account page, and buying a pack
{
  const ctx = await browser.newContext();
  const account = await mockAccount(ctx, { balance: 12, paddle: { env: "sandbox", token: "test_tok", prices: { S: "pri_s", M: "pri_m", L: "pri_l" } } });
  await ctx.route("**/api/account", (r) =>
    r.fulfill({ json: { email: account.email, balance: account.balance, google: false, history: [{ kind: "welcome", label: "Welcome bonus", delta: 10, at: Date.now() }, { kind: "figure", label: "Ask Claude (figure)", delta: -1, at: Date.now() }] } }),
  );
  // Paddle.js stubbed: opening the checkout "completes" it straight away.
  await ctx.route("https://cdn.paddle.com/**", (r) =>
    r.fulfill({
      contentType: "application/javascript",
      body: `window.Paddle = { Environment: { set(e) { window.__env = e; } }, Initialize(o) { window.__cb = o.eventCallback; }, Checkout: { open(o) { window.__opened = o; setTimeout(() => window.__cb({ name: "checkout.completed" }), 50); } } };`,
    }),
  );
  const page = await ctx.newPage();
  watch(page);
  await page.goto(O + "/account");
  await page.waitForSelector("text=Welcome bonus");
  check("the account page lists the coin history", (await page.locator("ol li").count()) === 2);
  const del = page.getByRole("button", { name: "Delete my account" });
  check("delete waits for the address", await del.isDisabled());
  await page.fill("#delete-confirm", "someone@else.org");
  check("a different address doesn't unlock it", await del.isDisabled());
  await page.fill("#delete-confirm", account.email);
  check("the account's own address does", await del.isEnabled());

  const scripts = [];
  page.on("request", (r) => r.url().startsWith("https://cdn.paddle.com") && scripts.push(r.url()));
  await page.goto(O + "/pricing");
  await page.waitForSelector('[data-pack="S"] button');
  check("Paddle.js isn't loaded just by visiting", scripts.length === 0);
  await page.locator('[data-pack="S"] button').click();
  await page.waitForFunction(() => window.__opened);
  const opened = await page.evaluate(() => ({ o: window.__opened, env: window.__env }));
  check("the checkout names the pack, the account and the address", opened.o.items[0].priceId === "pri_s" && opened.o.customData.user_id === "user-smoke" && opened.o.customer.email === account.email && opened.env === "sandbox");
  account.balance += 50; // the webhook's coins
  await page.waitForSelector('[data-pack="S"] >> text=Added. You now have 62 M coins.', { timeout: 20000 });
  check("the new coins show up after checkout", true);
  await ctx.close();
}

check(`no page errors${errors.length ? `: ${errors.join(" | ")}` : ""}`, errors.length === 0);
await browser.close();
console.log("PASS");
