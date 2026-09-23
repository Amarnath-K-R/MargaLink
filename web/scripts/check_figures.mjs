// Dev-only: verify /figures end to end against a running dev server.
//   Part 1 — a messy real-world export (metadata lines, ";" delimiter,
//   decimal commas, thousands dots, NA tokens) is read correctly, the
//   number-format control really matters, a template renders on this device,
//   all four export formats come back, and no request carries a body.
//   Part 2 — the editors: a second panel (scatter), a title and unit, Welch
//   brackets against the first group (loads SciPy once), and a recipe that
//   round-trips to the identical image; a recipe for other data is refused.
//   Part 3 — Ask Claude (mocked; a real call is a manual gate): consent, the
//   exact body (no values, no labels by default; only the listed labels when
//   opted in, with the notice shown again), the returned spec renders.
//   Part 4 — custom tweak (mocked): "import os" is refused before anything
//   runs; a benign customize() runs and shows in the exported SVG.
//
// First run downloads Pyodide (~30MB, from jsDelivr) into this profile's
// HTTP cache — later runs reuse it. That's why this uses a persistent
// context instead of chromium.launch()'s throwaway one.
import { chromium } from "playwright";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const SCRATCH = process.env.SMOKE_OUT ?? new URL("../.smoke/", import.meta.url).pathname;
mkdirSync(SCRATCH, { recursive: true });
const MESSY = new URL("./fixtures/messy.csv", import.meta.url).pathname;

const context = await chromium.launchPersistentContext(`${SCRATCH}/figures-profile`, {});
const page = context.pages()[0] ?? (await context.newPage());
const consoleErrors = [];
page.on("console", (msg) => {
  if (msg.type() === "error") consoleErrors.push(msg.text());
});
page.on("pageerror", (err) => consoleErrors.push(`pageerror: ${err.message}`));
const bodyRequests = [];
page.on("request", (r) => {
  if (r.postData()) bodyRequests.push(`${r.method()} ${r.url()}`);
});

let failed = false;
function check(label, ok) {
  console.log(`${ok ? "ok  " : "FAIL"} ${label}`);
  if (!ok) failed = true;
}

await page.goto("http://localhost:3000/figures");
await page.evaluate(() => {
  localStorage.clear();
  sessionStorage.clear();
});
await page.reload();
await page.waitForSelector("text=Make a figure.");

// --- upload + prep ---
const [fc] = await Promise.all([page.waitForEvent("filechooser"), page.click("text=Drop a CSV or XLSX")]);
await fc.setFiles(MESSY);
await page.waitForSelector('[data-testid="preview-table"]', { timeout: 10000 });

const dtypeOf = (name) => page.locator(`select[aria-label="Type of ${name}"]`).getAttribute("data-dtype");
check("header row guessed past two metadata lines", (await page.getByLabel("Header row").inputValue()) === "3");
check("decimal comma guessed", (await page.getByLabel("Decimal mark").inputValue()) === ",");
check("weight_kg (1.081,0 / NA) reads as numeric", (await dtypeOf("weight_kg")) === "numeric");
check("week1 (decimal commas) reads as numeric", (await dtypeOf("week1")) === "numeric");
check("arm reads as categorical", (await dtypeOf("arm")) === "categorical");
const tableText = await page.locator('[data-testid="preview-table"]').innerText();
check("numbers shown as the figure will read them (1081, 2.4)", tableText.includes("1081") && tableText.includes("2.4"));

await page.getByLabel("Decimal mark").selectOption(".");
await page.waitForTimeout(100);
check("with a dot decimal mark, week1 falls to categorical", (await dtypeOf("week1")) === "categorical");
await page.getByLabel("Decimal mark").selectOption(",");
await page.waitForTimeout(100);
check("…and back to numeric with a comma", (await dtypeOf("week1")) === "numeric");

// --- template → live local render ---
await page.waitForSelector('[data-template="box"]');
await page.click('[data-template="box"]');
await page.waitForSelector('[data-testid="figure-image"]', { timeout: 120000 });
const src = await page.locator('[data-testid="figure-image"]').getAttribute("src");
check("the box template rendered a PNG on this device", src?.startsWith("data:image/png;base64,") && src.length > 2000);
check("no render error", (await page.locator('[data-testid="render-error"]').count()) === 0);

