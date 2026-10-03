// Dev-only: spelling and grammar in /write, on this device, against a running
// dev server (port 3000). The engine (Harper, WebAssembly) is the only thing
// downloaded; no request carries a body; nothing leaves our origin.
//   LaTeX: a misspelling in the prose is marked, a citation key isn't; a fix
//   replaces it; Add to dictionary is kept with the paper (and survives a
//   reload); UK English accepts "colour"; Off clears the marks.
//   node scripts/smoke/check_writing.mjs
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const O = process.env.ORIGIN ?? "http://localhost:3000";
const SCRATCH = process.env.SMOKE_OUT ?? new URL("../../.smoke/", import.meta.url).pathname;
mkdirSync(SCRATCH, { recursive: true });
const context = await chromium.launchPersistentContext(`${SCRATCH}/writing-profile`, { viewport: { width: 1400, height: 900 } });
const page = context.pages()[0] ?? (await context.newPage());
const problems = [];
const engineGets = [];
page.on("pageerror", (e) => problems.push(`pageerror: ${e.message.slice(0, 160)}`));
page.on("console", (m) => m.type() === "error" && !/Failed to load resource/.test(m.text()) && problems.push(`console: ${m.text().slice(0, 160)}`));
page.on("request", (r) => {
  if (r.postData()) problems.push(`a request with a body: ${r.method()} ${r.url()}`);
  if (!r.url().startsWith(O) && !/^(data:|blob:)/.test(r.url())) problems.push(`left the origin: ${r.url().slice(0, 120)}`);
  if (/harper_wasm/.test(r.url())) engineGets.push(r.method());
});
page.on("dialog", (d) => void d.accept());

let failed = false;
const check = (label, ok) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${label}`);
  if (!ok) failed = true;
};
const eventually = async (fn, ms = 15000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await fn()) return true;
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
};
const editor = () => page.locator('[data-testid="latex-editor"] .cm-content');
const source = () => page.evaluate(() => document.querySelector('[data-testid="latex-editor"] .cm-content').cmView.view.state.doc.toString()).catch(() => editor().innerText());
const marked = (word) => page.locator(`[data-testid="latex-editor"] .cm-spell`, { hasText: word });
const projectMeta = () =>
  page.evaluate(async () => {
    const root = await (await navigator.storage.getDirectory()).getDirectoryHandle("margalink-write");
    for await (const [, dir] of root.entries()) return JSON.parse(await (await (await dir.getFileHandle("project.json")).getFile()).text());
  });
// Hover a marked word and click one of its fixes. The marks are checked
// again half a second after each edit, and the new set closes a card that
// opened just before it: a person pauses, so the helper waits a moment and
// hovers again if the card closed under it.
const fix = async (word, action) => {
  const button = page.locator(".cm-tooltip-lint .cm-diagnosticAction", { hasText: action }).first();
  for (let tries = 0; ; tries++) {
    await page.waitForTimeout(800);
    await page.mouse.move(5, 5);
    await marked(word).first().hover();
    if (await button.waitFor({ timeout: 3000 }).then(() => true, () => tries >= 3)) break;
  }
  await button.click();
};

// --- a new LaTeX paper (OPFS cleared from a plain same-origin file) ---
await page.goto(`${O}/templates/templates.json`);
await page.evaluate(async () => (await navigator.storage.getDirectory()).removeEntry("margalink-write", { recursive: true }).catch(() => {}));
await page.goto(`${O}/write`);
await page.click('[data-template="article"]');
await editor().waitFor();
await page.click('[data-testid="latex-editor"] .cm-line:has-text("Start here")');
await page.keyboard.press("End");
await page.keyboard.press("Enter");
await page.keyboard.type("The paticipants slept badly~\\cite{misspeled} and we used actigraphy. The colour was odd.");

// --- marks: the prose, not the markup ---
check("a misspelling in the prose is marked", await marked("paticipants").first().waitFor({ timeout: 30000 }).then(() => true, () => false));
check("a citation key isn't", (await marked("misspeled").count()) === 0);
check("spelling marks stay out of the gutter", (await page.locator('[data-testid="latex-editor"] .cm-lint-marker').count()) === 0);
check("the status line counts what's marked", /\d+ to check/.test(await page.locator('[data-testid="spelling-count"]').innerText().catch(() => "")));

// --- a fix replaces the word ---
await fix("paticipants", "participants");
check("a fix replaces the word", await eventually(async () => (await source()).includes("The participants slept")));

// --- the paper's own words: kept with the paper, and after a reload ---
await fix("actigraphy", "Add to dictionary");
check("Add to dictionary unmarks the word", await eventually(async () => (await marked("actigraphy").count()) === 0));
check("and keeps it with the paper", await eventually(async () => (await projectMeta())?.spelling?.words?.includes("actigraphy")));
await page.reload();
await editor().waitFor();
await page.waitForTimeout(3000);
check("after a reload it's still not marked", (await marked("actigraphy").count()) === 0 && (await projectMeta())?.spelling?.words?.includes("actigraphy"));

// --- the paper's English ---
check("US English marks \"colour\"", await marked("colour").first().waitFor({ timeout: 20000 }).then(() => true, () => false));
await page.selectOption('select[aria-label="Spelling"]', "gb");
check("UK English accepts it", await eventually(async () => (await marked("colour").count()) === 0));
check("and the choice is kept with the paper", (await projectMeta())?.spelling?.dialect === "gb");

// --- off ---
await page.keyboard.type(" Anotherr.");
await page.selectOption('select[aria-label="Spelling"]', "off");
check("Off clears every mark", await eventually(async () => (await page.locator('[data-testid="latex-editor"] .cm-spell, [data-testid="latex-editor"] .cm-grammar').count()) === 0));

check(`the engine was downloaded with GETs only (${engineGets.length})`, engineGets.length >= 1 && engineGets.every((m) => m === "GET"));
check(`no page errors, no request bodies, nothing off our origin${problems.length ? `: ${problems.slice(0, 5).join(" | ")}` : ""}`, problems.length === 0);
await context.close();
process.exit(failed ? 1 : 0);
