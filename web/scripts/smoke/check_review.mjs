// Dev-only: verify /review end to end against a mocked /api/review — upload,
// journal, consent naming the request count, per-pass progress, a forced
// failure on one section surfacing in coverage, Retry healing it, Fix these
// first, every finding once with grounded citations, the same paper on every
// pass, Download, Copy, the report kept across a reload until forgotten,
// cancel, and the capacity
// stop; paying for it (signed in through mock_account.mjs): the price in the
// consent, one charge per review, the ticket on every pass, too few coins;
// and signed out, the sign-in in place of the button. Never a real Anthropic call —
// that's the live check, scripts/eval/review_live.ts.
import { chromium } from "playwright";
import { mkdirSync, readFileSync } from "node:fs";
import { mockAccount } from "./mock_account.mjs";
import { reviewAnswer } from "./mock_review.mjs";

const SCRATCH = process.env.SMOKE_OUT ?? new URL("../../.smoke/", import.meta.url).pathname;
mkdirSync(SCRATCH, { recursive: true });
const FIXTURE = new URL("../fixtures/test-paper.pdf", import.meta.url).pathname;

const browser = await chromium.launch();
const page = await browser.newPage();
const account = await mockAccount(page.context(), { balance: 100 });
const tickets = [];
const consoleErrors = [];
page.on("console", (m) => {
  if (m.type() === "error") consoleErrors.push(m.text());
});
page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));

function check(label, ok) {
  console.log(`${label}:`, ok);
  if (!ok) {
    console.log(`FAIL: ${label}`);
    process.exit(1);
  }
}

let failTarget = null; // the first section pass's target fails until healed
let healed = false;
let slow = false; // makes passes slow enough to cancel mid-run
let sectionCount = 0;
let editorCount = 0;
const papers = [];
await page.route("**/api/review", async (route) => {
  const req = route.request().postDataJSON();
  tickets.push(route.request().headers()["x-review-ticket"]);
  papers.push(JSON.stringify(req.paper));
  if (slow) await new Promise((r) => setTimeout(r, 1500));
  if (req.pass === "section") {
    sectionCount++;
    failTarget ??= req.target;
    if (req.target === failTarget && !healed) return route.fulfill({ status: 502, contentType: "text/plain", body: "Upstream review request failed (529): overloaded" });
  }
  if (req.pass === "editor") editorCount++;
  return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(reviewAnswer(req)) });
});
await page.context().grantPermissions(["clipboard-read", "clipboard-write"], { origin: "http://localhost:3000" });

await page.goto("http://localhost:3000/review");
await page.evaluate(() => {
  localStorage.clear();
  sessionStorage.clear();
});
await page.reload();
await page.waitForSelector("text=Get it reviewed.");

const [fc] = await Promise.all([page.waitForEvent("filechooser"), page.click("text=Drop a PDF or DOCX")]);
await fc.setFiles(FIXTURE);
await page.waitForSelector("text=Loaded test-paper.pdf", { timeout: 15000 });
await page.getByRole("button", { name: /^JAMA/ }).click();

const getReview = () => page.getByRole("button", { name: /^Get a standard review by Claude \d+ M coins$/ });
await getReview().click();
await page.waitForSelector('[role="alertdialog"]');
check("consent names the request count", /in \d+ (?:short )?requests/.test(await page.locator('[role="alertdialog"]').innerText()));
const priceLine = await page.locator('[data-testid="review-price"]').innerText();
const price = Number(priceLine.match(/costs (\d+) M coins/)?.[1]);
check(`consent names the price and the balance (${priceLine})`, price > 0 && /you have 100\b/.test(priceLine));
await page.getByLabel(/I agree to send this text to Anthropic/).check();
await page.click("text=Send it and review");

await page.waitForSelector('[data-testid="review-coverage"]', { timeout: 30000 });
await page.waitForFunction(() => !document.querySelector('[data-testid="review-progress"]'), null, { timeout: 30000 });
const coverage1 = await page.locator('[data-testid="review-coverage"]').innerText();
check("failed section surfaces in coverage", /couldn't be checked \(Claude didn't answer/.test(coverage1));
check("the report was still put together with the failure", editorCount === 1);

