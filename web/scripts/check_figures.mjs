// Dev-only: verify /figures end to end against a running dev server.
//   Part 1 — a messy real-world export (metadata lines, ";" delimiter,
//   decimal commas, thousands dots, NA tokens) is read correctly, the
//   number-format control really matters, a template renders on this device,
//   all four export formats come back, and no request carries a body.
//   Part 2 — the editors: a second panel (scatter), a title and unit, Welch
//   brackets against the first group (loads SciPy once), and a recipe that
//   round-trips to the identical image; a recipe for other data is refused.
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

check(`zero body-carrying requests (${bodyRequests.join("; ") || "none"})`, bodyRequests.length === 0);
check(`no console errors${consoleErrors.length ? `: ${consoleErrors.join(" | ")}` : ""}`, consoleErrors.length === 0);

await page.screenshot({ path: `${SCRATCH}/figures.png`, fullPage: true });
await context.close();
console.log(failed ? "FAIL" : "PASS");
process.exit(failed ? 1 : 0);
