// Dev-only: verify /write end to end against a running dev server.
//   New project from the IEEEtran template → compile → a PDF in the preview;
//   an undefined command gets a gutter marker and a diagnostics entry; removing
//   it compiles clean; the backup zip imports as a new project with the same
//   files; the storage banner is shown; no request carries a body.
//
// First run downloads the TeX engine (~140 MB, plus ~110 MB of packs for
// IEEEtran) from our R2 bucket into this profile's HTTP cache — later runs
// reuse it. That's why this uses a persistent context.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const SCRATCH = process.env.SMOKE_OUT ?? new URL("../.smoke/", import.meta.url).pathname;
mkdirSync(SCRATCH, { recursive: true });

const context = await chromium.launchPersistentContext(`${SCRATCH}/write-profile`, { viewport: { width: 1400, height: 900 } });
const page = context.pages()[0] ?? (await context.newPage());
const consoleErrors = [];
page.on("pageerror", (err) => {
  consoleErrors.push(`pageerror: ${err.message}`);
  if (process.env.STACKS) console.log("  pageerror here:", err.message.slice(0, 60));
});
const bodyRequests = [];
page.on("request", (r) => {
  if (r.postData()) bodyRequests.push(`${r.method()} ${r.url()}`);
});
let promptAnswer = ""; // what the next window.prompt() gets; confirms are accepted
page.on("dialog", (d) => void (d.type() === "prompt" ? d.accept(promptAnswer) : d.accept()));

let failed = false;
function check(label, ok) {
  console.log(`${ok ? "ok  " : "FAIL"} ${label}`);
  if (!ok) failed = true;
}

const COMPILE_TIMEOUT = Number(process.env.COMPILE_TIMEOUT ?? 300_000); // a cold cache downloads ~250 MB
const pdfBytes = () =>
  page.locator('[data-testid="pdf-frame"]').evaluate(async (f) => (f.src.startsWith("blob:") ? (await (await fetch(f.src)).arrayBuffer()).byteLength : 0));
const compiled = () =>
  page.waitForSelector('[data-testid="compile-status"]:has-text("Compiled.")', { timeout: COMPILE_TIMEOUT }).catch(async (err) => {
    await page.screenshot({ path: `${SCRATCH}/write-failed.png` });
    console.log("diagnostics:", (await page.locator('[data-testid="diagnostics"]').textContent())?.slice(0, 600));
    console.log("editor head:", (await page.locator('[data-testid="latex-editor"] .cm-content').textContent())?.slice(0, 300));
    throw err;
  });
const fileList = async () => (await page.locator('[data-testid="file-tree"] li > button:first-child').allTextContents()).map((s) => s.replace(" ★", "")).sort();

// Start from an empty project list (OPFS survives in the persistent profile) —
// cleared from a plain same-origin file, so the app isn't reading it meanwhile.
await page.goto("http://localhost:3000/templates/templates.json");
await page.evaluate(async () => {
  const root = await navigator.storage.getDirectory();
  await root.removeEntry("margalink-write", { recursive: true }).catch(() => {});
});
await page.goto("http://localhost:3000/write");
await page.waitForSelector("text=Write your paper.");
check("storage banner on the project list", (await page.locator('[data-testid="storage-banner"]').count()) === 1);

// --- new project, first compile ---
await page.click('[data-template="ieeetran"]');
await page.waitForSelector('[data-testid="latex-editor"] .cm-content');
check("editor opens main.tex's source", (await page.locator('[data-testid="latex-editor"] .cm-content').textContent()).includes("bare_jrnl.tex")); // line 2; CodeMirror renders only visible lines
await page.click("button:has-text('Compile')");
await compiled();
const size = await pdfBytes();
check(`PDF in the preview (${size} bytes > 10 KB)`, size > 10_000);

