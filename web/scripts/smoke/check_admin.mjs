// Dev-only: the developer console (/admin) in a real browser against mocked
// /api/admin/* (the real handlers are checked by admin.selfcheck.ts and
// e2e_accounts.mjs): the tray's Admin link shows for developers only; each
// tab renders its data; adding testers, removing one and granting coins
// send the right requests; the activity log filters and pages.
import { chromium } from "playwright";

const O = "http://localhost:3000";
const browser = await chromium.launch();
function check(label, ok) {
  console.log(`${ok ? "ok  " : "FAIL"} ${label}`);
  if (!ok) process.exit(1);
}
const errors = [];
const DAY = 864e5;
const now = Date.now();
const day = (i) => new Date(now - (29 - i) * DAY).toISOString().slice(0, 10);

async function signedIn(developer) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addCookies([{ name: "ml_in", value: "1", url: O }]);
  await ctx.route("**/api/me", (r) =>
    r.fulfill({ json: { user: { id: "u-dev", email: "dev@example.org" }, balance: 50, pro: null, paddle: null, access: { approved: true, developer } } }),
  );
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && !/Failed to load resource/.test(m.text()) && errors.push(m.text()));
  return { ctx, page };
}

// --- a tester: no Admin link
{
  const { ctx, page } = await signedIn(false);
  await page.goto(O + "/home", { waitUntil: "networkidle" });
  await page.waitForSelector('a[href="/account"]');
  check("a tester's tray has no Admin link", (await page.locator('nav a[href="/admin"]').count()) === 0);
  await ctx.close();
}

// --- a developer
const { ctx, page } = await signedIn(true);
const sent = [];
await ctx.route("**/api/admin/stats", (r) =>
  r.fulfill({
    json: {
      overview: {
        users: { total: 14, new7: 3 },
        active: { day: 4, week: 9, month: 12 },
        list: { beta: { listed: 20, joined: 11 }, developer: { listed: 1, joined: 1 } },
        requests: { day: 318, errors: 2, refused: 5 },
        ai: { calls: 41, input: 1_250_000, output: 180_000, cost: 4.3 },
        coins: { spent: 212, welcomed: 550, granted: 25 },
      },
      usage: {
        days: Array.from({ length: 30 }, (_, i) => ({ day: day(i), requests: 10 + i, users: i % 5, aiCalls: i % 3, input: 40_000 * (i % 3), output: 6_000 * (i % 3), cost: i === 12 ? null : 0.14 * (i % 3) })),
        routes: [
          { route: "/api/review", calls: 30, input: 1_100_000, output: 150_000, cost: 3.7 },
          { route: "/api/figure", calls: 11, input: 150_000, output: 30_000, cost: 0.6 },
        ],
        people: [{ userId: "u-ann", email: "ann@example.org", calls: 20, input: 700_000, output: 90_000, cost: 2.3 }],
      },
    },
  }),
);
const users = [
  { id: "u-dev", email: "dev@example.org", createdAt: now - 20 * DAY, balance: 50, roles: ["developer"], lastSeen: now - 60_000, aiCalls: 0, input: 0, output: 0, cost: 0 },
  { id: "u-ann", email: "ann@example.org", createdAt: now - 10 * DAY, balance: 12, roles: ["beta"], lastSeen: now - 3_600_000, aiCalls: 20, input: 700_000, output: 90_000, cost: 2.3 },
];
await ctx.route("**/api/admin/users", (r) => {
  if (r.request().method() === "POST") {
    const body = r.request().postDataJSON();
    sent.push(["grant", body]);
    users[1].balance += body.coins;
    return r.fulfill({ json: { balance: users[1].balance } });
  }
  return r.fulfill({ json: { users } });
});
const entries = [
  { email_key: "dev@example.org", email: "dev@example.org", role: "developer", note: "owner", added_at: now - 20 * DAY, user_id: "u-dev" },
  { email_key: "ann@example.org", email: "ann@example.org", role: "beta", note: "lab", added_at: now - 10 * DAY, user_id: "u-ann" },
  { email_key: "bo@example.org", email: "bo@example.org", role: "beta", note: null, added_at: now - 2 * DAY, user_id: null },
];
await ctx.route("**/api/admin/access", (r) => {
  if (r.request().method() === "POST") {
    const body = r.request().postDataJSON();
    sent.push([body.action, body]);
    if (body.action === "add") return r.fulfill({ json: { added: ["cy@example.org"], already: ["ann@example.org"], invalid: ["nope"] } });
    entries.splice(entries.findIndex((e) => e.email_key === body.emailKey && e.role === body.role), 1);
    return r.fulfill({ json: { ok: true } });
  }
  return r.fulfill({ json: { entries } });
});
const asked = [];
await ctx.route("**/api/admin/events**", (r) => {
  const q = new URL(r.request().url()).searchParams;
  asked.push(Object.fromEntries(q));
  const ev = (id, route, status, email, model) => ({ id, at: now - id * 1000, route, method: "POST", status, ms: 120, model, input: model ? 1200 : null, output: model ? 300 : null, userId: email ? "u" : null, email });
  const events = q.get("before") ? [ev(1, "/api/me", 200, "ann@example.org", null)] : [ev(3, "/api/figure", 502, "ann@example.org", null), ev(2, "/api/review", 200, "ann@example.org", "claude-sonnet-5")];
  return r.fulfill({ json: { events, next: q.get("before") ? null : 2 } });
});

