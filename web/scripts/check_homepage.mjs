// Dev-only: verify the new homepage's content and links.
import { chromium } from "playwright";

const browser = await chromium.launch();
const page = await browser.newPage();
const consoleErrors = [];
page.on("console", (msg) => {
  if (msg.type() === "error") consoleErrors.push(msg.text());
});
page.on("pageerror", (err) => consoleErrors.push(`pageerror: ${err.message}`));

// Skip the intro overlay — covered separately by check_intro.mjs.
await page.addInitScript(() => sessionStorage.setItem("margalink-intro-seen", "1"));
await page.goto("http://localhost:3000");
await page.waitForSelector("text=MargaLink helps researchers find the right journal, check the fit, and ask for a review.");

const bodyText = await page.innerText("body");
// All three tools are fully built now (no more "coming soon" placeholders) —
// the pathways section's workflow list is the current equivalent overview.
const hasWorkflowSteps =
  bodyText.includes("Browse journals") &&
  bodyText.includes("Match your paper") &&
  bodyText.includes("Get it reviewed");
console.log("shows all three workflow steps:", hasWorkflowSteps);

const matchLinks = await page.locator('a[href="/match"]').count();
console.log("links to /match:", matchLinks);

// Click through to the tool from the final call-to-action.
await page.click('a[href="/match"].button-quiet');
await page.waitForSelector("text=Find the right journal.");
console.log("clicking through from the final CTA reaches the tool: yes");

await page.goBack();
await page.waitForSelector("text=MargaLink helps researchers find the right journal, check the fit, and ask for a review.");

// Click through to journals (header nav + the new tool card both link
// there now — use .first() rather than an ambiguous selector).
await page.locator('a[href="/journals"]').first().click();
await page.waitForSelector("text=Browse journals");
console.log("clicking through reaches /journals: yes");

console.log("console errors:", consoleErrors.length ? consoleErrors.join("\n") : "(none)");
if (!hasWorkflowSteps || matchLinks < 1) {
  console.log("FAIL");
  process.exit(1);
}
console.log("PASS");
await browser.close();
