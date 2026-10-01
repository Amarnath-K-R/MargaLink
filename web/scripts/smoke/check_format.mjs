// Dev-only: verify the format check runs end-to-end on a real multi-page PDF
// and detects the sections it actually contains.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

// Output dir for screenshots/artifacts this script writes — override with
// SMOKE_OUT, defaults to a gitignored folder next to this script.
const SCRATCH = process.env.SMOKE_OUT ?? new URL("../../.smoke/", import.meta.url).pathname;
mkdirSync(SCRATCH, { recursive: true });
const FIXTURE = new URL("../fixtures/test-paper.pdf", import.meta.url).pathname;

let failed = false;
function check(label, ok) {
  console.log(`${ok ? "ok  " : "FAIL"} ${label}`);
  if (!ok) failed = true;
}

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

// What the fixture paper contains (scripts/fixtures/test-paper.pdf).
const panel = await page.innerText("body").then((t) => t.slice(t.indexOf("Format check")));
const field = (label) => panel.split(`${label}\n`)[1]?.split("\n")[0] ?? "";
check(`word count is counted (${field("Word count")})`, Number(field("Word count").replace(/,/g, "")) > 100);
check(`the abstract is found (${field("Abstract")})`, /^Found, \d+ words/.test(field("Abstract")));
for (const s of ["Ethics statement", "Funding statement", "Conflicts of interest", "Data availability statement"]) check(`${s}: detected`, field(s) === "Detected");
check(`references counted (${field("References (approximate)")})`, Number(field("References (approximate)")) >= 3);
check(`figures referenced (${field("Figures referenced")})`, Number(field("Figures referenced")) >= 2);
check(`tables referenced (${field("Tables referenced")})`, Number(field("Tables referenced")) >= 1);
check(`no console errors${consoleErrors.length ? `: ${consoleErrors.join(" | ")}` : ""}`, consoleErrors.length === 0);
await browser.close();
console.log(failed ? "FAIL" : "PASS");
process.exit(failed ? 1 : 0);
