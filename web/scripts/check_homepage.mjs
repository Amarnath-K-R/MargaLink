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
await page.addInitScript(() => localStorage.setItem("margalink-seen-intro", "1"));
await page.goto("http://localhost:3000");
await page.waitForSelector("text=Get your paper ready to submit.");

const bodyText = await page.innerText("body");
const hasAvailable = bodyText.includes("Available now");
const hasComingSoon = bodyText.includes("Coming soon");
console.log("shows 'Available now' steps:", hasAvailable);
console.log("shows 'Coming soon' steps:", hasComingSoon);

// The numbered path's first two steps link into /match, the rest don't (not built yet).
const matchLinks = await page.locator('a[href="/match"]').count();
console.log("links to /match:", matchLinks);

// Click through to the tool from a numbered step.
await page.click('ol a[href="/match"]');
await page.waitForSelector("text=Find the right journal.");
console.log("clicking a numbered step reaches the tool: yes");

await page.goBack();
await page.waitForSelector("text=Get your paper ready to submit.");

// Click through to journals.
await page.click('a[href="/journals"]');
await page.waitForSelector("text=Browse journals");
console.log("clicking through reaches /journals: yes");

console.log("console errors:", consoleErrors.length ? consoleErrors.join("\n") : "(none)");
if (!hasAvailable || !hasComingSoon || matchLinks < 1) {
  console.log("FAIL");
  process.exit(1);
}
console.log("PASS");
await browser.close();
