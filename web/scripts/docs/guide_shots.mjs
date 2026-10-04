// Dev-only: the screenshots in /guide, made from the real UI. Drives each tool
// to the state a section needs, captures that region as a JPEG into
// public/guide/, and writes src/app/guide/shots.json with each numbered
// marker's position (a percentage of its image, measured from the element it
// points at) — so re-running this after a UI change moves the markers with
// the UI. Needs `npm run dev` and the local journal index (for Match).
// The AI review is mocked (as check_review.mjs does), signed in through
// mock_account.mjs; Ask Claude isn't used.
// Run: node scripts/docs/guide_shots.mjs [journals|match|review|figures|write|tray|coins]
import { chromium } from "playwright";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { mockAccount } from "../smoke/mock_account.mjs";
import { reviewAnswer } from "../smoke/mock_review.mjs";
import { BETA } from "../../src/lib/access/beta.ts";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { paperDocx, TEXT } from "../fixtures/docx_fixtures.mjs";

const BASE = process.env.BASE ?? "http://localhost:3000";
const OUT = new URL("../../public/guide/", import.meta.url).pathname;
const MANIFEST = new URL("../../src/app/guide/shots.json", import.meta.url).pathname;
const PROFILE = new URL("../../.smoke/guide-profile", import.meta.url).pathname;
const only = process.argv[2] ?? null;
const VW = 1280;
const VH = 820;
mkdirSync(OUT, { recursive: true });
const manifest = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, "utf8")) : {};

const ctx = await chromium.launchPersistentContext(PROFILE, { viewport: { width: VW, height: VH }, deviceScaleFactor: 1.5 });
const page = ctx.pages()[0] ?? (await ctx.newPage());
page.on("pageerror", (e) => console.log("pageerror:", e.message));
page.on("dialog", (d) => void d.accept());
await mockAccount(ctx, { balance: 42, paddle: { env: "sandbox", token: "test_guide", prices: { S: "pri_s", M: "pri_m", L: "pri_l", PRO_MONTH: "pri_pm", PRO_YEAR: "pri_py" } } });

// The review's passes, mocked (scripts/smoke/mock_review.mjs).
await page.route("**/api/review", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(reviewAnswer(route.request().postDataJSON())) }));

const pct = (v, total) => Math.max(2, Math.min(98, Math.round((v / total) * 1000) / 10));
const loc = (l) => (typeof l === "string" ? page.locator(l).first() : l);

// Hide what isn't part of the UI being shown: the dev-server badge, and (except
// for the tray's own shot) the sticky tray, which would cover a scrolled region.
async function tidy({ tray = false } = {}) {
  await page.addStyleTag({ content: `nextjs-portal{display:none!important}${tray ? "" : ".sticky.top-3{visibility:hidden!important}"}` });
}
async function go(path, opts) {
  await page.goto(BASE + path);
  await tidy(opts);
}

