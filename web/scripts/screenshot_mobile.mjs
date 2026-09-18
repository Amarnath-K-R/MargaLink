// Dev-only: screenshot the home and privacy pages at phone width.
import { chromium } from "playwright";

const SCRATCH =
  "/private/tmp/claude-501/-Users-amar-Projects-MargaLink/a160d450-6812-4cbc-9444-54305e64ab90/scratchpad";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 375, height: 812 } });

await page.goto("http://localhost:3000");
await page.waitForSelector("text=Find the right journal.");
await page.screenshot({ path: `${SCRATCH}/mobile_home.png`, fullPage: true });

await page.goto("http://localhost:3000/privacy");
await page.waitForSelector("text=How privacy works");
await page.screenshot({ path: `${SCRATCH}/mobile_privacy.png`, fullPage: true });

await browser.close();
console.log("done");
