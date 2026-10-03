// Dev-only: spelling and grammar in /write, on this device, against a running
// dev server (port 3000). The engine (Harper, WebAssembly) is the only thing
// downloaded; no request carries a body; nothing leaves our origin.
//   LaTeX: a misspelling in the prose is marked, a citation key isn't; a fix
//   replaces it; Add to dictionary is kept with the paper (and survives a
//   reload) and can be taken out again; Ignore lasts across the paper's
//   files; UK English accepts "colour"; Off clears the marks; an engine that
//   can't load says so.
//   Word: misspellings in a document are marked without changing the stored
//   file; clicking into one opens its fixes, Alt+Enter reaches them from the
//   keyboard and Escape goes back; typing doesn't pop a card up; a fix is
//   saved; Add to dictionary is kept with the paper; Off clears the marks.
//   node scripts/smoke/check_writing.mjs
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { Document, Packer, Paragraph } from "docx";
import { docText } from "../fixtures/docx_fixtures.mjs";

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
await page.keyboard.type("The paticipants slept badly~\\cite{misspeled} and we used actigraphy. The colour was odd. Wrting is hard.");

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
const latexUrl = page.url();

// --- the hover card names the problem, not "spelling"; Ignore lasts across the paper's files
await page.mouse.move(5, 5);
await marked("Wrting").first().hover();
await page.locator(".cm-tooltip-lint").first().waitFor({ timeout: 5000 }).catch(() => {});
check("the hover card carries no source label", (await page.locator(".cm-tooltip-lint").count()) > 0 && (await page.locator(".cm-tooltip-lint .cm-diagnosticSource").count()) === 0);
await fix("Wrting", "Ignore");
check("Ignore unmarks the word", await eventually(async () => (await marked("Wrting").count()) === 0));
await page.click('[data-testid="file-tree"] >> text=refs.bib').catch(() => page.click("text=refs.bib"));
await page.waitForTimeout(800);
await page.click('[data-testid="file-tree"] >> text=main.tex').catch(() => page.click("text=main.tex"));
await editor().waitFor();
await page.waitForTimeout(2500);
check("and still after switching files", (await marked("Wrting").count()) === 0 && (await marked("colour").count()) > 0);

// --- the paper's words can be taken out again
await page.click("summary:has-text('1 added word')");
await page.click('button[aria-label="Remove actigraphy"]');
check("a word taken out of the dictionary is marked again", await eventually(async () => (await marked("actigraphy").count()) > 0));
check("and is gone from the paper's words", await eventually(async () => !(await projectMeta())?.spelling?.words?.includes("actigraphy")));

// --- the paper's English ---
check("US English marks \"colour\"", await marked("colour").first().waitFor({ timeout: 20000 }).then(() => true, () => false));
await page.selectOption('select[aria-label="Spelling"]', "gb");
check("UK English accepts it", await eventually(async () => (await marked("colour").count()) === 0));
check("and the choice is kept with the paper", (await projectMeta())?.spelling?.dialect === "gb");

// --- off ---
await page.keyboard.type(" Anotherr.");
await page.selectOption('select[aria-label="Spelling"]', "off");
check("Off clears every mark", await eventually(async () => (await page.locator('[data-testid="latex-editor"] .cm-spell, [data-testid="latex-editor"] .cm-grammar').count()) === 0));

// --- Word: the same checker, marks painted on the page ---
const wordFile = Buffer.from(
  await Packer.toBuffer(new Document({ sections: [{ children: [new Paragraph("Sleep after surgery was studyed in older patients."), new Paragraph("We used actigraphy for the measurments.")] }] })),
);
await page.click("text=← All projects");
await page.waitForSelector("text=Write your paper.");
await page.setInputFiles('input[aria-label="Import a .zip, .tex or Word file"]', { name: "Spelling doc.docx", mimeType: "application/octet-stream", buffer: wordFile });
await page.waitForSelector('[data-testid="doc-workspace"]');
const docId = new URL(page.url()).searchParams.get("p");
// Retried: a save swaps the file into place, and a read in that instant finds nothing.
const storedDoc = async () => {
  for (let i = 0; ; i++) {
    try {
      return await storedDocOnce();
    } catch (err) {
      if (i >= 5 || !/NotFoundError/.test(String(err))) throw err;
      await new Promise((r) => setTimeout(r, 150));
    }
  }
};
const storedDocOnce = () =>
  page.evaluate(async (id) => {
    const dir = await (await (await navigator.storage.getDirectory()).getDirectoryHandle("margalink-write")).getDirectoryHandle(id);
    const bytes = new Uint8Array(await (await (await dir.getFileHandle("paper.docx")).getFile()).arrayBuffer());
    return { b64: btoa(Array.from(bytes, (c) => String.fromCharCode(c)).join("")), meta: JSON.parse(await (await (await dir.getFileHandle("project.json")).getFile()).text()) };
  }, docId);
