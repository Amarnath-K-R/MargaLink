// Dev-only: the account Functions for real, end to end. Serves the static
// build (run `npm run build` first) with `wrangler pages dev` on a fresh
// local D1, then, in a browser: signs in with an email link read from the
// dev log (DEV_EMAIL_LOG=1), buys a pack through a signed Paddle webhook,
// pays for a review through the real /api/review/start (the passes
// themselves are mocked in the browser, so Claude is never called), meets a
// 402 when a review costs more than the balance, and signs out; plus the
// cross-site guard and an unsigned webhook, from outside the browser. And the
// closed beta: the page gate, an uninvited address getting nothing, the
// invited one's coins, the console refused to a tester and opened to a
// developer (the lists are edited with `d1 execute --local`).
//   node scripts/e2e/e2e_accounts.mjs
import { chromium } from "playwright";
import { spawn, execFileSync } from "node:child_process";
import { createHmac } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { JOURNAL_RULES } from "../../src/lib/journals/journalRules.ts";
import { WELCOME_COINS } from "../../src/lib/accounts/coins.ts";

const PORT = 8790;
const O = `http://localhost:${PORT}`;
const SECRET = "e2e_webhook_secret";
const PRICES = JSON.stringify({ S: "pri_e2e_s", M: "pri_e2e_m", L: "pri_e2e_l", PRO_MONTH: "pri_e2e_pm", PRO_YEAR: "pri_e2e_py" });
const WEB = new URL("../..", import.meta.url).pathname;
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

