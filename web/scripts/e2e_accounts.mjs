// Dev-only: the account Functions for real, end to end. Serves the static
// build (run `npm run build` first) with `wrangler pages dev` on a fresh
// local D1, then, in a browser: signs in with an email link read from the
// dev log (DEV_EMAIL_LOG=1), buys a pack through a signed Paddle webhook,
// pays for a review through the real /api/review/start (the passes
// themselves are mocked in the browser, so Claude is never called), meets a
// 402 when a review costs more than the balance, and signs out; plus the
// cross-site guard and an unsigned webhook, from outside the browser.
//   node scripts/e2e_accounts.mjs
import { chromium } from "playwright";
import { spawn, execFileSync } from "node:child_process";
import { createHmac } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { JOURNAL_RULES } from "../src/lib/journalRules.ts";

const PORT = 8790;
const O = `http://localhost:${PORT}`;
const SECRET = "e2e_webhook_secret";
const PRICES = JSON.stringify({ S: "pri_e2e_s", M: "pri_e2e_m", L: "pri_e2e_l", PRO_MONTH: "pri_e2e_pm", PRO_YEAR: "pri_e2e_py" });
const WEB = new URL("..", import.meta.url).pathname;
const JOURNAL_ID = JOURNAL_RULES.find((j) => j.journalName.startsWith("JAMA")).journalId;
const state = mkdtempSync(join(tmpdir(), "margalink-e2e-"));

function check(label, ok) {
  console.log(`${ok ? "ok  " : "FAIL"} ${label}`);
  if (!ok) finish(1);
}
let server;
let browser;
async function finish(code) {
  await browser?.close().catch(() => {});
  server?.kill();
  rmSync(state, { recursive: true, force: true });
  process.exit(code);
}

// A fresh local database, then the real Functions over the static build.
execFileSync("npx", ["wrangler", "d1", "migrations", "apply", "margalink", "--local", "--persist-to", state], { cwd: WEB, stdio: "ignore" });
let log = "";
server = spawn(
  "npx",
  ["wrangler", "pages", "dev", "out", "--port", String(PORT), "--persist-to", state, "--binding", "DEV_EMAIL_LOG=1", "--binding", `PADDLE_WEBHOOK_SECRET=${SECRET}`, "--binding", `PADDLE_PRICE_IDS=${PRICES}`, "--binding", "PADDLE_CLIENT_TOKEN=test_e2e"],
  { cwd: WEB },
);
server.stdout.on("data", (d) => (log += d));
server.stderr.on("data", (d) => (log += d));
for (let i = 0; i < 60; i++) {
  if (await fetch(`${O}/`).then((r) => r.ok).catch(() => false)) break;
  await new Promise((r) => setTimeout(r, 1000));
}