const wordMarks = () => page.locator('[data-testid="doc-editor"] .folio-ai-suggestion').count();
check("Word: misspellings are marked on the page", await eventually(async () => (await wordMarks()) >= 2, 30000));
const untouched = await storedDoc();
check("marking changes nothing in the stored document", untouched.b64 === wordFile.toString("base64") && (await page.locator('[data-testid="save-state"]').textContent()) === "Saved");
// Click inside a word as drawn on the page (or just after it).
const clickWord = async (word, after = false) => {
  const box = await page.evaluate(([word, after]) => {
    for (const el of document.querySelectorAll('[data-testid="doc-editor"] .layout-page span')) {
      const node = [...el.childNodes].find((n) => n.nodeType === 3 && n.textContent.includes(word));
      if (!node) continue;
      const r = document.createRange();
      const i = node.textContent.indexOf(word);
      r.setStart(node, after ? i + word.length - 1 : i + 2);
      r.setEnd(node, after ? i + word.length : i + 3);
      const b = r.getBoundingClientRect();
      return { x: after ? b.right - 1 : b.left + b.width / 2, y: b.top + b.height / 2 };
    }
    return null;
  }, [word, after]);
  await page.mouse.click(box.x, box.y);
};
const card = page.locator('[data-testid="spelling-card"]');
const count = () => page.locator('[data-testid="spelling-count"]').innerText().catch(() => "");
const focusIn = (sel) => page.evaluate((sel) => !!document.activeElement?.closest(sel), sel);
await clickWord("studyed");
check("clicking into a marked word opens its fixes", await card.waitFor({ timeout: 5000 }).then(() => true, () => false));
await page.keyboard.press("Alt+Enter");
check("Alt+Enter moves the keyboard to the fixes", await focusIn('[data-testid="spelling-card"]'));
await page.keyboard.press("Escape");
check("Escape closes them, back in the document", (await card.count()) === 0 && (await focusIn('[data-testid="doc-editor"]')));
await clickWord("studyed");
await card.getByRole("button", { name: "studied" }).click();
check("a fix is saved in the document", await eventually(async () => docText(Buffer.from((await storedDoc()).b64, "base64")).includes("was studied in"), 10000));
await page.waitForTimeout(1500);
check("and the card doesn't open again for the fixed word", (await card.count()) === 0);
check(`two marks left (${await count()})`, await eventually(async () => (await count()) === "2 to check", 10000));
// typing a misspelling, then pausing, doesn't pop a card up under the caret
await clickWord("patients.", true); // the editor has no End key
await page.keyboard.type(" Sleeep well.");
check(`a new misspelling is marked (${await count()})`, await eventually(async () => (await count()) === "3 to check", 10000));
check("without a card popping up while typing", (await card.count()) === 0);
// a fix from the keyboard
await clickWord("measurments");
await card.waitFor({ timeout: 5000 }).catch(() => {});
await page.keyboard.press("Alt+Enter");
await page.keyboard.press("Enter");
check("a fix from the keyboard is saved", await eventually(async () => docText(Buffer.from((await storedDoc()).b64, "base64")).includes("the measurements"), 10000));
await page.waitForTimeout(1500);
await clickWord("actigraphy");
await card.getByRole("button", { name: "Add to dictionary" }).click();
check("Add to dictionary is kept with the Word paper", await eventually(async () => (await storedDoc()).meta.spelling?.words?.includes("actigraphy"), 10000));
check(`and the word is no longer marked (${await count()}, ${await wordMarks()} drawn)`, await eventually(async () => (await count()) === "1 to check", 10000));
await page.click("summary:has-text('1 added word')");
await page.click('button[aria-label="Remove actigraphy"]');
check(`a word taken out is marked again (${await count()})`, await eventually(async () => (await count()) === "2 to check", 10000));
await page.selectOption('select[aria-label="Spelling"]', "off");
check("Off clears the Word marks", await eventually(async () => (await wordMarks()) === 0));

// --- an engine that can't load says so (and the paper still works)
const broken = await context.newPage();
broken.on("pageerror", (e) => problems.push(`pageerror (no engine): ${e.message.slice(0, 160)}`));
await broken.route(/harper_wasm/, (r) => r.abort());
await broken.goto(latexUrl);
await broken.locator('[data-testid="latex-editor"] .cm-content').waitFor();
await broken.selectOption('select[aria-label="Spelling"]', "us"); // turned off above
check("no engine: the status line says spelling is unavailable", await broken.locator('[data-testid="spelling-count"]', { hasText: "Spelling unavailable" }).waitFor({ timeout: 20000 }).then(() => true, () => false));
await broken.close();

check(`the engine was downloaded with GETs only (${engineGets.length})`, engineGets.length >= 1 && engineGets.every((m) => m === "GET"));
check(`no page errors, no request bodies, nothing off our origin${problems.length ? `: ${problems.slice(0, 5).join(" | ")}` : ""}`, problems.length === 0);
await context.close();
process.exit(failed ? 1 : 0);
