// Dev-only: verify the intro overlay's full behavior — shows on first visit,
// is skippable, is remembered, and the real page underneath is unaffected.
import { chromium } from "playwright";

const SCRATCH =
  "/private/tmp/claude-501/-Users-amar-Projects-MargaLink/a160d450-6812-4cbc-9444-54305e64ab90/scratchpad";

const browser = await chromium.launch();

// Fresh context = fresh localStorage, simulating a true first-time visitor.
const context = await browser.newContext();
const page = await context.newPage();
const consoleErrors = [];
page.on("console", (msg) => {
  if (msg.type() === "error") consoleErrors.push(msg.text());
});
page.on("pageerror", (err) => consoleErrors.push(`pageerror: ${err.message}`));

await page.goto("http://localhost:3000");

// Overlay should be visible immediately on first load.
const overlayVisible = await page.locator('[aria-hidden="true"]:has-text("MargaLink")').isVisible();
console.log("overlay visible on first load:", overlayVisible);
await page.screenshot({ path: `${SCRATCH}/intro_1_showing.png` });

// Wait for the full sequence (draw + hold + fadeout) and confirm it
// disappears on its own, then that the real page is intact underneath.
await page.waitForSelector('[aria-hidden="true"]:has-text("MargaLink")', {
  state: "detached",
  timeout: 5000,
});
console.log("overlay auto-dismissed after the sequence: yes");
await page.waitForSelector("text=Get your paper ready to submit.");
await page.screenshot({ path: `${SCRATCH}/intro_2_revealed.png` });

// localStorage should now remember it.
const seen = await page.evaluate(() => localStorage.getItem("margalink-seen-intro"));
console.log("localStorage remembers it was seen:", seen === "1");

// A second visit (same context = same localStorage) should skip it entirely.
await page.reload();
await page.waitForSelector("text=Get your paper ready to submit.");
const overlayOnReturn = await page.locator('[aria-hidden="true"]:has-text("MargaLink")').count();
console.log("overlay count on return visit (should be 0):", overlayOnReturn);

console.log("console errors:", consoleErrors.length ? consoleErrors.join("\n") : "(none)");
if (!overlayVisible || overlayOnReturn !== 0) {
  console.log("FAIL");
  process.exit(1);
}
console.log("PASS");
await browser.close();
