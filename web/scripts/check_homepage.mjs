// Dev-only: the landing page and the way in from it. The landing and its
// closing call to action are there; the header's one link is Dashboard,
// which opens /home; the finale no longer offers the tool buttons; and /home
// has its two ways in (the workspace, the guide) and the news below them.
import { chromium } from "playwright";

const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on("console", (msg) => msg.type() === "error" && errors.push(msg.text()));
page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));

function check(label, ok) {
  console.log(`${ok ? "ok  " : "FAIL"} ${label}`);
  if (!ok) process.exitCode = 1;
}

// Skip the intro overlay — covered separately by check_intro.mjs.
await page.addInitScript(() => sessionStorage.setItem("margalink-intro-seen", "1"));
await page.goto("http://localhost:3000");
await page.waitForSelector(".landing-wordmark");

const body = await page.innerText("body");
check("the landing and the closing call to action are there", body.includes("Find your path") && body.includes("Afraid of rejection"));
check("the header offers Dashboard, not Explore tools", (await page.locator(".site-header").innerText()).includes("Dashboard") && !body.includes("Explore tools"));
check("the finale no longer offers Find my journal / Browse journals buttons", (await page.locator("#finale a").count()) === 0);

await page.locator('.site-header a[href="/home"]').click();
await page.waitForURL("**/home");
await page.waitForSelector("main h1:text-is('Home')");
check("Dashboard opens Home", true);
check("Home is pressed in the tray", (await page.locator('nav[aria-label="MargaLink"] a[href="/home"][aria-current="page"]').count()) === 1);
check("Home offers the workspace and the guide", (await page.locator('main a[href="/write"]').count()) >= 1 && (await page.locator('main a[href="/guide"]').count()) >= 1);
check("the news is further down", (await page.locator("#news article").count()) >= 3);

await page.locator("main a[href='/guide']").first().click();
await page.waitForSelector("text=How to use MargaLink.");
check("the guide card opens the guide", true);

check(`no console errors${errors.length ? `: ${errors.join(" | ")}` : ""}`, errors.length === 0);
await browser.close();