// A region spanning `parts` (scrolled into view, clamped to the viewport),
// with a marker per callout just outside its top-left corner, so it points
// at the control without covering its text.
async function shot(name, parts, callouts = [], pad = 14) {
  const first = loc(parts[0]);
  await first.waitFor({ timeout: 20_000 });
  const top = await first.evaluate((e) => e.getBoundingClientRect().top + window.scrollY);
  await page.evaluate((y) => window.scrollTo(0, Math.max(0, y - 40)), top);
  await page.waitForTimeout(450);
  const boxes = [];
  for (const p of parts) {
    const b = await loc(p).boundingBox();
    if (b) boxes.push(b);
  }
  const x0 = Math.max(0, Math.min(...boxes.map((b) => b.x)) - pad);
  const y0 = Math.max(0, Math.min(...boxes.map((b) => b.y)) - pad);
  const x1 = Math.min(VW, Math.max(...boxes.map((b) => b.x + b.width)) + pad);
  const y1 = Math.min(VH, Math.max(...boxes.map((b) => b.y + b.height)) + pad);
  const clip = { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
  const points = [];
  for (const c of callouts) {
    const b = await loc(c).boundingBox().catch(() => null);
    points.push(b ? { x: pct(b.x - 4 - clip.x, clip.width), y: pct(b.y - 4 - clip.y, clip.height) } : null);
  }
  await page.screenshot({ path: `${OUT}${name}.jpg`, type: "jpeg", quality: 80, clip });
  manifest[name] = { w: Math.round(clip.width), h: Math.round(clip.height), callouts: points };
  console.log(`shot ${name} ${Math.round(clip.width)}×${Math.round(clip.height)} markers ${points.filter(Boolean).length}/${callouts.length}`);
}

const want = (s) => !only || only === s;
const PAPER = new URL("../fixtures/test-paper.pdf", import.meta.url).pathname;

if (want("tray")) {
  await go("/match", { tray: true });
  const tray = 'nav[aria-label="MargaLink"]';
  await shot("tray", [tray], [`${tray} a[href="/"]`, `${tray} a[href="/home"]`, `${tray} a[href="/journals"]`, `${tray} a[href="/match"]`, `${tray} a[href="/write"]`, `${tray} a[href="/guide"]`, `${tray} a[href="/account"]`], 10);
}

if (want("journals")) {
  await go("/journals");
  await page.waitForSelector("ol > li");
  await page.fill('input[placeholder*="Nature"]', "soil");
  await page.waitForTimeout(400);
  await shot(
    "journals-search",
    ['div.clay:has(input[placeholder*="Nature"])', "ol > li:nth-child(6)"],
    ['input[placeholder*="Nature"]', "main select", "ol > li:first-child a, ol > li:first-child button", "ol > li .rounded-full"],
  );
  const href = await page.locator("ol > li a[href^='/journal/']").first().getAttribute("href");
  await go(href);
  await shot("journal-page", ["main h1", "main .sheet"], ['main a[href^="/write?journal="]', 'main a[href="/journals"]', "main .sheet dl > div:first-child", "main .sheet a.clay-chip"]);
}

if (want("match")) {
  await go("/match");
  const [fc] = await Promise.all([page.waitForEvent("filechooser"), page.getByText("Drop a PDF or DOCX").first().click()]);
  await fc.setFiles(PAPER);
  await page.waitForSelector("[data-testid=results] li", { timeout: 180_000 });
  await tidy();
  await shot("match-input", ["main section.clay"], ['[role="tablist"]', 'main button[aria-label^="Upload"]', 'main [role="status"] li:first-child']);
  await shot("match-read", ["[data-testid=what-we-read]"], ["[data-testid=what-we-read] p.font-serif", "[data-testid=refs-line]", "[data-testid=paper-topics]", "[data-testid=what-we-read] summary"]);
  const filters = page.locator("div.clay:has(> label select)").first();
  await shot("match-filters", [filters], [filters.locator("select").nth(0), filters.locator("select").nth(1), filters.locator("select").nth(2), filters.locator("label").nth(3), filters.locator("label").nth(4)]);
  await page.getByRole("button", { name: "Why this journal" }).first().click();
  const r1 = page.locator("[data-testid=results] > li").first();
  await shot("match-result", [r1], [r1.locator(".bead").first(), r1.locator("a, button").first(), r1.locator("[data-fit]"), r1.locator(".rounded-full.bg-accent-soft, .text-xs.text-ink-soft").first(), r1.getByRole("button", { name: "Hide why" }), r1.locator('a[href^="/write"]'), r1.locator("[data-testid=why]")]);
  await shot("match-format", ['section.sheet:has(h2:text("Format check"))'], ['section.sheet:has(h2:text("Format check")) dl > div:nth-child(1)', 'section.sheet:has(h2:text("Format check")) dl > div:nth-child(2)', 'section.sheet:has(h2:text("Format check")) dl > div:nth-child(4)']);
}

if (want("review")) {
  await go("/review");
  await page.evaluate(() => localStorage.removeItem("margalink-review-uses"));
  const [fc] = await Promise.all([page.waitForEvent("filechooser"), page.getByText("Drop a PDF or DOCX").first().click()]);
  await fc.setFiles(PAPER);
  await page.waitForSelector("text=Loaded test-paper.pdf", { timeout: 20_000 });
  await page.getByRole("button", { name: /^JAMA/ }).click();
  await tidy();
  const step = (t) => `main section.clay:has(h2:text("${t}"))`;
  await shot("review-attach", [step("Attach your paper")], ['main button[aria-label^="Upload"]', "text=Loaded test-paper.pdf"]);
  await shot("review-journal", [step("Choose a journal")], [page.getByRole("button", { name: /^JAMA/ }), page.getByRole("button", { name: /^IEEE Access/ }), page.getByTestId("no-journal"), `${step("Choose a journal")} .sheet`]);
  await page.locator('[data-testid="review-outline"] summary').click();
  await page.waitForTimeout(300);
  const s3 = step("Get it reviewed");
  await shot("review-depth", [`${s3} .grid:has([aria-pressed])`, `${s3} button.clay-primary`], [page.getByRole("button", { name: /^Quick/ }), page.getByRole("button", { name: /^Standard/ }), page.getByRole("button", { name: /^Thorough/ }), '[data-testid="review-outline"] select', '[data-testid="review-outline"] #outline-add-heading', '[data-testid="review-notes"]', `${s3} button.clay-primary`]);
  await page.getByRole("button", { name: /^Get a standard review by Claude \d+ M coins$/ }).click();
  await page.waitForSelector('[role="alertdialog"]');
  await shot("review-consent", ['[role="alertdialog"]'], ['[role="alertdialog"] p.text-away', '[role="alertdialog"] p.font-serif', '[data-testid="review-price"]', "text=Send it and review"]);
  await page.getByLabel(/I agree to send this text to Anthropic/).check();
  await page.click("text=Send it and review");
  await page.waitForSelector('[data-testid="review-coverage"]', { timeout: 60_000 });
  await page.waitForFunction(() => !document.querySelector('[data-testid="review-progress"]'), null, { timeout: 60_000 });
  const res = page.locator('[data-testid="review-report"]');
  await shot("review-result", [res.locator('[data-testid="review-overview"]')], [res.locator('[data-testid="review-overview"] .rounded-full').first(), res.locator('[data-testid="review-fix-first"] > p'), res.locator('[data-testid="review-fix-first"] li').first(), res.locator("button:text('Download')")]);
  await shot("review-result-more", [res.locator('[data-testid="review-sections"]'), res.locator('[data-testid="review-coverage"]')], [res.locator('[data-testid="review-sections"] details').first(), res.locator("[data-finding]").first(), res.locator('[data-testid="review-coverage"]')]);
  await page.evaluate(() => localStorage.removeItem("margalink-review-uses"));
}

if (want("figures")) {
  await go("/figures");
  const [fc] = await Promise.all([page.waitForEvent("filechooser"), page.getByText("Drop a CSV or XLSX").first().click()]);
  await fc.setFiles(new URL("../fixtures/messy.csv", import.meta.url).pathname);
  await page.waitForSelector('[data-testid="preview-table"]', { timeout: 20_000 });
  await tidy();
  const step = (t) => `main section.clay:has(h2:text("${t}"))`;
  await shot("figures-prep", [step("Check how it was read")], [page.getByLabel("Column separator"), page.getByLabel("Header row"), page.getByLabel("Decimal mark"), page.getByLabel("Thousands separator"), page.getByLabel("Date order"), page.getByLabel("Missing-value markers"), `${step("Check how it was read")} summary`, 'select[aria-label^="Type of"]', '[data-testid="preview-table"] tbody']);
  await page.click('[data-template="box"]');
  await page.waitForSelector('[data-testid="figure-image"]', { timeout: 180_000 });
  await page.waitForFunction(() => document.querySelector('[data-testid="figure-preview"]')?.getAttribute("data-busy") === "false", null, { timeout: 120_000 });
  await shot("figures-describe", [step("Describe it to Claude…")], [page.getByLabel("Describe the figure"), page.getByLabel(/Also send group labels/), page.getByRole("button", { name: "Ask Claude for a figure" }), page.getByRole("button", { name: "Ask for a custom tweak (code)" }), `${step("Describe it to Claude…")} summary`]);
  await shot("figures-gallery", ['main section.clay:has(h2:text("…or start from a template")) h2', '[data-template]:nth-child(4)'], ['[data-template="box"]', '[data-template="scatter"]']);
  await shot("figures-style", ['[data-testid="style-bar"]', '[role="tablist"][aria-label="Panels"]'], [page.getByLabel("Journal style"), page.getByLabel("Figure size"), page.getByLabel("Rows"), '[data-testid="style-bar"] input[type=checkbox]', '[role="tablist"][aria-label="Panels"] [role="tab"]', page.getByRole("button", { name: "Add panel" })]);
  const pe = '[data-testid="panel-editor"]';
  await shot("figures-panel", [`${pe} > div:first-child`, page.getByLabel("Panel title")], [page.getByRole("button", { name: "Box", exact: true }), page.getByLabel("Column for x"), page.getByLabel("Column for y"), page.getByLabel("Panel title")]);
  await shot("figures-panel-sections", [`${pe} details >> nth=0`, `${pe} details >> nth=-1`], [`${pe} details:nth-of-type(1) summary`, `${pe} summary:text("Statistics")`, `${pe} summary:has-text("Annotations")`]);
  await shot("figures-preview", ['[data-testid="figure-preview"]', '[data-testid="export-bar"]'], ['[data-testid="figure-image"]', "text=Rendered on this device", '[data-testid="export-bar"] label:has-text("PNG")', '[data-testid="export-bar"] select', page.getByRole("button", { name: "Export", exact: true }), page.getByRole("button", { name: "Add to a paper" })]);
}

if (want("write")) {
  await page.goto(`${BASE}/templates/templates.json`);
  await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    await root.removeEntry("margalink-write", { recursive: true }).catch(() => {});
    for (const k of ["margalink-write-tips", "margalink-write-view", "margalink-write-files", "margalink-write-autocompile"]) localStorage.removeItem(k);
  });
  await go("/write");
  await page.click('[data-template="article"]');
  await page.waitForSelector('[data-testid="latex-editor"] .cm-content');
  await page.click("text=← All projects");
  await page.waitForSelector('[data-testid="project-list"]');
  await tidy();
  await shot("write-list", ['main section.clay:has(h2:text("Your projects"))', 'main section.clay:has(h2:text("Start a new paper"))'], ['[data-testid="project-list"] li button', '[data-testid="project-list"] li .clay-chip', '[data-template="article"]', '[data-template="ieeetran"]', "main ul a.clay-chip", page.getByRole("button", { name: /Import a \.zip/ })]);
  await page.locator('[data-testid="project-list"] li button').first().click();
  await page.waitForSelector('[data-testid="latex-editor"] .cm-content');
  await tidy();
  await page.waitForTimeout(800);
  const ws = '[data-testid="workspace"]';
  await shot("write-workspace", [ws], ["text=← All projects", `${ws} h2`, 'button[aria-label="Target journal"]', '[role="group"][aria-label="Tools"]', '[role="group"][aria-label="View"]', page.getByRole("button", { name: "Compile", exact: true }), 'button[aria-label="Commands"]', '[role="tablist"][aria-label="Files or outline"]', '[role="toolbar"][aria-label="Formatting"]', '[data-testid="latex-editor"]', '[data-testid="tips"]', '[data-testid="compile-status"]'], 0);
  const bar = '[role="toolbar"][aria-label="Formatting"]';
  await page.getByRole("button", { name: "Cite" }).click();
  await shot("write-formatbar", [bar, '[role="menu"][aria-label="Cite"]'], [page.getByRole("button", { name: "Bold" }), page.getByRole("button", { name: "Section" }), page.getByRole("button", { name: "Bulleted list" }), page.getByRole("button", { name: "Inline maths" }), page.getByRole("button", { name: "Cite" }), '[role="menu"][aria-label="Cite"] input', page.getByRole("button", { name: "Ref", exact: true }), page.getByRole("button", { name: "Figure", exact: true }), page.getByRole("button", { name: "Table" }), page.getByRole("button", { name: "Comment" })], 10);
  await page.keyboard.press("Escape");
  // Rewrite's menu over a selected sentence: the selection's price, then the tools.
  await page.click('[data-testid="latex-editor"] .cm-line:has-text("Start here")', { position: { x: 2, y: 6 } });
  await page.keyboard.press("Home");
  for (let i = 0; i < "Start here.".length; i++) await page.keyboard.press("Shift+ArrowRight");
  await page.locator(bar).getByRole("button", { name: "Rewrite" }).click();
  const rw = '[role="menu"][aria-label="Rewrite"]';
  await shot("write-rewrite", [bar, rw], [`${rw} [data-testid="rewrite-price"]`, page.getByRole("menuitem", { name: "Paraphrase" }), page.locator(rw).getByText("Change tone"), page.getByRole("menuitem", { name: "Clarity and flow" })]);
  await page.keyboard.press("Escape");
  // A short line, so End is the line's end (on a wrapped line it's the visual line's).
  await page.click('[data-testid="latex-editor"] .cm-line:has-text("section{Introduction}")');
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Earlier work \\cite{kn");
  await page.waitForSelector(".cm-tooltip-autocomplete", { timeout: 5000 });
  await shot("write-suggest", ['.cm-line:has-text("section{Introduction}")', ".cm-tooltip-autocomplete"], [".cm-line:has-text(\"Earlier work\")", ".cm-tooltip-autocomplete li"], 18);
  await page.keyboard.press("Escape");
  await page.getByRole("tab", { name: /Outline/ }).click();
  await page.waitForTimeout(300);
  await shot("write-outline", [`${ws} aside`], ['[role="tablist"][aria-label="Files or outline"] [aria-selected="true"]', '[data-testid="outline"] li:nth-child(2) button', `${ws} aside [data-testid="storage-banner"]`], 6);
  await page.getByRole("tab", { name: /Files/ }).click();
  await page.locator('[data-testid="file-tree"]').getByRole("button", { name: "New file" }).click();
  await page.locator('[data-testid="file-tree"]').getByLabel("New file name").fill("sections/intro.tex");
  await shot("write-files", [`${ws} aside`], [page.locator('[data-testid="file-tree"]').getByLabel("New file name"), page.locator('[data-testid="file-tree"]').getByRole("button", { name: "Upload files" }), `${ws} aside [data-testid="storage-banner"] button`], 6);
  await page.keyboard.press("Escape");
  await shot("write-status", [`${ws} > div:has([data-testid="compile-status"])`], ['[data-testid="compile-status"]', "text=words", "text=Saved", 'select[aria-label="Spelling"]', 'select[aria-label="TeX engine"]', '[role="switch"]', 'button[aria-label="Keyboard shortcuts"]'], 8);
  await page.click('button[aria-label="Target journal"]');
  const jw = page.getByRole("dialog", { name: "Journal" });
  await jw.getByLabel("Search journals").fill("soil");
  await page.waitForTimeout(500);
  await shot("write-window", [jw], [jw.getByLabel("Search journals"), jw.locator("li button, ul button").first(), jw.getByRole("button", { name: "Close" })], 0);
  await page.keyboard.press("Escape");
  await page.keyboard.press("ControlOrMeta+k");
  const pal = page.getByRole("dialog", { name: "Commands" });
  await pal.waitFor();
  await shot("write-palette", [pal], [pal.getByLabel("Search commands"), pal.locator('[role="option"]').first()], 0);
  await page.keyboard.press("Escape");
  await page.click('button[aria-label="Keyboard shortcuts"]');
  const sc = page.getByRole("dialog", { name: "Keyboard shortcuts" });
  await sc.waitFor();
  await shot("write-shortcuts", [sc], [], 0);
  await page.keyboard.press("Escape");
  // A Word document: the same tools, Word's own editor.
  await page.click("text=← All projects");
  // the smoke tests' paper, with a running head instead of the fixture's journal name
  const docx = unzipSync(await paperDocx());
  docx["word/header1.xml"] = strToU8(strFromU8(docx["word/header1.xml"]).replace(TEXT.header, "Sleep and recovery after cardiac surgery"));
  await page.setInputFiles('input[aria-label="Import a .zip, .tex or Word file"]', { name: "Sleep and recovery.docx", mimeType: "application/octet-stream", buffer: Buffer.from(zipSync(docx)) });
  const dw = '[data-testid="doc-workspace"]';
  await page.locator(`${dw} .layout-page`).first().waitFor({ timeout: 30_000 });
  await tidy();
  await page.waitForTimeout(1200);
  await shot("write-word", [dw], ["text=← All projects", '[role="group"][aria-label="Tools"]', page.getByRole("button", { name: "Download .docx" }), `${dw} [role="toolbar"]`, `${dw} .layout-page`, '[data-testid="save-state"]', 'select[aria-label="Spelling"]'], 0);
}

