// Dev-only smoke driver: launches headless chromium against the running dev
// server, uploads a real test paper, and screenshots the result. Not part of
// the app; run manually with `node scripts/drive_app.mjs`.
import { chromium } from "playwright";

const SCRATCH =
  "/private/tmp/claude-501/-Users-amar-Projects-MargaLink/a160d450-6812-4cbc-9444-54305e64ab90/scratchpad";

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
await fileChooser.setFiles(`${SCRATCH}/test_paper.pdf`);

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