// --- an error on line 1 ---
await page.click('[data-testid="latex-editor"] .cm-content');
await page.keyboard.press("ControlOrMeta+Home");
await page.keyboard.type("\\undefinedcommand\n");
await page.keyboard.press("ControlOrMeta+s");
await page.waitForSelector('[data-testid="diagnostics"] button:has-text("Undefined control sequence")', { timeout: COMPILE_TIMEOUT });
check("gutter marker on the broken line", (await page.locator('[data-testid="latex-editor"] .cm-lint-marker-error').count()) >= 1);
check("diagnostics entry names it", (await page.locator('[data-testid="diagnostics"]').textContent()).includes("Undefined control sequence"));

// --- remove it, recompile clean ---
await page.keyboard.press("ControlOrMeta+Home");
await page.keyboard.press("Shift+ArrowDown");
await page.keyboard.press("Backspace");
await page.keyboard.press("ControlOrMeta+s");
await page.waitForFunction(() => !document.querySelector('[data-testid="diagnostics"]')?.textContent?.includes("Undefined control sequence"), null, { timeout: COMPILE_TIMEOUT });
await compiled();
check("clean again: no error markers", (await page.locator('[data-testid="latex-editor"] .cm-lint-marker-error').count()) === 0);
check("storage banner in the workspace", (await page.locator('[data-testid="storage-banner"]').count()) === 1);

// --- backup → import as a new project ---
const originalFiles = await fileList();
const [download] = await Promise.all([page.waitForEvent("download"), page.click('[data-testid="storage-banner"] button:has-text("Download backup")')]);
const zipPath = await download.path();
await page.click("text=← All projects");
await page.setInputFiles('input[aria-label="Import a zip"]', { name: "backup.zip", mimeType: "application/zip", buffer: (await import("node:fs")).readFileSync(zipPath) });
await page.waitForSelector('[data-testid="workspace"] h2:has-text("backup")');
await page.waitForFunction((n) => document.querySelectorAll('[data-testid="file-tree"] li').length === n, originalFiles.length);
check(`imported copy has the same files (${originalFiles.length})`, JSON.stringify(await fileList()) === JSON.stringify(originalFiles));
await page.click("text=← All projects");
check("two projects listed", (await page.locator('[data-testid="project-list"] li').count()) === 2);

// --- the imported copy compiles in a fresh session: a backup carries no pack
// list, so IEEEtran's missing fonts must trigger the all-packs retry ---
await page.reload();
await page.click('[data-testid="project-list"] button:text-is("backup")');
await page.waitForSelector('[data-testid="latex-editor"] .cm-content');
await page.click("button:has-text('Compile')");
await compiled();
check("imported copy compiles (retried with every pack)", (await pdfBytes()) > 10_000);

// --- a template that needs every pack, after a plain paper already started the engine ---
await page.reload();
await page.click('[data-template="article"]');
await page.waitForSelector('[data-testid="latex-editor"] .cm-content');
await page.click("button:has-text('Compile')");
await compiled();
await page.click("text=← All projects");
await page.click('[data-testid="project-list"] button:text-is("New IEEE Transactions (IEEEtran) paper")');
await page.waitForSelector('[data-testid="latex-editor"] .cm-content');
await page.click("button:has-text('Compile')");
await compiled();
check("IEEEtran compiles after a plain article in the same session", (await pdfBytes()) > 10_000);

// --- file operations don't lose or clobber anything ---
const tree = page.locator('[data-testid="file-tree"]');
promptAnswer = "IEEEtran.bst";
await tree.getByRole("button", { name: "New file" }).click();
await page.waitForSelector("text=IEEEtran.bst already exists");
check("New file refuses an existing name", true);

promptAnswer = "notes.tex";
await tree.getByRole("button", { name: "New file" }).click();
await page.waitForSelector('[data-testid="file-tree"] button[title="notes.tex"]');
await page.click('[data-testid="latex-editor"] .cm-content');
await page.keyboard.type("unsaved words");
await tree.getByRole("button", { name: "Delete notes.tex" }).click();
await page.waitForTimeout(1500); // past the autosave delay
await page.click("text=← All projects");
await page.click('[data-testid="project-list"] button:text-is("New IEEE Transactions (IEEEtran) paper")');
await page.waitForSelector('[data-testid="file-tree"] button[title="main.tex"]');
check("a deleted file stays deleted", (await page.locator('[data-testid="file-tree"] button[title="notes.tex"]').count()) === 0);

