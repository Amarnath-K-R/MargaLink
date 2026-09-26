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
await page.waitForSelector(".landing-wordmark");

// The page is the landing, then the closing call to action — both offer the
// two ways in.
const bodyText = await page.innerText("body");
const hasWorkflowSteps = bodyText.includes("Find your path") && bodyText.includes("Browse journals") && bodyText.includes("Match your paper");
console.log("landing and closing both present:", hasWorkflowSteps);

const matchLinks = await page.locator('a[href="/match"]').count();
console.log("links to /match:", matchLinks);

// Click through to the tool from the final call-to-action.
// Scroll to the closing section first, as a visitor would — mid-reveal its
// buttons are still easing into place.
await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" }));
await page.waitForTimeout(800);
await page.click('a[href="/match"].button-quiet');
await page.waitForSelector("text=Find the right journal.");
console.log("clicking through from the final CTA reaches the tool: yes");

await page.goBack();
await page.waitForSelector(".landing-wordmark");
// Back restores the scroll position (the bottom); the landing's links are
// faded out there, so return to the top as a visitor using them would be.
await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
await page.waitForFunction(() => scrollY === 0 && getComputedStyle(document.querySelector(".hero-brand-landing")).opacity === "1");

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