// --- export all four formats ---
const bar = page.locator('[data-testid="export-bar"]');
for (const f of ["PNG", "TIFF", "SVG", "PDF"]) await bar.getByLabel(f).check();
await bar.getByRole("button", { name: "Export" }).click();
await page.waitForSelector('[data-testid="export-bar"] a[download]', { timeout: 60000 });
const names = await bar.locator("a[download]").evaluateAll((as) => as.map((a) => a.getAttribute("download")));
check(`four downloads (${names.join(", ")})`, ["figure.png", "figure.tiff", "figure.svg", "figure.pdf"].every((n) => names.includes(n)));

// --- part 2: editors ---
const preview = page.locator('[data-testid="figure-preview"]');
async function settled() {
  await page.waitForTimeout(400); // past the 250 ms debounce
  await page.waitForFunction(() => document.querySelector('[data-testid="figure-preview"]')?.getAttribute("data-busy") === "false", null, { timeout: 120000 });
}
const editor = page.locator('[data-testid="panel-editor"]');
await editor.getByLabel("Panel title").fill("Week 1 score by arm");
await editor.getByLabel("Y unit").fill("points");
await editor.getByLabel("Column for y").selectOption("week1");
await settled();

await page.getByRole("button", { name: "Add panel" }).click();
await page.getByRole("tab", { name: /Panel b/ }).waitFor();
await editor.getByRole("button", { name: "Scatter" }).click();
await editor.getByLabel("Column for x").selectOption("dose_mg");
await editor.getByLabel("Column for y").selectOption("week1");
await settled();
check("two panels rendered", (await preview.getAttribute("data-panels")) === "2");

await page.getByRole("tab", { name: /Panel a/ }).click();
await editor.locator("summary", { hasText: "Statistics" }).click();
const stages = [];
const seen = setInterval(async () => {
  const t = await preview.innerText().catch(() => "");
  if (t.includes("statistics library")) stages.push("scipy");
}, 100);
await editor.getByLabel("Test").selectOption("welch");
await editor.getByLabel("Comparisons").selectOption("vs-first");
await settled();
clearInterval(seen);
const tests = await page.locator('[data-testid="test-results"] tr').count();
check(`Welch vs-first gives 2 comparisons for 3 arms (${tests})`, tests === 2);
const statErr = await page.locator('[data-testid="render-error"]').innerText().catch(() => "");
check(`no render error after adding statistics ${statErr}`, !statErr);

const before = await page.locator('[data-testid="figure-image"]').getAttribute("src");
const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Save recipe" }).click()]);
const recipePath = `${SCRATCH}/recipe.json`;
await dl.saveAs(recipePath);
const recipe = JSON.parse(readFileSync(recipePath, "utf8"));
check("recipe carries the spec, no data", recipe.version === 1 && recipe.spec.panels.length === 2 && !JSON.stringify(recipe).includes("Nordklinik"));
await page.click('[data-template="histogram"]'); // replace the figure…
await settled();
await page.getByLabel("Recipe file").setInputFiles(recipePath); // …then bring it back
await settled();
const after = await page.locator('[data-testid="figure-image"]').getAttribute("src");
check("re-imported recipe redraws the identical image", before === after);

const foreign = { ...recipe, spec: { ...recipe.spec, panels: [{ ...recipe.spec.panels[0], roles: { ...recipe.spec.panels[0].roles, y: "not_here" } }] } };
writeFileSync(`${SCRATCH}/foreign.json`, JSON.stringify(foreign));
await page.getByLabel("Recipe file").setInputFiles(`${SCRATCH}/foreign.json`);
await page.waitForSelector('[data-testid="recipe"] >> text=doesn\'t fit this data');
check("a recipe for other data is refused with a reason", true);

// --- part 3: Ask Claude (mocked) ---
const bodies = [];
let nextReply = null;
await page.route("**/api/figure", async (route) => {
  bodies.push(JSON.parse(route.request().postData()));
  await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(nextReply) });
});
const twoPanel = structuredClone(recipe.spec);
twoPanel.panels[0].layers = [{ kind: "points", ci: false, alpha: 0.5, size: null, jitter: null }];
twoPanel.panels[0].title = "";
nextReply = { spec: twoPanel, summary: "Week 1 by arm with points, beside dose against week 1." };
const describe = page.locator('[data-testid="describe"]');
await describe.getByLabel("Describe the figure").fill("Add the individual points to panel a");
const preview1 = await page.locator('[data-testid="figure-payload"]').textContent();
check("payload preview: no labels, no values by default", preview1.includes('"levels": null') && !/Nordklinik|S01|Placebo|1081/.test(preview1));
await describe.getByRole("button", { name: "Ask Claude for a figure" }).click();
await page.waitForSelector('[role="alertdialog"]');
check("consent does not list labels when not opted in", (await page.locator('[data-testid="consent-labels"]').count()) === 0);
await page.getByRole("button", { name: "Send it and ask Claude" }).click();
await page.waitForSelector('[data-testid="claude-summary"]');
await settled();
const sent1 = JSON.stringify(bodies[0]);
check("request body: levels null, no cell value or label", bodies[0].levels === null && !/Nordklinik|S01|Placebo|1081/.test(sent1));
check("request body keeps typed text local (title not sent)", !sent1.includes("Week 1 score by arm"));
check("request body equals the on-page preview", sent1 === JSON.stringify(JSON.parse(preview1)));
check("Claude's spec rendered (2 panels, no error)", (await preview.getAttribute("data-panels")) === "2" && (await page.locator('[data-testid="render-error"]').count()) === 0);
check("the user's own title survived Claude's empty one", (await editor.getByLabel("Panel title").inputValue()) === "Week 1 score by arm");

