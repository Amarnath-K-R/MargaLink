// Dev-only smoke driver: launches headless chromium against the running dev
// server, uploads a real test paper, and screenshots the result. Not part of
// the app; run manually with `node scripts/drive_app.mjs`.
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
await page.screenshot({ path: `${SCRATCH}/screenshot_1_initial.png` });

const [fileChooser] = await Promise.all([
  page.waitForEvent("filechooser"),
  page.click("text=Drop a PDF or DOCX"),
]);
await fileChooser.setFiles(`${FIXTURE}`);

// Wait until the pipeline settles: either "Best matches" appears or an
// error message does. Generous timeout — first run downloads the model.
await page
  .waitForFunction(
    () =>
      document.body.innerText.includes("Best matches") ||
      /[A-Za-z].*(error|Error)/.test(document.body.innerText),
    { timeout: 60000 }
  )
  .catch(() => {});
await page.screenshot({
  path: `${SCRATCH}/screenshot_2_result.png`,
  fullPage: true,
});

const bodyText = await page.innerText("body");
console.log("=== PAGE TEXT ===");
console.log(bodyText);
console.log("=== CONSOLE ERRORS ===");
console.log(consoleErrors.length ? consoleErrors.join("\n") : "(none)");

await browser.close();
