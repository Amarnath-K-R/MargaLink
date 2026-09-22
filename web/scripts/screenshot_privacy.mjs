// Dev-only: screenshot the privacy page to check the diagram renders.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

// Output dir for screenshots/artifacts this script writes — override with
// SMOKE_OUT, defaults to a gitignored folder next to this script.
const SCRATCH = process.env.SMOKE_OUT ?? new URL("../.smoke/", import.meta.url).pathname;
mkdirSync(SCRATCH, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage();
const consoleErrors = [];
page.on("console", (msg) => {
  if (msg.type() === "error") consoleErrors.push(msg.text());
});
page.on("pageerror", (err) => consoleErrors.push(`pageerror: ${err.message}`));

await page.goto("http://localhost:3000/privacy");
await page.waitForSelector("text=How privacy works");
await page.screenshot({ path: `${SCRATCH}/screenshot_privacy.png`, fullPage: true });

console.log("console errors:", consoleErrors.length ? consoleErrors.join("\n") : "(none)");
await browser.close();
