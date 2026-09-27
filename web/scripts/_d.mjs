import { chromium } from "playwright";
const ctx = await chromium.launchPersistentContext(process.cwd() + "/.smoke/write-profile", { viewport: { width: 1440, height: 900 } });
const page = ctx.pages()[0] ?? (await ctx.newPage());
page.on("requestfailed", (r) => console.log("FAILED", r.url().slice(0, 140), r.failure()?.errorText));
page.on("console", (m) => ["error", "warning"].includes(m.type()) && console.log("console", m.type(), m.text().slice(0, 240)));
page.on("pageerror", (e) => console.log("pageerror:", e.message, (e.stack ?? "").split("\n").slice(1, 4).join(" | ")));
await page.goto("http://localhost:3000/write");
await page.waitForSelector('[data-testid="project-list"] button');
await page.locator('[data-testid="project-list"] li button').first().click();
await page.waitForSelector('[data-testid="latex-editor"] .cm-content');
await page.click("button:has-text('Compile')");
for (let i = 0; i < 12; i++) { await page.waitForTimeout(5000); const st = await page.locator('[data-testid="compile-status"]').textContent(); console.log(`t=${(i + 1) * 5}s status=${JSON.stringify(st)}`); if (/Compiled|failed|stopped|couldn/.test(st)) break; }
console.log("error text:", await page.locator('[data-testid="workspace"] [role="alert"], [data-testid="workspace"] .text-away').allTextContents().catch(() => []));
await ctx.close();
