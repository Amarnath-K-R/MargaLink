// Dev-only: verify /figures end to end — upload, dtype-filtered role
// selection, the live payload preview genuinely excluding real values,
// consent, a mocked generation (never a real Anthropic call — that's a
// manual gate, see docs/ARCHITECTURE.md), a real Pyodide-rendered figure,
// and the error path on bad generated code.
//
// First run downloads Pyodide (~30MB, from jsDelivr) into this profile's
// HTTP cache — later runs reuse it. That's why this uses a persistent
// context instead of chromium.launch()'s throwaway one.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const SCRATCH = process.env.SMOKE_OUT ?? new URL("../.smoke/", import.meta.url).pathname;
mkdirSync(SCRATCH, { recursive: true });
const FIXTURE = new URL("./fixtures/test-data.csv", import.meta.url).pathname;
const SENTINEL_STRING = "ZZQQ-SENTINEL-0042";
const SENTINEL_NUMBER = "987654.321";

const context = await chromium.launchPersistentContext(`${SCRATCH}/figures-profile`, {});
const page = context.pages()[0] ?? (await context.newPage());
const consoleErrors = [];
page.on("console", (msg) => {
  if (msg.type() === "error") consoleErrors.push(msg.text());
});
page.on("pageerror", (err) => consoleErrors.push(`pageerror: ${err.message}`));

// Mock the code-gen endpoint — no real Anthropic call, no charge. Verifying
// Claude's actual output is a manual gate (see docs/ARCHITECTURE.md).
const GOOD_CODE = `
counts = df["group"].value_counts()
fig, ax = plt.subplots(figsize=(5, 4))
ax.bar(counts.index.astype(str), counts.values, color="#2c5f6f")
ax.set_xlabel("group")
ax.set_ylabel("count")
`;
const BAD_CODE = 'df["does_not_exist"].plot()';
let nextCode = GOOD_CODE;
await page.route("**/api/figure", (route) =>
  route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ code: nextCode }) })
);

await page.goto("http://localhost:3000/figures");
// The persistent context (see the top comment) keeps Pyodide's HTTP cache
// across runs, which also means localStorage/sessionStorage persist —
// clear those specifically so every run gets a fresh 5-use allowance and
// fresh consent state, without losing the cached ~30MB download.
await page.evaluate(() => {
  localStorage.clear();
  sessionStorage.clear();
});
await page.reload();
await page.waitForSelector("text=Make a figure.");

const [fc] = await Promise.all([page.waitForEvent("filechooser"), page.click("text=Drop a CSV or XLSX")]);
await fc.setFiles(FIXTURE);
await page.waitForSelector("text=Loaded test-data.csv", { timeout: 10000 });

const columnsText = await page.locator("main").innerText();
const expectedColumns = ["subject_id", "group", "treatment_dose", "response_mean", "response_sd", "measured_on"];
const allColumnsPresent = expectedColumns.every((c) => columnsText.includes(c));
console.log("parsed columns render:", allColumnsPresent);
if (!allColumnsPresent) {
  console.log("FAIL: not every expected column name appeared on the page");
  process.exit(1);
}

// bar-error is the default chart type — x/y role dropdowns should already
// be filtered by dtype (CHART_ROLES: x wants categorical/date, y wants numeric).
const xOptions = await page.locator("select").first().locator("option").allTextContents();
const yOptions = await page.locator("select").nth(1).locator("option").allTextContents();
const xOffersOnlyCategoricalOrDate = xOptions.every((o) => !o.includes("(numeric)"));
const yOffersOnlyNumeric = yOptions.every((o) => o === "Choose a column" || o.includes("(numeric)"));
console.log("x role dropdown excludes numeric columns:", xOffersOnlyCategoricalOrDate);
console.log("y role dropdown offers only numeric columns:", yOffersOnlyNumeric);
if (!xOffersOnlyCategoricalOrDate || !yOffersOnlyNumeric) {
  console.log("FAIL: role dropdowns aren't filtered by column dtype");
  process.exit(1);
}

await page.locator("select").first().selectOption("group");
await page.locator("select").nth(1).selectOption("response_mean");
await page.waitForTimeout(200);

// The end-to-end privacy assertion, in a real browser: the exact payload
// shown must contain a real column name and never a real cell value.
const payloadText = await page.locator('[data-testid="figure-payload"]').textContent();
const hasColumnName = payloadText.includes("response_mean");
const excludesSentinelString = !payloadText.includes(SENTINEL_STRING);
const excludesSentinelNumber = !payloadText.includes(SENTINEL_NUMBER);
console.log("payload contains a real column name:", hasColumnName);
console.log("payload excludes the sentinel string value:", excludesSentinelString);
console.log("payload excludes the sentinel numeric value:", excludesSentinelNumber);
if (!hasColumnName || !excludesSentinelString || !excludesSentinelNumber) {
  console.log("FAIL: the on-page payload preview leaked a real cell value, or is missing a real column name");
  process.exit(1);
}

// No request with a body should exist yet — nothing has been sent.
const trackedBodyCalls = await page.locator("text=had a body").count();
console.log("no body-carrying request before Generate:", trackedBodyCalls === 0);

await page.click("text=Generate figure");
await page.waitForSelector('[role="alertdialog"]', { timeout: 5000 });
await page.click("text=Send it and generate");

await page.waitForSelector("text=Show the generated Python code", { timeout: 15000 });
await page.waitForSelector('[data-testid="figure-image"]', { timeout: 60000 });
const downloadLinks = await page.locator("a[download]").count();
console.log("figure rendered with 3 export links:", downloadLinks === 3);
if (downloadLinks !== 3) {
  console.log("FAIL: expected PNG/SVG/PDF download links");
  process.exit(1);
}

// Waits for the Regenerate button to be enabled again (i.e. the previous
// generation fully finished) before it's safe to click it again — the
// button is disabled mid-run, and .click() alone won't wait long enough
// for a real Pyodide execution to settle.
async function waitForRegenerateReady(p) {
  const button = p.getByRole("button", { name: "Regenerate" });
  for (let i = 0; i < 60; i++) {
    if (!(await button.isDisabled().catch(() => true))) return;
    await p.waitForTimeout(500);
  }
  throw new Error("Regenerate button never re-enabled");
}

// Regenerate shouldn't re-show consent — session-scoped, not per-figure.
await page.getByRole("button", { name: "Regenerate" }).click();
await page.waitForTimeout(300); // consent (if any) would appear well before Pyodide finishes re-running
const consentReshown = await page.locator('[role="alertdialog"]').isVisible().catch(() => false);
console.log("consent not re-shown on regenerate:", !consentReshown);
await waitForRegenerateReady(page);

// Negative case: code referencing a column that doesn't exist should
// surface a real Python error next to the still-visible code, with
// Regenerate still available to retry.
nextCode = BAD_CODE;
await page.getByRole("button", { name: "Regenerate" }).click();
await page.waitForSelector("text=KeyError", { timeout: 30000 });
const codeStillVisible = await page.locator("text=Show the generated Python code").isVisible();
const regenerateStillThere = await page.getByRole("button", { name: "Regenerate" }).isVisible();
console.log("KeyError shown for bad code:", true);
console.log("code panel stays visible alongside the error:", codeStillVisible);
console.log("Regenerate still available after a failure:", regenerateStillThere);
if (!codeStillVisible || !regenerateStillThere) {
  console.log("FAIL: error state should keep the code visible and Regenerate available");
  process.exit(1);
}

console.log("console errors:", consoleErrors.length ? consoleErrors.join("\n") : "(none)");
console.log("PASS");
await context.close();
