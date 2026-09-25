// Dev-only: verify the intro overlay's full behavior — shows on first visit,
// is skippable, is remembered, and the real page underneath is unaffected.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

// Output dir for screenshots/artifacts this script writes — override with
// SMOKE_OUT, defaults to a gitignored folder next to this script.
const SCRATCH = process.env.SMOKE_OUT ?? new URL("../.smoke/", import.meta.url).pathname;
mkdirSync(SCRATCH, { recursive: true });

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

// Overlay should be visible immediately on first load. Target the real
// .intro-overlay class, not aria-hidden — that attribute is `false` until
// the fade actually starts (IntroSequence.tsx: `aria-hidden={fading}`), so
// it can't distinguish "not shown" from "shown, not yet fading".
const overlayVisible = await page.locator(".intro-overlay").isVisible();
console.log("overlay visible on first load:", overlayVisible);
await page.screenshot({ path: `${SCRATCH}/intro_1_showing.png` });

// Wait for the sequence (4200ms hold + pause + fade, see IntroSequence.tsx)
// and confirm it disappears on its own, then that the real page is intact.
await page.waitForSelector(".intro-overlay", { state: "detached", timeout: 7000 });
console.log("overlay auto-dismissed after the sequence: yes");
await page.waitForSelector(".hero h1");
await page.screenshot({ path: `${SCRATCH}/intro_2_revealed.png` });

// sessionStorage should now remember it (see IntroSequence.tsx SEEN_KEY).
const seen = await page.evaluate(() => sessionStorage.getItem("margalink-intro-seen"));
console.log("sessionStorage remembers it was seen:", seen === "1");

// A second visit (same context = same sessionStorage) should skip it entirely.
await page.reload();
await page.waitForSelector(".hero h1");
const overlayOnReturn = await page.locator(".intro-overlay").count();
console.log("overlay count on return visit (should be 0):", overlayOnReturn);

// A first-time visitor can skip it: any click or key ends it at once.
const fresh = await (await browser.newContext()).newPage();
await fresh.goto("http://localhost:3000");
await fresh.waitForSelector(".intro-overlay");
await fresh.waitForTimeout(600);
await fresh.keyboard.press("Space");
const skipped = await fresh.waitForSelector(".intro-overlay", { state: "detached", timeout: 1500 }).then(() => true, () => false);
console.log("a key press skips the intro:", skipped);

console.log("console errors:", consoleErrors.length ? consoleErrors.join("\n") : "(none)");
if (!overlayVisible || overlayOnReturn !== 0 || !skipped || consoleErrors.length) {
  console.log("FAIL");
  process.exit(1);
}
console.log("PASS");
await browser.close();
