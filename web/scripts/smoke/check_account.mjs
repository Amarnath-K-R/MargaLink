// Dev-only: the account flows in a real browser against mocked account APIs
// (the real Functions are exercised by e2e_accounts.mjs): a signed-out
// visitor makes no account request; the email link (sent, then confirmed on
// the verify page, then the token gone from the address bar); Google's popup
// closing itself; the account page's history and a delete that needs the
// address typed; buying a pack and Pro with Paddle.js stubbed, the balance
// updating when the webhook's coins arrive; and managing Pro in the portal.
// While the beta runs: the sign-in page's notice, Google only, the refusal
// for an uninvited account, and Sign out for a signed-in one.
import { chromium } from "playwright";
import { mockAccount } from "./mock_account.mjs";
import { BETA } from "../../src/lib/access/beta.ts";

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
  check("the pricing page invites signing in to buy", (await page.goto(O + "/pricing"), await page.getByRole("link", { name: "Sign in to buy" }).count()) === 5);

  if (BETA.on) {
    await page.goto(O + "/signin?next=/review");
    check("the sign-in page says who it's open to", (await page.getByText(/open to invited beta testers/i).isVisible()) && (await page.getByText(/coming soon/i).isVisible()));
    check("Google only during the beta", (await page.getByLabel("Email me a sign-in link").count()) === 0 && (await page.getByRole("button", { name: "Continue with Google" }).isDisabled()));
    await page.goto(O + "/signin?error=not-approved&next=/home");
    check("an uninvited account is told who to ask", await page.getByRole("alert").filter({ hasText: /isn't on the beta list.*developer@margalink\.com/ }).isVisible());
  }

  // the email link (off during the beta; links already sent still work)
  let requested = null;
  await ctx.route("**/api/auth/email/request", (r) => ((requested = r.request().postDataJSON()), r.fulfill({ json: { ok: true } })));
  if (!BETA.on) {
    await page.goto(O + "/signin?next=/review");
    await page.getByLabel("Email me a sign-in link").fill("ann@example.org");
    check("no sign-in before both boxes are ticked", (await page.getByRole("button", { name: "Send the link" }).isDisabled()) && (await page.getByRole("button", { name: "Continue with Google" }).isDisabled()));
    await page.getByLabel("I confirm I'm 18 or older.").check();
    await page.getByLabel(/I agree to the terms/).check();
    await page.click("text=Send the link");
    await page.waitForSelector("text=Check your email");
    check("the link is asked for with the page to return to, and the boxes ticked", requested?.email === "ann@example.org" && requested?.next === "/review" && requested?.agree === true);
  }

  // the verify page asks first, then signs in and clears the token
  let spent = 0;
  await ctx.route("**/api/auth/email/verify", async (r) => {
    if (r.request().postDataJSON().peek) return r.fulfill({ json: { email: "ann@example.org" } });
    spent++;
    await ctx.addCookies([{ name: "ml_in", value: "1", url: O }]);
    return r.fulfill({ json: { next: "/review", email: "ann@example.org" } });
  });
  await ctx.route("**/api/me", (r) => r.fulfill({ json: spent ? { user: { id: "u1", email: "ann@example.org" }, balance: 10, paddle: null } : { user: null } }));
  await page.goto(O + "/signin/verify#t=tok123&e=someone-else%40example.org");
  await page.waitForSelector("text=Sign in as ann@example.org?");
  check("the page names the account the server has for the link, not what the link says", !(await page.locator("text=someone-else").count()));
  check("opening the link spends nothing", spent === 0);
  await page.locator(".sheet button", { hasText: "Sign in" }).click();
  await page.waitForSelector("text=You're signed in as ann@example.org");
  check("confirming signs in", spent === 1);
  check("the token leaves the address bar", !(await page.evaluate(() => location.href)).includes("tok123"));
  await page.waitForSelector('a[href="/account"][aria-label^="10 M coins"]');
  check("the tray shows the balance", true);

  // Google: the popup lands on /signin?done=1 and closes itself
  await page.goto(O + "/signin");
  let googleStart = "";
  await ctx.route("**/api/auth/google/start**", (r) => ((googleStart = r.request().url()), r.fulfill({ status: 302, headers: { location: "/signin?done=1&next=%2Fhome" } })));
  await ctx.clearCookies();
  await page.goto(O + "/signin");
  await page.getByLabel("I confirm I'm 18 or older.").check();
  await page.getByLabel(/I agree to the terms/).check();
  const [popup] = await Promise.all([page.waitForEvent("popup"), page.getByRole("button", { name: "Continue with Google" }).click()]);
  await popup.waitForEvent("close", { timeout: 10000 });
  check("Google's popup closes itself when it's done", popup.isClosed());
  check("Google's sign-in carries the ticked boxes", new URL(googleStart).searchParams.get("agree") === "1");
  await ctx.close();
}

// --- signed in, but not on the beta list (removed, or from before it): Sign out, not a Continue that bounces back
{
  const ctx = await browser.newContext();
  await ctx.addCookies([{ name: "ml_in", value: "1", url: O }]);
  let out = false;
  await ctx.route("**/api/me", (r) => r.fulfill({ json: out ? { user: null } : { user: { id: "u2", email: "bo@example.org" }, balance: 0, pro: null, paddle: null, access: { approved: false, developer: false } } }));
  await ctx.route("**/api/auth/logout", (r) => ((out = true), r.fulfill({ json: { ok: true } })));
  const page = await ctx.newPage();
  watch(page);
  await page.goto(O + "/signin?next=/home");
  await page.waitForSelector("text=isn't on the beta list");
  check("an uninvited account gets Sign out, not Continue", (await page.getByRole("link", { name: "Continue" }).count()) === 0);
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForSelector("text=Continue with Google");
  check("signing out brings back the sign-in", out);
  await ctx.close();
}

// --- the account page, and buying a pack
{
  const ctx = await browser.newContext();
  const account = await mockAccount(ctx, { balance: 12, paddle: { env: "sandbox", token: "test_tok", prices: { S: "pri_s", M: "pri_m", L: "pri_l", PRO_MONTH: "pri_pm", PRO_YEAR: "pri_py" }, checkout: "sig-smoke" } });
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
  check("no checkout before the terms and refund policy are accepted", await page.locator('[data-pack="S"] button').isDisabled());
  await page.getByLabel(/I agree to the terms and the refund policy\.$/).check();
  await page.locator('[data-pack="S"] button').click();
  await page.waitForFunction(() => window.__opened);
  const opened = await page.evaluate(() => ({ o: window.__opened, env: window.__env }));
  check("the checkout names the pack, the account and the address", opened.o.items[0].priceId === "pri_s" && opened.o.customData.user_id === "user-smoke" && opened.o.customData.sig === "sig-smoke" && opened.o.customer.email === account.email && opened.env === "sandbox");
  account.balance += 50; // the webhook's coins
  await page.waitForSelector('[data-pack="S"] >> text=Added. You now have 62 M coins.', { timeout: 20000 });
  check("the new coins show up after checkout", true);

  // Pro: the same checkout with the monthly price; then the plan and its portal
  check("Pro has its own box, naming the renewal", await page.getByRole("button", { name: "Get Pro monthly" }).isDisabled());
  await page.getByLabel(/Pro renews automatically at the price shown until I cancel it/).check();
  await page.getByRole("button", { name: "Get Pro monthly" }).click();
  await page.waitForFunction(() => window.__opened?.items[0].priceId === "pri_pm");
  check("Pro opens the checkout with its price", true);
  account.balance += 100;
  account.pro = { interval: "month", status: "active", renews: true, periodEnd: Date.parse("2026-11-28T00:00:00Z") };
  await page.waitForSelector('[data-testid="pro"] >> text=You have Pro, monthly.', { timeout: 20000 });
  check("once Pro lands, the pricing page shows the plan instead of the offer", true);
  await page.goto(O + "/account");
  await page.waitForSelector("text=You have Pro, monthly.");
  check("the account page says when Pro renews, and at what price", await page.locator("text=/Renews automatically on .* at \\$9 a month/").isVisible());
  await ctx.route("**/api/pay/portal", (r) => r.fulfill({ json: { url: `${O}/terms?portal=1` } }));
  const [tab] = await Promise.all([ctx.waitForEvent("page"), page.getByRole("button", { name: "Cancel or manage Pro" }).click()]);
  await tab.waitForURL(/portal=1/, { timeout: 10000 });
  check("Cancel or manage Pro opens the portal in a new tab", true);
  await ctx.close();
}

check(`no page errors${errors.length ? `: ${errors.join(" | ")}` : ""}`, errors.length === 0);
await browser.close();
console.log("PASS");
