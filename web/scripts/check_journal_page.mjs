// Dev-only: verify clicking a result actually navigates to a real journal
// detail page with real content.
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
await fc.setFiles(`${SCRATCH}/test_paper.pdf`);
await page.waitForSelector("[data-testid=results] li", { timeout: 30000 });

const firstLink = page.locator("[data-testid=results] a").first();
const linkText = await firstLink.innerText();
const href = await firstLink.getAttribute("href");
console.log(`clicking result: "${linkText}" -> ${href}`);
await firstLink.click();

await page.waitForSelector("text=Article processing fee");
const bodyText = await page.innerText("body");
console.log("journal page shows the same name:", bodyText.includes(linkText));
console.log("has back link:", bodyText.includes("Back"));

console.log("console errors:", consoleErrors.length ? consoleErrors.join("\n") : "(none)");
await browser.close();