if (want("coins")) {
  // Signed out: signing in.
  await ctx.clearCookies();
  await go("/signin");
  const card = page.locator("main .sheet").first();
  // During the beta: its notice and Google only (the guide's notes follow BETA too).
  const signInMarks = BETA.on
    ? [card.getByText("Open to invited beta testers"), page.getByRole("button", { name: "Continue with Google" }), card.getByRole("link", { name: "What an account stores" })]
    : [page.getByRole("button", { name: "Continue with Google" }), page.getByLabel("Email me a sign-in link"), page.getByRole("button", { name: "Send the link" }), card.getByRole("link", { name: "What an account stores" })];
  await shot("coins-signin", [card], signInMarks);
  await ctx.addCookies([{ name: "ml_in", value: "1", url: BASE }]);
  // What things cost, and buying coins.
  await go("/pricing");
  const costs = "main section:has(#costs)";
  const prices = page.locator(`${costs} p.clay-well`);
  await shot("coins-costs", [`${costs} .sheet`, prices.last()], [`${costs} tbody tr:nth-child(2) th`, `${costs} tbody tr:first-child td:nth-child(3)`, `${costs} .sheet > p`, prices.first(), prices.last()]);
  await shot("coins-packs", ['[data-pack="S"]', '[data-pack="L"]'], ['[data-pack="S"] p.text-2xl', '[data-pack="S"] p.text-4xl', '[data-pack="S"] button']);
  await shot("coins-pro", ['[data-testid="pro"]'], ['[data-testid="pro"] p.text-2xl', page.getByRole("button", { name: "Get Pro monthly" }), page.getByRole("button", { name: "Get Pro yearly" })]);
  // The account page.
  await ctx.route("**/api/account", (r) =>
    r.fulfill({
      json: {
        email: "you@university.edu",
        balance: 42,
        google: true,
        history: [
          { kind: "review", label: "Pre-submission review", delta: -6, at: Date.parse("2026-09-28T10:12:00Z") },
          { kind: "pack", label: "Coin pack", delta: 50, at: Date.parse("2026-09-27T16:40:00Z") },
          { kind: "figure_refund", label: "Refund: figure request failed", delta: 1, at: Date.parse("2026-09-26T09:05:00Z") },
          { kind: "figure", label: "Ask Claude (figure)", delta: -1, at: Date.parse("2026-09-26T09:05:00Z") },
          { kind: "welcome", label: "Welcome bonus", delta: 10, at: Date.parse("2026-09-25T08:00:00Z") },
        ],
      },
    }),
  );
  await go("/account");
  await page.waitForSelector("text=Welcome bonus");
  const coins = "main section:has(#coins)";
  await shot("coins-account", [coins], [`${coins} p.text-4xl`, `${coins} ol li:first-child`, `${coins} ol li:nth-child(3)`, `${coins} a:has-text("Buy coins")`]);
}

writeFileSync(MANIFEST, JSON.stringify(manifest, null, 1) + "\n");
await ctx.close();
if (!only) rmSync(PROFILE, { recursive: true, force: true });
console.log("wrote", Object.keys(manifest).length, "shots");