const sql = (command) => JSON.parse(execFileSync("npx", ["wrangler", "d1", "execute", "margalink", "--local", "--persist-to", state, "--json", "--command", command], { cwd: WEB, encoding: "utf8" }))[0].results;
const signInLink = async (since) => {
  for (let i = 0; i < 20; i++) {
    const found = log.slice(since).match(/sign-in link: (http:\/\/localhost:\d+\/signin\/verify#t=[\w-]+)/)?.[1];
    if (found) return found;
    await new Promise((r) => setTimeout(r, 250));
  }
  return null;
};

try {
  // the page gate, signed out: the dashboard and tools redirect, their payloads 401; the landing and the legal pages stay static
  const home = await fetch(`${O}/home`, { redirect: "manual" });
  check("signed out, /home goes to sign-in", home.status === 302 && home.headers.get("location") === "/signin?next=%2Fhome");
  check("and its payload is a 401", (await fetch(`${O}/home.txt`)).status === 401);
  check("so is a journal page's", (await fetch(`${O}/journal/x`, { redirect: "manual" })).status === 302);
  const landing = await fetch(`${O}/`);
  check("the landing page is public, with its CSP", landing.status === 200 && /frame-ancestors 'none'/.test(landing.headers.get("content-security-policy") ?? ""));
  check("so are the privacy notice and sign-in", (await fetch(`${O}/privacy`)).status === 200 && (await fetch(`${O}/signin`)).status === 200);
  const worker = await fetch(`${O}/figureWorker.mjs`);
  check("the figure worker keeps its own, stricter CSP (it never passes through a Function)", worker.status === 200 && /(^|, )default-src 'none'/.test(worker.headers.get("content-security-policy") ?? ""));
  // other spellings of a gated page: never the page itself (a redirect or a 404 is fine)
  const spellings = ["/HOME", "/Home/", "/home.html", "/journal/S100014455.html", "/h%6Fme", "//home", "/home.txt/"];
  const served = [];
  for (const p of spellings) {
    const r = await fetch(`${O}${p}`, { redirect: "manual" });
    if (r.status === 200) served.push(p);
  }
  check(`no other spelling serves a gated page signed out${served.length ? `: ${served.join(", ")}` : ""}`, served.length === 0);

  // outside the browser: the cross-site guard and an unsigned webhook
  const cross = await fetch(`${O}/api/auth/logout`, { method: "POST", headers: { origin: "https://evil.example" } });
  check("a cross-site POST is refused", cross.status === 403);
  const unsigned = await fetch(`${O}/api/pay/webhook`, { method: "POST", body: "{}", headers: { "paddle-signature": "ts=1;h1=00" } });
  check("an unsigned webhook is refused", unsigned.status === 401);

  browser = await chromium.launch();
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  // the landing page prefetches the gated pages it links to; each answer is a 401, and none is asked for over and over
  const prefetched = new Map();
  page.on("request", (r) => {
    const path = new URL(r.url()).pathname;
    if (/^\/(home|match|journals|journal|review|figures|write|guide|architecture|account|pricing|admin)\b/.test(path)) prefetched.set(path, (prefetched.get(path) ?? 0) + 1);
  });
  await page.goto(`${O}/`, { waitUntil: "networkidle" });
  await page.waitForTimeout(5000);
  const most = Math.max(0, ...prefetched.values());
  console.log(`     landing page: ${prefetched.size} gated paths asked for, at most ${most} times each`);
  check("the landing page doesn't retry gated prefetches", most <= 2);
  page.removeAllListeners("request");

  // a client-side link into the gate (the tray's Home, from a public page): its payload's 401 makes the router load the page, which redirects
  await page.goto(`${O}/privacy`);
  await page.locator('nav a[href="/home"]').click();
  await page.waitForURL(/\/signin\?next=%2Fhome$/, { timeout: 15000 });
  check("signed out, a link into the tools lands on sign-in", true);

  // an email link (the beta hides the form, so it's asked for from the page): nothing for an uninvited address
  await page.goto(`${O}/signin?next=/review`);
  await page.waitForSelector("text=Open to invited beta testers");
  const askLink = () =>
    page.evaluate(() =>
      fetch("/api/auth/email/request", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "e2e@example.org", next: "/review", agree: true }) }).then((r) => r.status),
    );
  let mark = log.length;
  check("an uninvited address gets the usual answer", (await askLink()) === 200);
  check("but no link, and no account", !(await signInLink(mark)) && sql("SELECT COUNT(*) AS n FROM users")[0].n === 0);
  sql("INSERT INTO access_list (email_key, email, role, added_at) VALUES ('e2e@example.org', 'e2e@example.org', 'beta', 0)");
  mark = log.length;
  check("once invited, the link is sent", (await askLink()) === 200);
  const link = await signInLink(mark);
  check("the sign-in link was written to the dev log", !!link);
  await page.goto(link);
  await page.locator(".sheet button", { hasText: "Sign in" }).click();
  await page.waitForSelector("text=You're signed in as e2e@example.org");
  const me = await page.evaluate(() => fetch("/api/me").then((r) => r.json()));
  check(`the new account has the beta's ${WELCOME_COINS} coins`, me.user?.email === "e2e@example.org" && me.balance === WELCOME_COINS && me.access?.approved === true && me.access?.developer === false);

  // a tester: the tools, with their security headers; not the console
  const tool = await page.goto(`${O}/review`);
  check("a tester opens the tools, which carry the CSP and aren't cached shared", /frame-ancestors 'none'/.test(tool.headers()["content-security-policy"] ?? "") && tool.headers()["cache-control"] === "private, no-cache");
  await page.evaluate(() => (window.__stayed = true));
  await page.locator('nav a[href="/match"]').click();
  await page.waitForURL(/\/match$/);
  check("and moves between them without reloading (payloads pass the gate)", await page.evaluate(() => window.__stayed === true));
  await page.goto(`${O}/admin`);
  check("but not the console page", new URL(page.url()).pathname === "/home");
  check("nor its API", (await page.evaluate(() => fetch("/api/admin/stats").then((r) => r.status))) === 403);
  // taken off the list (still signed in): the AI features refuse, however the path is spelled
  sql("DELETE FROM access_list WHERE email_key = 'e2e@example.org'");
  const aiVariants = await page.evaluate(() =>
    Promise.all(["/api/figure", "/api/Figure", "/api/figure/", "/api/Review/start", "/api/review/start/"].map((p) => fetch(p, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }).then((r) => `${p} ${r.status}`))),
  );
  check(`off the list, every spelling of the AI routes is refused (${aiVariants.join(", ")})`, aiVariants.every((v) => v.endsWith(" 403")));
  sql("INSERT INTO access_list (email_key, email, role, added_at) VALUES ('e2e@example.org', 'e2e@example.org', 'beta', 0)");
  check("and gets Paddle's public config, never a secret", me.paddle?.token === "test_e2e" && !JSON.stringify(me).includes(SECRET));

  // a pack, through a signed webhook
  const event = {
    event_id: "evt_e2e_1",
    event_type: "transaction.completed",
    occurred_at: new Date().toISOString(),
    data: { id: "txn_e2e_1", status: "completed", customer_id: "ctm_e2e", subscription_id: null, currency_code: "USD", custom_data: { user_id: me.user.id, sig: me.paddle.checkout }, items: [{ price: { id: "pri_e2e_s" } }], details: { totals: { total: "600" } } },
  };
  const raw = JSON.stringify(event);
  const ts = Math.floor(Date.now() / 1000);
  const sig = `ts=${ts};h1=${createHmac("sha256", SECRET).update(`${ts}:${raw}`).digest("hex")}`;
  for (let i = 0; i < 2; i++) {
    const r = await fetch(`${O}/api/pay/webhook`, { method: "POST", body: raw, headers: { "paddle-signature": sig } });
    check(`the webhook is acknowledged (delivery ${i + 1})`, r.status === 200);
  }
  const afterPack = await page.evaluate(() => fetch("/api/me").then((r) => r.json()));
  check("the pack's coins arrived once", afterPack.balance === WELCOME_COINS + 50);

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
  await chooser.setFiles(new URL("../fixtures/test-paper.pdf", import.meta.url).pathname);
  await page.waitForSelector("text=Loaded test-paper.pdf", { timeout: 20000 });
  await page.getByRole("button", { name: /^JAMA/ }).click();
  await page.getByRole("button", { name: /^Get a standard review by Claude \d+ M coins$/ }).click();
  const price = Number((await page.locator('[data-testid="review-price"]').innerText()).match(/costs (\d+) M coins/)?.[1]);
  await page.getByLabel(/I agree to send this text to Anthropic/).check();
  await page.click("text=Send it and review");
  await page.waitForSelector('[data-testid="review-summary"], [data-testid="review-coverage"]', { timeout: 30000 });
  await page.waitForFunction(() => !document.querySelector('[data-testid="review-progress"]'), null, { timeout: 30000 });
  const afterReview = await page.evaluate(() => fetch("/api/me").then((r) => r.json()));
  check(`the review cost its price (${price})`, price > 0 && afterReview.balance === WELCOME_COINS + 50 - price);
  check("every pass carried the same real ticket", tickets.length > 1 && tickets.every((t) => t && t === tickets[0] && t.length >= 40));

  // more than the balance: 402 with the price and balance, nothing taken
  const big = await page.evaluate(async (journalId) => {
    const chunks = Array.from({ length: 60 }, (_, i) => ({ id: `s${i + 1}`, chars: 24000 })); // the most sections a review may have (MAX_REVIEW_CHUNKS)
    const r = await fetch("/api/review/start", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tier: "thorough", journalId, chunks }) });
    return { status: r.status, body: await r.json() };
  }, JOURNAL_ID);
  check(`a review costing more than the balance is refused (${big.status})`, big.status === 402 && big.body.balance === afterReview.balance && big.body.coins > big.body.balance);

  // a paid review that never ran: once its ticket expires, the sweep (real D1, json_each) refunds all of it
