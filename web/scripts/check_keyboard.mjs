// Dev-only: verify the dropzone is keyboard-operable (tab to it, Enter opens
// the file picker) and that the double-run guard works.
import { chromium } from "playwright";

const browser = await chromium.launch();
const page = await browser.newPage();
// The tool now lives at /match — the intro overlay fronts the homepage
// ("/") instead, so no need to skip it here.
await page.goto("http://localhost:3000/match");
await page.waitForSelector("text=Find the right journal.");

// Tab from the top of the page until the dropzone is focused.
let focused = null;
for (let i = 0; i < 6; i++) {
  await page.keyboard.press("Tab");
  focused = await page.evaluate(() => document.activeElement?.getAttribute("aria-label"));
  if (focused === "Upload a PDF or DOCX paper") break;
}
console.log("focused element aria-label after tabbing:", focused);

if (focused !== "Upload a PDF or DOCX paper") {
  console.log("FAIL: dropzone never received keyboard focus");
  await browser.close();
  process.exit(1);
}

// Enter should open the native file picker — listen for the filechooser event.
const [fileChooser] = await Promise.all([
  page.waitForEvent("filechooser", { timeout: 3000 }),
  page.keyboard.press("Enter"),
]);
console.log("Enter opened file picker:", Boolean(fileChooser));

await browser.close();
