// Dev-only: the documentation pages. /guide and /architecture load without
// errors; every screenshot in src/app/guide/shots.json exists with every
// marker inside it; every image the guide shows is served; every in-page link
// has a target; and neither page makes a request that carries a body.
import { chromium } from "playwright";
import { existsSync, readFileSync } from "node:fs";

const BASE = process.env.BASE ?? "http://localhost:3000";
const shots = JSON.parse(readFileSync(new URL("../src/app/guide/shots.json", import.meta.url), "utf8"));

function check(label, ok) {
  console.log(`${ok ? "ok  " : "FAIL"} ${label}`);
  if (!ok) process.exitCode = 1;
}

const names = Object.keys(shots);
check(`the guide has screenshots (${names.length})`, names.length >= 20);
const missing = names.filter((n) => !existsSync(new URL(`../public/guide/${n}.jpg`, import.meta.url)));
check(`every screenshot file exists${missing.length ? `: ${missing.join(", ")}` : ""}`, missing.length === 0);
const outside = names.filter((n) => shots[n].callouts.some((c) => c && (c.x < 0 || c.x > 100 || c.y < 0 || c.y > 100)));
check(`every marker lies inside its image${outside.length ? `: ${outside.join(", ")}` : ""}`, outside.length === 0);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
const bodies = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("request", (r) => r.postData() && bodies.push(r.url()));

for (const path of ["/guide", "/architecture"]) {
  await page.goto(BASE + path);
  await page.waitForSelector("main h1");
  const broken = await page.evaluate(() => [...document.querySelectorAll('a[href^="#"]')].map((a) => a.getAttribute("href").slice(1)).filter((id) => !document.getElementById(id)));
  check(`${path}: every in-page link has a target${broken.length ? `: ${broken.join(", ")}` : ""}`, broken.length === 0);
  if (path === "/guide") {
    const srcs = await page.evaluate(() => [...new Set([...document.querySelectorAll('img[src^="/guide/"]')].map((i) => i.getAttribute("src")))]);
    check(`/guide shows every screenshot it has (${srcs.length})`, srcs.length === names.length);
    const bad = [];
    for (const s of srcs) {
      const status = await page.evaluate(async (u) => (await fetch(u)).status, s);
      if (status !== 200) bad.push(`${s} ${status}`);
    }
    check(`every screenshot is served${bad.length ? `: ${bad.join(", ")}` : ""}`, bad.length === 0);
  } else {
    check("/architecture draws the system diagram", (await page.locator('svg[role="img"]').count()) >= 1);
  }
}
check(`no page errors${errors.length ? `: ${errors.join(" | ")}` : ""}`, errors.length === 0);
check(`no request carried a body${bodies.length ? `: ${bodies.join(", ")}` : ""}`, bodies.length === 0);
await browser.close();
