// Dev-only: /match end to end on the built index — what we read from a real
// PDF, the paper's topics, fit badges, a "why" panel, the correction and
// paste-only paths re-ranking, the accuracy footer agreeing with the
// manifest, and not one request carrying a body.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const SCRATCH = process.env.SMOKE_OUT ?? new URL("../.smoke/", import.meta.url).pathname;
mkdirSync(SCRATCH, { recursive: true });
const FIXTURE = new URL("./fixtures/test-paper.pdf", import.meta.url).pathname;
const OTHER_TOPIC = `Sediment transport in braided gravel-bed rivers
We measured bedload transport in three braided gravel-bed rivers over two flood seasons using impact plates and repeat topographic surveys, and compared the measured fluxes with predictions from standard transport formulae. The formulae systematically overpredicted transport at low flows and underpredicted it during peak floods, which we attribute to armouring and to the migration of bars.`;

const browser = await chromium.launch();
const page = await browser.newPage();
const consoleErrors = [];
page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text()));
page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));
const bodies = [];
page.on("request", (r) => r.postData() && bodies.push(`${r.method()} ${r.url()}`));

let failed = false;
const check = (label, ok) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${label}`);
  if (!ok) failed = true;
};
const titles = () => page.locator("[data-testid=results] li").evaluateAll((lis) => lis.map((li) => li.querySelector("a, button")?.textContent?.trim()));

await page.goto("http://localhost:3000/match");
await page.waitForSelector("text=Find the right journal.");
const manifest = await page.evaluate(() => fetch("/index/manifest.json").then((r) => r.json()));
const hasTopics = (manifest.topic_count ?? 0) > 0;

// 1. a real PDF
const [fc] = await Promise.all([page.waitForEvent("filechooser"), page.click("text=Drop a PDF or DOCX")]);
await fc.setFiles(FIXTURE);
await page.waitForSelector("[data-testid=results] li", { timeout: 120000 });
const read = await page.locator("[data-testid=what-we-read]").innerText();
check("What we read shows the paper's title and abstract", read.length > 250);
check("the references line is filled", (await page.locator("[data-testid=refs-line]").innerText()).length > 5);
if (hasTopics) check("the paper's topics are shown", (await page.locator("[data-testid=paper-topics]").innerText()).split("·").length >= 2);
const n = await page.locator("[data-testid=results] li").count();
check(`10 results (${n})`, n === 10);
const fits = await page.locator("[data-fit]").evaluateAll((els) => els.map((e) => e.getAttribute("data-fit")));
check(`every result carries a fit badge (${[...new Set(fits)].join(", ")})`, fits.length === 10);
check("fit badges match the manifest (fitted ⇔ percentages)", manifest.ranking?.fitted ? !fits.includes("unfitted") : fits.every((f) => f === "unfitted"));
await page.getByRole("button", { name: "Why this journal" }).first().click();
check("the why panel opens", await page.locator("[data-testid=why]").isVisible());
const before = await titles();

// 2. correcting what we read re-ranks, locally
await page.locator("summary", { hasText: "Not right?" }).click();
await page.getByLabel("Corrected title and abstract").fill(OTHER_TOPIC);
await page.getByRole("button", { name: "Use this instead" }).click();
await page.waitForFunction((b) => {
  const now = [...document.querySelectorAll("[data-testid=results] li")].map((li) => li.querySelector("a, button")?.textContent?.trim());
  return now.length === 10 && JSON.stringify(now) !== b;
}, JSON.stringify(before), { timeout: 60000 });
check("a corrected abstract re-ranks the journals", JSON.stringify(await titles()) !== JSON.stringify(before));

// 3. paste-only entry
await page.goto("http://localhost:3000/match");
await page.getByRole("tab", { name: "Paste title and abstract" }).click();
await page.getByLabel("Title and abstract").fill(OTHER_TOPIC);
await page.getByRole("button", { name: "Find journals" }).click();
await page.waitForSelector("[data-testid=results] li", { timeout: 60000 });
check("paste-only entry ranks journals", (await page.locator("[data-testid=results] li").count()) === 10);
check("paste-only says the citation signal is off", (await page.locator("[data-testid=refs-line]").innerText()).includes("no reference list"));

// 4. published accuracy and privacy
check("the accuracy footer appears exactly when the build is fitted", (await page.locator("[data-testid=accuracy]").count()) === (manifest.ranking?.accuracy ? 1 : 0));
check(`zero body-carrying requests (${bodies.join("; ") || "none"})`, bodies.length === 0);
check(`no console errors${consoleErrors.length ? `: ${consoleErrors.join(" | ")}` : ""}`, consoleErrors.length === 0);

await page.screenshot({ path: `${SCRATCH}/match.png`, fullPage: true });
await browser.close();
console.log(failed ? "FAIL" : "PASS");
process.exit(failed ? 1 : 0);