try {
  // outside the browser: the cross-site guard and an unsigned webhook
  const cross = await fetch(`${O}/api/auth/logout`, { method: "POST", headers: { origin: "https://evil.example" } });
  check("a cross-site POST is refused", cross.status === 403);
  const unsigned = await fetch(`${O}/api/pay/webhook`, { method: "POST", body: "{}", headers: { "paddle-signature": "ts=1;h1=00" } });
  check("an unsigned webhook is refused", unsigned.status === 401);

  browser = await chromium.launch();
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  // sign in with an email link, read from the dev log
  await page.goto(`${O}/signin?next=/review`);
  await page.fill("#signin-email", "e2e@example.org");
  await page.click("text=Send the link");
  await page.waitForSelector("text=Check your email");
  let link = null;
  for (let i = 0; i < 20 && !link; i++) {
    link = log.match(/sign-in link: (http:\/\/localhost:\d+\/signin\/verify#t=[\w-]+)/)?.[1] ?? null;
    if (!link) await new Promise((r) => setTimeout(r, 250));
  }
  check("the sign-in link was written to the dev log", !!link);
  await page.goto(link);
  await page.locator(".sheet button", { hasText: "Sign in" }).click();
  await page.waitForSelector("text=You're signed in as e2e@example.org");
  const me = await page.evaluate(() => fetch("/api/me").then((r) => r.json()));
  check("the new account has the welcome coins", me.user?.email === "e2e@example.org" && me.balance === 10);
  check("and gets Paddle's public config, never a secret", me.paddle?.token === "test_e2e" && !JSON.stringify(me).includes(SECRET));

  // a pack, through a signed webhook
  const event = {
    event_id: "evt_e2e_1",
    event_type: "transaction.completed",
    occurred_at: new Date().toISOString(),
    data: { id: "txn_e2e_1", status: "completed", customer_id: "ctm_e2e", subscription_id: null, currency_code: "USD", custom_data: { user_id: me.user.id }, items: [{ price: { id: "pri_e2e_s" } }], details: { totals: { total: "600" } } },
  };
  const raw = JSON.stringify(event);
  const ts = Math.floor(Date.now() / 1000);
  const sig = `ts=${ts};h1=${createHmac("sha256", SECRET).update(`${ts}:${raw}`).digest("hex")}`;
  for (let i = 0; i < 2; i++) {
    const r = await fetch(`${O}/api/pay/webhook`, { method: "POST", body: raw, headers: { "paddle-signature": sig } });
    check(`the webhook is acknowledged (delivery ${i + 1})`, r.status === 200);
  }
  const afterPack = await page.evaluate(() => fetch("/api/me").then((r) => r.json()));
  check("the pack's coins arrived once", afterPack.balance === 60);

  // a paid review: the real start (charge + ticket), the passes mocked in the browser
  const tickets = [];
  await page.route("**/api/review", async (route) => {
    tickets.push(route.request().headers()["x-review-ticket"]);
    const req = route.request().postDataJSON();
    if (req.pass === "extract") return route.fulfill({ json: { claims: [], statisticalReporting: [], notes: [] } });
    return route.fulfill({ json: { journalFit: { assessment: "possible", explanation: "Fits." }, inconsistencies: [], summary: [], otherObservations: [] } });
  });
  await page.goto(`${O}/review`);
  const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.click("text=Drop a PDF or DOCX")]);
  await chooser.setFiles(new URL("./fixtures/test-paper.pdf", import.meta.url).pathname);
  await page.waitForSelector("text=Loaded test-paper.pdf", { timeout: 20000 });
  await page.getByRole("button", { name: /^JAMA/ }).click();
  await page.getByRole("button", { name: /^Get a standard review by Claude \d+ M coins$/ }).click();
  const price = Number((await page.locator('[data-testid="review-price"]').innerText()).match(/costs (\d+) M coins/)?.[1]);
  await page.click("text=Send it and review");
  await page.waitForSelector('[data-testid="review-summary"], [data-testid="review-coverage"]', { timeout: 30000 });
  await page.waitForFunction(() => !document.querySelector('[data-testid="review-progress"]'), null, { timeout: 30000 });
  const afterReview = await page.evaluate(() => fetch("/api/me").then((r) => r.json()));
  check(`the review cost its price (${price})`, price > 0 && afterReview.balance === 60 - price);
  check("every pass carried the same real ticket", tickets.length > 1 && tickets.every((t) => t && t === tickets[0] && t.length >= 40));

  // more than the balance: 402 with the price and balance, nothing taken
  const big = await page.evaluate(async (journalId) => {
    const chunks = Array.from({ length: 200 }, (_, i) => ({ id: `s${i + 1}`, chars: 24000 }));
    const r = await fetch("/api/review/start", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tier: "thorough", journalId, chunks }) });
    return { status: r.status, body: await r.json() };
  }, JOURNAL_ID);
  check(`a review costing more than the balance is refused (${big.status})`, big.status === 402 && big.body.balance === afterReview.balance && big.body.coins > big.body.balance);

  // sign out
  await page.evaluate(() => fetch("/api/auth/logout", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }));
  const out = await page.evaluate(() => fetch("/api/me").then((r) => r.json()));
  check("signed out", out.user === null);
  const hint = (await ctx.cookies()).find((c) => c.name === "ml_in");
  check("the hint cookie is gone", !hint || hint.value === "");
  console.log("PASS");
  await finish(0);
} catch (err) {
  console.log(err);
  console.log(log.slice(-2000));
  await finish(1);
}