await describe.getByLabel(/Also send group labels/).check();
await describe.getByRole("button", { name: "Ask Claude for a figure" }).click();
await page.waitForSelector('[data-testid="consent-labels"]');
const consentText = await page.locator('[data-testid="consent-labels"]').innerText();
check("with labels ticked, the notice shows again and lists them", consentText.includes("Nordklinik") && consentText.includes("Placebo"));
await page.getByRole("button", { name: "Send it and ask Claude" }).click();
await page.waitForFunction(() => document.querySelectorAll('[data-testid="claude-summary"]').length > 0);
await settled();
check(
  `opted-in body carries exactly the small categorical columns (${Object.keys(bodies[1].levels ?? {}).join(", ")})`,
  JSON.stringify(bodies[1].levels) === JSON.stringify({ subject: ["S01", "S02", "S03", "S04", "S05", "S06"], site: ["Nordklinik", "Südhaus", "Østby"], arm: ["Placebo", "Low", "High"] }),
);
check("opted-in body still has no numeric values", !JSON.stringify(bodies[1]).includes("1081"));
await describe.getByLabel(/Also send group labels/).uncheck();

// --- part 4: custom tweak (mocked) ---
nextReply = { hook: "import os\ndef customize(fig, axes, df):\n    os.listdir('/')", summary: "Lists files." };
await describe.getByLabel("Describe the figure").fill("Put HOOKED as the first panel's title");
await describe.getByRole("button", { name: "Ask for a custom tweak (code)" }).click();
await page.waitForSelector('[data-testid="describe"] >> text=rejected before running');
check("a tweak importing os is refused before it runs", (await page.locator('[data-testid="hook"]').count()) === 0);
nextReply = { hook: "def customize(fig, axes, df):\n    axes[0].set_title('HOOKED')\n", summary: "Sets the first panel's title." };
await describe.getByRole("button", { name: "Ask for a custom tweak (code)" }).click();
await page.waitForSelector('[data-testid="hook"]');
await settled();
check("a returned tweak doesn't run until the user clicks Run", !(await page.locator('[data-testid="figure-image"]').getAttribute("src")).length || (await page.locator('[data-testid="hook"] summary').innerText()).includes("not running yet"));
await page.getByRole("button", { name: "Run this tweak" }).click();
await settled();
check("the tweak ran without a warning", (await page.locator('[data-testid="hook-warning"]').count()) === 0 && (await page.locator('[data-testid="render-error"]').count()) === 0);
for (const f of ["PNG", "TIFF", "PDF"]) await bar.getByLabel(f).uncheck();
await bar.getByLabel("SVG").check();
await bar.getByRole("button", { name: "Export" }).click();
await page.waitForFunction(() => [...document.querySelectorAll('[data-testid="export-bar"] a[download]')].length === 1);
const svg = await page.evaluate(async () => (await fetch(document.querySelector('[data-testid="export-bar"] a[download]').href)).text());
check("the exported SVG carries the tweak's title", svg.includes("HOOKED"));
check("every body-carrying request was a confirmed /api/figure call", bodies.length === 4);
bodyRequests.splice(0, bodyRequests.length, ...bodyRequests.filter((r) => !r.endsWith("/api/figure")));

check(`zero other body-carrying requests (${bodyRequests.join("; ") || "none"})`, bodyRequests.length === 0);
check(`no console errors${consoleErrors.length ? `: ${consoleErrors.join(" | ")}` : ""}`, consoleErrors.length === 0);

await page.screenshot({ path: `${SCRATCH}/figures.png`, fullPage: true });
await context.close();
console.log(failed ? "FAIL" : "PASS");
process.exit(failed ? 1 : 0);
