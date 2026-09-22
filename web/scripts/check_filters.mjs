// Dev-only: verify the filter controls actually re-rank (not just decorate).
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

// Output dir for screenshots/artifacts this script writes — override with
// SMOKE_OUT, defaults to a gitignored folder next to this script.
const SCRATCH = process.env.SMOKE_OUT ?? new URL("../.smoke/", import.meta.url).pathname;
mkdirSync(SCRATCH, { recursive: true });
const FIXTURE = new URL("./fixtures/test-paper.pdf", import.meta.url).pathname;

const browser = await chromium.launch();
const page = await browser.newPage();
const consoleErrors = [];
page.on("console", (msg) => {
  if (msg.type() === "error") consoleErrors.push(msg.text());
});
page.on("pageerror", (err) => consoleErrors.push(`pageerror: ${err.message}`));

// The tool now lives at /match — the intro overlay fronts the homepage
// ("/") instead, so no need to skip it here.
await page.goto("http://localhost:3000/match");
await page.waitForSelector("text=Find the right journal.");

const [fc] = await Promise.all([
  page.waitForEvent("filechooser"),
  page.click("text=Drop a PDF or DOCX"),
]);
await fc.setFiles(`${FIXTURE}`);
await page.waitForSelector("text=Best matches", { timeout: 30000 });

const unfiltered = await page.locator("[data-testid=results] li").allInnerTexts();
console.log(`unfiltered: ${unfiltered.length} results`);

// Open access only — result count should drop (not every journal is in DOAJ)
await page.getByLabel("Open access (DOAJ) only").check();
await page.waitForTimeout(300);
const oaOnly = await page.locator("[data-testid=results] li").allInnerTexts();
const allShowOA = oaOnly.every((t) => t.includes("Open access (DOAJ)") || t.length === 0);
console.log(`open-access-only: ${oaOnly.length} results, all show OA badge: ${allShowOA}`);
if (oaOnly.length > 0 && !allShowOA) {
  console.log("FAIL: a result without the OA badge appeared under the OA-only filter");
  process.exit(1);
}
if (JSON.stringify(oaOnly) === JSON.stringify(unfiltered)) {
  console.log("SUSPICIOUS: filter produced identical results — may not be applying");
}

// Field filter — pick the first real option and check every result matches
await page.getByLabel("Open access (DOAJ) only").uncheck();
const fieldOptions = await page.locator("select").first().locator("option").allTextContents();
const firstRealField = fieldOptions.find((f) => f !== "All fields");
console.log("testing field filter:", firstRealField);
await page.locator("select").first().selectOption({ label: firstRealField });
await page.waitForTimeout(300);
const fieldFiltered = await page.locator("[data-testid=results] li").allInnerTexts();
const allShowField = fieldFiltered.every((t) => t.includes(firstRealField));
console.log(`field=${firstRealField}: ${fieldFiltered.length} results, all show that field: ${allShowField}`);
if (fieldFiltered.length > 0 && !allShowField) {
  console.log("FAIL: a result with the wrong field appeared under the field filter");
  process.exit(1);
}

console.log("console errors:", consoleErrors.length ? consoleErrors.join("\n") : "(none)");
console.log("PASS");
await browser.close();