await page.goto(O + "/home", { waitUntil: "networkidle" });
await page.waitForSelector('nav a[href="/admin"]');
check("a developer's tray links to the console", true);
await page.click('nav a[href="/admin"]');
await page.waitForURL(/\/admin$/);

// overview
await page.waitForSelector("text=Active, last 24 hours");
const overview = await page.locator("main").innerText();
check("the overview shows users, activity, the lists and the AI cost", ["14", "Active, last 24 hours", "Requests, last 24 hours", "Today (UTC)", "11 of 20", "$4.30", "318"].every((s) => overview.includes(s)));
check("the overview draws the 30 days", (await page.locator('svg[role="img"] rect[data-day]').count()) === 30);

// AI usage
await page.getByRole("tab", { name: "AI usage" }).click();
await page.getByText("/api/review").first().waitFor();
const usage = await page.locator('[role="tabpanel"]').innerText();
check("AI usage lists features and people, with their tokens and cost", usage.includes("ann@example.org") && usage.includes("1,100,000") && usage.includes("$3.70"));

// users, and granting coins
await page.getByRole("tab", { name: "Users" }).click();
await page.waitForSelector("text=ann@example.org");
const row = page.locator("tr", { hasText: "ann@example.org" });
await row.getByRole("button", { name: "Give coins" }).click();
await row.getByLabel("Coins to give").fill("25");
await row.getByRole("button", { name: "Give" }).click();
await row.locator("text=37").waitFor();
check("a grant sends the account and the coins, and shows the new balance", JSON.stringify(sent.at(-1)) === JSON.stringify(["grant", { userId: "u-ann", coins: 25 }]));

// access: add several, and remove one
await page.getByRole("tab", { name: "Access" }).click();
await page.waitForSelector("text=bo@example.org");
check("the access list says who has signed in", (await page.locator("tr", { hasText: "bo@example.org" }).innerText()).includes("Not yet"));
await page.getByLabel("Addresses").fill("cy@example.org, ann@example.org\nnope");
await page.getByLabel("Note").fill("feedback round 1");
await page.getByRole("button", { name: "Add to the beta list" }).click();
await page.waitForSelector("text=Added 1");
check("adding sends every address, the list and the note", JSON.stringify(sent.at(-1)) === JSON.stringify(["add", { action: "add", role: "beta", emails: ["cy@example.org", "ann@example.org", "nope"], note: "feedback round 1" }]));
check("and says what happened to each", (await page.getByText("Not addresses: nope").count()) === 1 && (await page.getByText("Already listed: ann@example.org").count()) === 1);
page.once("dialog", (d) => d.accept());
await page.locator("tr", { hasText: "bo@example.org" }).getByRole("button", { name: "Remove" }).click();
await page.locator("tr", { hasText: "bo@example.org" }).waitFor({ state: "detached" });
check("removing asks first, then sends the address and the list", JSON.stringify(sent.at(-1)) === JSON.stringify(["remove", { action: "remove", role: "beta", emailKey: "bo@example.org" }]));

// activity
await page.getByRole("tab", { name: "Activity" }).click();
await page.getByText("/api/figure").first().waitFor();
await page.getByLabel("Status").selectOption("5");
await page.waitForTimeout(300);
check("filters go to the server", asked.at(-1)?.status === "5");
await page.getByRole("button", { name: "Older" }).click();
await page.getByText("/api/me").first().waitFor();
check("Older fetches the next page", asked.at(-1)?.before === "2" && (await page.getByRole("button", { name: "Older" }).count()) === 0);

check(`no page errors${errors.length ? `: ${errors.join(" | ")}` : ""}`, errors.length === 0);
await ctx.close();
await browser.close();
console.log("PASS");