const unused = await page.evaluate(async (journalId) => {
    const r = await fetch("/api/review/start", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tier: "quick", journalId, chunks: [{ id: "s1", chars: 1000 }, { id: "s2", chars: 1000 }] }) });
    return r.json();
  }, JOURNAL_ID);
  check("an unused review was charged", unused.balance === afterReview.balance - unused.coins);
  execFileSync("npx", ["wrangler", "d1", "execute", "margalink", "--local", "--persist-to", state, "--command", "UPDATE review_tickets SET expires_at = 0"], { cwd: WEB, stdio: "ignore" });
  const swept = await page.evaluate(() => fetch("/api/me").then((r) => r.json()));
  // Both tickets expired: the unused one, and the first review's, whose passes were mocked
  // in the browser, so the server never saw a part delivered. Each is refunded in full.
  check(`expiry refunds what wasn't delivered (${swept.balance})`, swept.balance === afterReview.balance + price);

  // a developer: the console, its figures, a grant, and never the last developer removed
  sql("INSERT INTO access_list (email_key, email, role, added_at) VALUES ('e2e@example.org', 'e2e@example.org', 'developer', 0)");
  await page.goto(`${O}/admin`);
  await page.waitForSelector("text=Active, last 24 hours");
  check("a developer opens the console", new URL(page.url()).pathname === "/admin");
  const stats = await page.evaluate(() => fetch("/api/admin/stats").then((r) => r.json()));
  check("whose figures come from the log", stats.overview.users.total === 1 && stats.overview.requests.day > 5 && stats.overview.list.developer.listed === 1);
  const post = (path, body) => page.evaluate(([p, b]) => fetch(p, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) }).then(async (r) => ({ status: r.status, body: await r.text() })), [path, body]);
  const granted = await post("/api/admin/users", { userId: me.user.id, coins: 5 });
  check("a developer can give coins", granted.status === 200 && JSON.parse(granted.body).balance === swept.balance + 5);
  check("the last developer can't be removed", (await post("/api/admin/access", { action: "remove", role: "developer", emailKey: "e2e@example.org" })).status === 409);
  const rows = sql("SELECT COUNT(*) AS n, SUM(user_id IS NOT NULL) AS mine, SUM(instr(route, '?') > 0) AS queries FROM api_events")[0];
  check(`the activity log has the requests (${rows.n}), by account, without queries`, rows.n > 10 && rows.mine > 5 && rows.queries === 0);

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
