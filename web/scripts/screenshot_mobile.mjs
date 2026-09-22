// Dev-only: screenshot the homepage, the tool, and the privacy page at phone width.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

// Output dir for screenshots/artifacts this script writes — override with
// SMOKE_OUT, defaults to a gitignored folder next to this script.
const SCRATCH = process.env.SMOKE_OUT ?? new URL("../.smoke/", import.meta.url).pathname;
mkdirSync(SCRATCH, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 375, height: 812 } });

// Skip the one-time intro overlay — already covered by check_intro.mjs, and
// racing its ~2s auto-dismiss here would make this script's timing flaky.
await page.addInitScript(() => sessionStorage.setItem("margalink-intro-seen", "1"));
await page.goto("http://localhost:3000");
await page.waitForSelector("text=MargaLink helps researchers find the right journal, check the fit, and ask for a review.");
await page.screenshot({ path: `${SCRATCH}/mobile_home.png`, fullPage: true });

await page.goto("http://localhost:3000/match");
await page.waitForSelector("text=Find the right journal.");
await page.screenshot({ path: `${SCRATCH}/mobile_match.png`, fullPage: true });

await page.goto("http://localhost:3000/privacy");
await page.waitForSelector("text=How privacy works");
await page.screenshot({ path: `${SCRATCH}/mobile_privacy.png`, fullPage: true });

await browser.close();
console.log("done");
