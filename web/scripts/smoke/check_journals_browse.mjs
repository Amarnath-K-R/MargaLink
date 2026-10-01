// Dev-only: verify the /journals browse page works and doesn't pull the
// (unnecessary here) embedding vector file.
import { chromium } from "playwright";

const browser = await chromium.launch();
const page = await browser.newPage();
const consoleErrors = [];
page.on("console", (msg) => {
  if (msg.type() === "error") consoleErrors.push(msg.text());
});
page.on("pageerror", (err) => consoleErrors.push(`pageerror: ${err.message}`));

const requests = [];
page.on("request", (req) => requests.push(req.url()));

await page.goto("http://localhost:3000/journals");
await page.waitForSelector("text=Browse journals");
await page.waitForFunction(() => document.body.innerText.includes("journals in this build"));

const initialCount = await page.locator("ol > li").count();
console.log("initial list count (capped at 100):", initialCount);

// Search narrows results
await page.fill('input[placeholder*="Nature"]', "IEEE");
await page.waitForTimeout(200);
const searchResults = await page.locator("ol > li").allInnerTexts();
console.log(`search "IEEE": ${searchResults.length} results`);
const allMatch = searchResults.every((t) => t.toLowerCase().includes("ieee"));
console.log("all results contain 'IEEE':", allMatch);
if (searchResults.length > 0 && !allMatch) {
  console.log("FAIL: a result doesn't match the search query");
  process.exit(1);
}

const pulledIndexBin = requests.some((u) => u.includes("index.bin"));
console.log("pulled index.bin (should be false):", pulledIndexBin);
if (pulledIndexBin) {
  console.log("FAIL: browse page should not fetch the embedding vectors");
  process.exit(1);
}

console.log("console errors:", consoleErrors.length ? consoleErrors.join("\n") : "(none)");
console.log("PASS");
await browser.close();
