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
page.on("pageerror", (err) => consoleErrors.push(`pageerror: ${err.message}`));
const bodyRequests = [];
page.on("request", (r) => {
  if (r.postData()) bodyRequests.push(`${r.method()} ${r.url()}`);
});
page.on("dialog", (d) => void d.accept());

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

await page.goto("http://localhost:3000/write");
// Start from an empty project list (OPFS survives in the persistent profile).
await page.evaluate(async () => {
  const root = await navigator.storage.getDirectory();
  await root.removeEntry("margalink-write", { recursive: true }).catch(() => {});
});
await page.reload();
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

check(`no request carried a body${bodyRequests.length ? `: ${bodyRequests.join(", ")}` : ""}`, bodyRequests.length === 0);
check(`no page errors${consoleErrors.length ? `: ${consoleErrors.join(" | ")}` : ""}`, consoleErrors.length === 0);

await context.close();
process.exit(failed ? 1 : 0);
