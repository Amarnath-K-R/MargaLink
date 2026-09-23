// Dev-only: verify /review end to end against a mocked /api/review — upload,
// journal, consent naming the request count, per-pass progress, a forced
// failure on one section surfacing in coverage, Retry healing it, the
// prioritized summary and grounded citations, the network panel listing
// every pass, cancel, and the capacity stop. Never a real Anthropic call —
// that's a manual gate (see docs/ARCHITECTURE.md's review section).
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const SCRATCH = process.env.SMOKE_OUT ?? new URL("../.smoke/", import.meta.url).pathname;
mkdirSync(SCRATCH, { recursive: true });
const FIXTURE = new URL("./fixtures/test-paper.pdf", import.meta.url).pathname;

const browser = await chromium.launch();
const page = await browser.newPage();
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

const firstSentence = (t) => (t.split("\n").map((l) => l.trim()).find((l) => l.length >= 12) ?? t.trim()).split(". ")[0];
let failChunkId = null; // the first extract request's chunk fails until healed
let healed = false;
let slow = false; // makes passes slow enough to cancel mid-run
let extractCount = 0;
let synthCount = 0;
await page.route("**/api/review", async (route) => {
  const req = route.request().postDataJSON();
  if (slow) await new Promise((r) => setTimeout(r, 1500));
  if (req.pass === "extract") {
    extractCount++;
    failChunkId ??= req.chunk.id;
    if (req.chunk.id === failChunkId && !healed) {
      return route.fulfill({ status: 502, contentType: "text/plain", body: "Upstream review request failed (529): overloaded" });
    }
    const q = firstSentence(req.chunk.text);
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        claims: [{ quote: q, measure: `count in ${req.chunk.id}`, values: [{ value: 1, unit: null }] }],
        statisticalReporting: [{ description: `Result reported without a confidence interval in ${req.chunk.title}`, severity: "minor", quote: q }],
        notes: [],
      }),
    });
  }
  synthCount++;
  const ids = req.ledger.slice(0, 2).map((e) => e.id);
  return route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      journalFit: { assessment: "possible", explanation: "Scope overlaps the journal's remit." },
      inconsistencies: ids.length === 2 ? [{ description: "The sample size is stated differently in two places.", claimIds: ids }] : [],
      summary: [{ text: "Reconcile the sample size across sections.", severity: "major", refs: ids }],
      otherObservations: ["Consider adding a limitations paragraph."],
    }),
  });
});

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

const getReview = () => page.getByRole("button", { name: /^Get a standard review by Claude$/ });
await getReview().click();
await page.waitForSelector('[role="alertdialog"]');
check("consent names the request count", /in \d+ short requests/.test(await page.locator('[role="alertdialog"]').innerText()));
await page.click("text=Send it and review");

await page.waitForSelector('[data-testid="review-coverage"]', { timeout: 30000 });
await page.waitForFunction(() => !document.querySelector('[data-testid="review-progress"]'), null, { timeout: 30000 });
const coverage1 = await page.locator('[data-testid="review-coverage"]').innerText();
check("failed section surfaces in coverage", /couldn't be checked \(server error 502/.test(coverage1));
check("synthesis still ran with the failure", synthCount === 1);

healed = true;
const extractsBeforeRetry = extractCount;
await page.getByRole("button", { name: "Retry failed sections" }).click();
await page.waitForFunction(
  () => !/couldn't be checked/.test(document.querySelector('[data-testid="review-coverage"]')?.textContent ?? "x"),
  null,
  { timeout: 30000 }
);
check("retry re-ran only the failed section + synthesis", extractCount === extractsBeforeRetry + 1 && synthCount === 2);

const summary = await page.locator('[data-testid="review-summary"]').innerText();
check("prioritized summary rendered", summary.includes("Reconcile the sample size"));
check("summary items carry grounded citations", (await page.locator('[data-testid="review-summary"] li li').count()) >= 1);
const bodyCalls = await page.locator("text=had a body").count();
check(`network panel lists every pass (${bodyCalls})`, bodyCalls === extractCount + synthCount);
const uses = () => page.evaluate(() => localStorage.getItem("margalink-review-uses"));
check("one device use recorded", (await uses()) === "1");

// Cancel mid-run.
slow = true;
await getReview().click();
await page.click("text=Send it and review");
await page.getByRole("button", { name: "Cancel" }).click();
await page.waitForFunction(() => !document.body.innerText.includes("Reviewing…"), null, { timeout: 10000 });
check("cancel stops the run without counting a use", (await uses()) === "1");
check("a cancelled run can be resumed", await page.getByRole("button", { name: "Resume review" }).isVisible());
slow = false;

// Capacity: a 429 on any pass stops the run and counts nothing.
// A route registered later wins; { times: 1 } unregisters it after one use.
await page.route("**/api/review", (route) => route.fulfill({ status: 429, contentType: "text/plain", body: "Pilot is fully booked for today" }), { times: 1 });
await getReview().click();
await page.click("text=Send it and review");
await page.waitForSelector("text=fully booked", { timeout: 10000 });
await page.waitForFunction(() => !document.body.innerText.includes("Reviewing…"), null, { timeout: 10000 });
check("capacity error stops the run without counting a use", (await uses()) === "1");
check("a fresh run doesn't leave the previous review's results on screen", (await page.locator('[data-testid="review-summary"]').count()) === 0);

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
  const m = (await page.locator('[role="alertdialog"]').innerText()).match(/in (\d+) short requests/);
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
await page.click("text=Send it and review");
await page.waitForSelector('[data-testid="review-summary"]', { timeout: 30000 });
check(`no request carried the excluded section "${excludedTitle}"`, bodies.length > 0 && bodies.every((b) => !b.includes(excludedTitle)));
check("coverage names the exclusion", /excluded by you/.test(await page.locator('[data-testid="review-coverage"]').innerText()));
await page.locator('[data-testid="review-outline"] summary').click({ trial: true }).catch(() => {});
await page.fill("#outline-add-heading", "A heading that is not in this paper");
await page.getByRole("button", { name: "Add heading" }).click();
check("an unknown typed heading is reported", await page.locator("text=Couldn't find").isVisible());

// Editing the outline mid-run discards that run: no "Resume" that would
// replay the old outline (which could include a section just excluded).
slow = true;
await getReview().click();
await page.click("text=Send it and review");
await page.waitForSelector('[data-testid="review-progress"]');
await rows.first().locator("select").selectOption("excluded");
await page.waitForFunction(() => !document.body.innerText.includes("Reviewing…"), null, { timeout: 10000 });
await page.waitForTimeout(300);
check("an outline edit mid-run offers no stale resume", !(await page.getByRole("button", { name: /Resume review|Retry failed sections/ }).isVisible().catch(() => false)));
slow = false;

await page.screenshot({ path: `${SCRATCH}/review-final.png`, fullPage: true });
console.log("console errors:", consoleErrors.length ? consoleErrors.join("\n") : "(none)");
console.log("PASS");
await browser.close();
