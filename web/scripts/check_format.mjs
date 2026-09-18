// Dev-only: verify the format check runs end-to-end on a real multi-page PDF
// and detects the sections it actually contains.
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

await page.goto("http://localhost:3000");
await page.waitForSelector("text=Find the right journal.");

const [fc] = await Promise.all([
  page.waitForEvent("filechooser"),
  page.click("text=Drop a PDF or DOCX"),
]);
await fc.setFiles(`${SCRATCH}/full_paper.pdf`);
await page.waitForSelector("text=Format check", { timeout: 30000 });

const bodyText = await page.innerText("body");
console.log(bodyText.slice(bodyText.indexOf("Format check")));
console.log("console errors:", consoleErrors.length ? consoleErrors.join("\n") : "(none)");
await browser.close();
