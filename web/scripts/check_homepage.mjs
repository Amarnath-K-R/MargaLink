// Dev-only: verify the homepage's content, links and layout rules.
//   First screen: the hero says what MargaLink does and offers "Match your
//   paper" without scrolling. The header turns solid once you scroll. No
//   all-caps labels. Copy is accurate about the two opt-in exceptions. Every
//   tool (incl. /write and /figures) is reachable from the story, the tools
//   dialog and the footer. On a phone the big interlude headlines are off, so
//   no two headlines stack.
import { chromium } from "playwright";

const browser = await chromium.launch();
let failed = false;
function check(label, ok) {
  console.log(`${ok ? "ok  " : "FAIL"} ${label}`);
  if (!ok) failed = true;
}

const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const consoleErrors = [];
page.on("pageerror", (err) => consoleErrors.push(`pageerror: ${err.message}`));
// Skip the intro overlay — covered separately by check_intro.mjs.
await page.addInitScript(() => sessionStorage.setItem("margalink-intro-seen", "1"));
await page.goto("http://localhost:3000");
await page.waitForSelector(".hero h1");
await page.waitForTimeout(1200); // entrance animation

// --- first screen ---
const cta = page.locator('.hero a[href="/match"]');
const box = await cta.boundingBox();
check("hero offers Match your paper in the first screen", !!box && box.y + box.height <= 900 && (await cta.isVisible()));
check("hero headline visible at the top", await page.locator(".hero h1").isVisible());

// --- header ---
check("header is transparent at the top", !(await page.locator(".site-header").getAttribute("class")).includes("scrolled"));
await page.evaluate(() => window.scrollTo(0, 400));
await page.waitForTimeout(300);
check("header turns solid once scrolled", (await page.locator(".site-header").getAttribute("class")).includes("scrolled"));
await page.evaluate(() => window.scrollTo(0, 0));

// --- type: no all-caps labels anywhere on the page ---
const caps = await page.evaluate(() =>
  [...document.querySelectorAll("main *, header *, footer *")]
    .filter((el) => getComputedStyle(el).textTransform === "uppercase" && el.textContent.trim())
    .map((el) => el.textContent.trim().slice(0, 30)),
);
check(`no all-caps labels${caps.length ? `: ${caps.slice(0, 5).join(" | ")}` : ""}`, caps.length === 0);
const shouting = await page.evaluate(() =>
  [...document.querySelectorAll("main *, header *, footer *")]
    .filter((el) => el.children.length === 0 && /^[^a-z]*[A-Z]{3,}[^a-z]*[A-Z]{3,}[^a-z]*$/.test(el.textContent.trim()) && !/^(GET|RUN|POST|APC|PDF|DOCX|CSV|LaTeX)\b/.test(el.textContent.trim()))
    .map((el) => el.textContent.trim().slice(0, 30)),
);
check(`no all-caps strings in the copy${shouting.length ? `: ${shouting.slice(0, 5).join(" | ")}` : ""}`, shouting.length === 0);

// --- copy accuracy ---
const text = await page.innerText("body");
check("no claim of a single exception", !/only exception|one clear exception|1\s*clear, optional exception/i.test(text));
check("names both opt-in exceptions", /AI review/i.test(text) && /Ask Claude/i.test(text));

// --- every tool is reachable ---
for (const href of ["/journals", "/match", "/review", "/figures", "/write"]) {
  check(`story links ${href}`, (await page.locator(`main a[href="${href}"]`).count()) > 0);
  check(`footer links ${href}`, (await page.locator(`footer a[href="${href}"]`).count()) > 0);
}
check("footer links /privacy", (await page.locator('footer a[href="/privacy"]').count()) > 0);
await page.click(".site-header >> text=All tools");
await page.waitForSelector(".tools-dialog");
check("tools dialog lists /write", (await page.locator('.tools-dialog a[href="/write"]').count()) === 1);
await page.keyboard.press("Escape");

// --- click-throughs ---
await page.locator('.final-section a[href="/match"]').click();
await page.waitForSelector("text=Find the right journal.");
check("final call-to-action reaches /match", true);
await page.goBack();
await page.waitForSelector(".hero h1");
await page.locator('.hero a[href="/journals"]').click();
await page.waitForURL("**/journals");
check("hero link reaches /journals", true);

// --- phone: no stacked interlude headlines, header solid enough to read over ---
const phone = await browser.newPage({ viewport: { width: 390, height: 844 } });
await phone.addInitScript(() => sessionStorage.setItem("margalink-intro-seen", "1"));
await phone.goto("http://localhost:3000");
await phone.waitForSelector(".hero h1");
const interludes = await phone.evaluate(() =>
  [...document.querySelectorAll(".pathways-stamp, .journals-count, .matching-decode, .review-sweep")].filter((el) => getComputedStyle(el).display !== "none").length,
);
check("phone: interlude headlines are off", interludes === 0);
const phoneCta = await phone.locator('.hero a[href="/match"]').boundingBox();
check("phone: Match your paper in the first screen", !!phoneCta && phoneCta.y + phoneCta.height <= 844);

check(`no page errors${consoleErrors.length ? `: ${consoleErrors.join(" | ")}` : ""}`, consoleErrors.length === 0);
await browser.close();
console.log(failed ? "FAIL" : "PASS");
process.exit(failed ? 1 : 0);