promptAnswer = "paper.tex";
await tree.getByRole("button", { name: "Rename main.tex" }).click();
await page.waitForSelector('[data-testid="file-tree"] button[title="paper.tex"]');
await page.click("button:has-text('Compile')");
await compiled();
check("renaming the main file keeps the project compiling", (await pdfBytes()) > 10_000);

// --- Ctrl+S pressed repeatedly: one compile, and Compile stays disabled while TeX runs ---
await page.evaluate(() => {
  window.__enabledWhileRunning = false;
  const status = document.querySelector('[data-testid="compile-status"]');
  new MutationObserver(() => {
    const btn = [...document.querySelectorAll("button")].find((b) => /^(Compile|Compiling…)$/.test(b.textContent.trim()));
    if (status.textContent.startsWith("Running") && btn && !btn.disabled) window.__enabledWhileRunning = true;
  }).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true });
});
await page.click('[data-testid="latex-editor"] .cm-content');
for (let i = 0; i < 3; i++) await page.keyboard.press("ControlOrMeta+s");
await page.waitForFunction(() => document.querySelector('[data-testid="compile-status"]')?.textContent !== "Compiled.", null, { timeout: 10_000 }).catch(() => {});
await compiled();
await page.waitForTimeout(3000); // any queued second compile would start running here
check("repeated Ctrl+S never re-enables Compile mid-run", !(await page.evaluate(() => window.__enabledWhileRunning)));

// --- hiding the tab saves at once (no 1 s wait) ---
await page.click('[data-testid="latex-editor"] .cm-content');
await page.keyboard.press("ControlOrMeta+Home");
await page.keyboard.type("% saved on hide\n");
await page.evaluate(() => {
  Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
  document.dispatchEvent(new Event("visibilitychange"));
});
await page.waitForTimeout(300);
const savedOnHide = await page.evaluate(async () => {
  const root = await (await navigator.storage.getDirectory()).getDirectoryHandle("margalink-write");
  for await (const [, dir] of root.entries()) {
    const meta = JSON.parse(await (await (await dir.getFileHandle("project.json")).getFile()).text());
    if (meta.main === "paper.tex") return (await (await dir.getFileHandle("paper.tex")).getFile()).text();
  }
  return "";
});
await page.evaluate(() => Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true }));
check("hiding the tab saves the latest edit", savedOnHide.startsWith("% saved on hide"));

// --- Insert figure is clearly unavailable while a binary file is open ---
await page.setInputFiles('input[aria-label="Upload files to this project"]', { name: "plot.png", mimeType: "image/png", buffer: Buffer.from("not really a png") });
await page.click('[data-testid="file-tree"] button[title="figures/plot.png"]');
check("Insert figure is disabled with a binary file open", await page.locator('select[aria-label="Insert figure"]').isDisabled());

check(`no request carried a body${bodyRequests.length ? `: ${bodyRequests.join(", ")}` : ""}`, bodyRequests.length === 0);
check(`no page errors${consoleErrors.length ? `: ${consoleErrors.join(" | ")}` : ""}`, consoleErrors.length === 0);

await context.close();

// --- the engine download fails (offline, r2.dev throttling): an error, not a
// forever "Loading TeX…" — in a fresh browser, so nothing is cached ---
{
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await ctx.route(/busytex\.wasm$/, (r) => r.abort());
  const p = await ctx.newPage();
  await p.goto("http://localhost:3000/write");
  await p.click('[data-template="article"]');
  await p.waitForSelector('[data-testid="latex-editor"] .cm-content');
  await p.click("button:has-text('Compile')");
  const reported = await p.waitForSelector("text=The TeX engine couldn't load", { timeout: 60_000 }).then(() => true, () => false);
  check("a failed engine download is reported, and Compile is usable again", reported && (await p.locator("button:has-text('Compile')").isEnabled()));
  await browser.close();
}

process.exit(failed ? 1 : 0);
