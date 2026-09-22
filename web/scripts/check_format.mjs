// Dev-only: verify the format check runs end-to-end on a real multi-page PDF
// and detects the sections it actually contains.
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

const [fc] = await Promise.all([
  page.waitForEvent("filechooser"),
  page.click("text=Drop a PDF or DOCX"),
]);
await fc.setFiles(`${FIXTURE}`);
await page.waitForSelector("text=Format check", { timeout: 30000 });

const bodyText = await page.innerText("body");
console.log(bodyText.slice(bodyText.indexOf("Format check")));
console.log("console errors:", consoleErrors.length ? consoleErrors.join("\n") : "(none)");
await browser.close();