healed = true;
const sectionsBeforeRetry = sectionCount;
await page.getByRole("button", { name: "Retry failed sections" }).click();
// The retry shows progress at once (the failed section reads "not reviewed yet"), so wait for its editor pass and the end of the run.
for (let i = 0; i < 300 && editorCount < 2; i++) await page.waitForTimeout(100);
await page.waitForFunction(() => !document.querySelector('[data-testid="review-progress"]'), null, { timeout: 30000 });
check("the healed section no longer reads as failed", !/couldn't be checked/.test(await page.locator('[data-testid="review-coverage"]').innerText()));
check("retry re-ran only the failed section + the editor", sectionCount === sectionsBeforeRetry + 1 && editorCount === 2);

const fixFirst = await page.locator('[data-testid="review-fix-first"]').innerText();
check("Fix these first rendered", /has no confidence interval/.test(fixFirst));
check("findings carry grounded citations", (await page.locator('[data-testid="review-sections"] [data-finding] li').count()) >= 1);
const titles = await page.locator("[data-finding] > p:first-child > span:last-child").allInnerTexts();
check(`every finding shows once (${titles.length})`, titles.length > 0 && new Set(titles).size === titles.length);
check("every pass carried the same paper", papers.length > 0 && papers.every((p) => p === papers[0]));
check("paid once, and retrying cost nothing more", account.starts.length === 1 && account.balance === 100 - price);
check("every pass carried the ticket", tickets.length > 0 && tickets.every((t) => t === "ticket-1"));
check("the start sent section ids and lengths, never text", account.starts[0].chunks.every((c) => Object.keys(c).join() === "id,chars,review"));
check("the tray shows the new balance", (await page.locator('a[href="/account"]').first().getAttribute("aria-label")).startsWith(`${100 - price} M coins`));

// A priority takes you to its finding; the report can be downloaded and copied; it survives a reload until forgotten.
await page.locator('[data-testid="review-fix-first"] button').first().click();
check("a priority takes you to its finding", await page.evaluate(() => !!document.activeElement?.getAttribute("data-finding")));
const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download" }).click()]);
const md = readFileSync(await dl.path(), "utf8");
check(`Download gives the Markdown report (${dl.suggestedFilename()})`, dl.suggestedFilename().endsWith(".md") && md.includes("## Section by section"));
await page.getByRole("button", { name: "Copy" }).click();
check("Copy puts the report on the clipboard", (await page.evaluate(() => navigator.clipboard.readText())).startsWith("# Pre-submission review"));
await page.reload();
await page.waitForSelector('[data-testid="review-kept"]', { timeout: 10000 });
check("the report survives a reload", await page.locator('[data-testid="review-kept"] [data-testid="review-fix-first"]').isVisible());
await page.getByRole("button", { name: "Forget this report" }).click();
check("Forget removes it", (await page.locator('[data-testid="review-kept"]').count()) === 0);
await page.reload();
await page.waitForSelector("text=Get it reviewed.");
check("and it stays forgotten", (await page.locator('[data-testid="review-kept"]').count()) === 0);
const [fc2] = await Promise.all([page.waitForEvent("filechooser"), page.click("text=Drop a PDF or DOCX")]);
await fc2.setFiles(FIXTURE);
await page.waitForSelector("text=Loaded test-paper.pdf", { timeout: 15000 });
await page.getByRole("button", { name: /^JAMA/ }).click();

// Cancel mid-run.
slow = true;
await getReview().click();
await page.getByLabel(/I agree to send this text to Anthropic/).check();
await page.click("text=Send it and review");
await page.getByRole("button", { name: "Cancel" }).click();
await page.waitForFunction(() => !document.body.innerText.includes("Reviewing…"), null, { timeout: 10000 });
check("a new run is charged once", account.starts.length === 2);
check("a cancelled run can be resumed", await page.getByRole("button", { name: "Resume review" }).isVisible());
slow = false;

// Capacity: a 429 on any pass stops the run (its coins come back when the ticket expires).
// A route registered later wins; { times: 1 } unregisters it after one use.
await page.route("**/api/review", (route) => route.fulfill({ status: 429, contentType: "text/plain", body: "Pilot is fully booked for today" }), { times: 1 });
await getReview().click();
await page.getByLabel(/I agree to send this text to Anthropic/).check();
await page.click("text=Send it and review");
await page.waitForSelector("text=fully booked", { timeout: 10000 });
await page.waitForFunction(() => !document.body.innerText.includes("Reviewing…"), null, { timeout: 10000 });
check("capacity error stops the run", !(await page.locator('[data-testid="review-progress"]').isVisible()));
check("a stopped fresh run shows the earlier review only as the last one", (await page.locator('[data-testid="review-report"]').count()) === (await page.locator('[data-testid="review-kept"] [data-testid="review-report"]').count()));

// Outline: visible, a section marked "Don't send" lowers the request count and its text is never sent.
const bodies = [];
page.on("request", (r) => {
  if (r.url().includes("/api/review") && r.method() === "POST") bodies.push(r.postData() ?? "");
});
await page.locator('[data-testid="review-outline"] summary').click();
const rows = page.locator('[data-testid="review-outline"] li');
check("outline lists the paper's sections", (await rows.count()) >= 3);
const countIn = async () => {
  await getReview().click();
  const m = (await page.locator('[role="alertdialog"]').innerText()).match(/in (\d+) (?:short )?requests/);
  return Number(m?.[1]);
};
const before = await countIn();
await page.getByRole("button", { name: "Cancel" }).last().click(); // close the consent box
const lastRow = rows.last();
const excludedTitle = (await lastRow.locator("span").first().innerText()).split("\n")[0].replace(/\s*[\d,]+ words.*$/, "").trim();
await lastRow.locator("select").selectOption("excluded");
const after = await countIn();
check(`excluding a section lowers the request count (${before} → ${after})`, after === before - 1);
check("consent says the excluded section won't be sent", /won't be sent at all/.test(await page.locator('[role="alertdialog"]').innerText()));
await page.getByLabel(/I agree to send this text to Anthropic/).check();
await page.click("text=Send it and review");
await page.waitForSelector('[data-testid="review-fix-first"]', { timeout: 30000 });
check(`no request carried the excluded section "${excludedTitle}"`, bodies.length > 0 && bodies.every((b) => !b.includes(excludedTitle)));
check("coverage names the exclusion", /excluded by you/.test(await page.locator('[data-testid="review-coverage"]').innerText()));
await page.locator('[data-testid="review-outline"] summary').click({ trial: true }).catch(() => {});
await page.fill("#outline-add-heading", "A heading that is not in this paper");
await page.getByRole("button", { name: "Add heading" }).click();
check("an unknown typed heading is reported", await page.locator("text=Couldn't find").isVisible());

// Mid-run, the outline and the tier are locked: changing either would throw
// away a run that's already paid for. The run goes on to its result.
slow = true;
await getReview().click();
await page.getByLabel(/I agree to send this text to Anthropic/).check();
await page.click("text=Send it and review");
await page.waitForSelector('[data-testid="review-progress"]');
check("the outline is locked while a review runs", await rows.first().locator("select").isDisabled());
check("and so is the tier", (await page.locator("fieldset[disabled] button").count()) > 0);
await page.waitForFunction(() => !document.body.innerText.includes("Reviewing…"), null, { timeout: 30000 });
check("the run finishes with its result", await page.locator('[data-testid="review-fix-first"]').isVisible());
check("and the outline unlocks", await rows.first().locator("select").isEnabled());
slow = false;

// Signed out mid-run (a session that expired): the run stops, and resuming it later isn't charged again.
let signedOutOnce = true;
await page.route("**/api/review", async (route) => {
  if (signedOutOnce && route.request().postDataJSON().pass === "section") {
    signedOutOnce = false;
    return route.fulfill({ status: 401, contentType: "text/plain", body: "Sign in to get a review." });
  }
  return route.fallback();
});
const startsBefore = account.starts.length;
await getReview().click();
await page.getByLabel(/I agree to send this text to Anthropic/).check();
await page.click("text=Send it and review");
await page.waitForSelector("text=Sign in to get a review.", { timeout: 10000 });
await page.waitForFunction(() => !document.body.innerText.includes("Reviewing…"), null, { timeout: 10000 });
check("a run stopped by an expired sign-in can be resumed", await page.getByRole("button", { name: "Resume review" }).isVisible());
await page.getByRole("button", { name: "Resume review" }).click();
await page.waitForSelector('[data-testid="review-fix-first"]', { timeout: 30000 });
check("and resuming it wasn't charged again", account.starts.length === startsBefore + 1);

// Too few coins: the server says 402, the page says how many and won't send.
account.balance = 0;
await getReview().click();
await page.getByLabel(/I agree to send this text to Anthropic/).check();
await page.click("text=Send it and review");
await page.waitForSelector("text=you have 0", { timeout: 10000 });
await getReview().click();
check("with too few coins, the consent won't send", await page.getByRole("button", { name: /^Send it and review/ }).isDisabled());
check("and says how many more are needed", /You need \d+ more M coins? for this review/.test(await page.locator('[role="alertdialog"]').innerText()));
await page.getByRole("button", { name: "Cancel" }).last().click();

await page.screenshot({ path: `${SCRATCH}/review-final.png`, fullPage: true });

// Signed out: no account request at all, and the button signs you in in place.
{
  const ctx = await browser.newContext();
  const out = await ctx.newPage();
  const me = [];
  out.on("request", (r) => r.url().includes("/api/me") && me.push(r.url()));
  await out.goto("http://localhost:3000/review");
  const [chooser] = await Promise.all([out.waitForEvent("filechooser"), out.click("text=Drop a PDF or DOCX")]);
  await chooser.setFiles(FIXTURE);
  await out.waitForSelector("text=Loaded test-paper.pdf", { timeout: 15000 });
  await out.getByRole("button", { name: /^JAMA/ }).click();
  await out.getByRole("button", { name: "Sign in to get a review" }).click();
  check("signed out, the review button opens sign-in in place", await out.getByRole("button", { name: "Continue with Google" }).isVisible());
  check("signed out, the paper is still loaded", await out.locator("text=Loaded test-paper.pdf").isVisible());
  check("signed out, no /api/me request was made", me.length === 0);
  await ctx.close();
}
console.log("console errors:", consoleErrors.length ? consoleErrors.join("\n") : "(none)");
console.log("PASS");
await browser.close();
