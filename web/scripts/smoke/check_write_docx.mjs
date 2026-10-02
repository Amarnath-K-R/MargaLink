// Dev-only: Word documents in /write, end to end against a running dev
// server (port 3000). The documents are made by scripts/fixtures/docx_fixtures.mjs.
//   Import a .docx and a .dotx; .doc and .docm are refused with what to do.
//   Typing saves; clicking around alone doesn't; undo works across a save;
//   the text survives a reload and leaving right after typing; Download .docx
//   gives the edited document with the template's styles untouched; a
//   second tab is read-only; a backup comes back as a Word project.
//   No page errors, no request carries a body, nothing leaves our origin.
//   node scripts/smoke/check_write_docx.mjs
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { unzipSync, strFromU8 } from "fflate";
import { asMacroDocument, asTemplate, docText, oldWordDoc, paperDocx, part, TEXT } from "../fixtures/docx_fixtures.mjs";

const O = "http://localhost:3000";
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1400, height: 900 }, acceptDownloads: true });
const page = await context.newPage();
const problems = [];
const watch = (p) => {
  p.on("pageerror", (e) => problems.push(`pageerror: ${e.message.slice(0, 160)}`));
  p.on("console", (m) => m.type() === "error" && !/Failed to load resource/.test(m.text()) && problems.push(`console: ${m.text().slice(0, 160)}`));
  p.on("request", (r) => {
    if (r.postData()) problems.push(`a request with a body: ${r.method()} ${r.url()}`);
    if (!/^(https?:\/\/localhost:3000|data:|blob:)/.test(r.url())) problems.push(`left the origin: ${r.url().slice(0, 120)}`);
  });
};
watch(page);
page.on("dialog", (d) => void d.accept());

let failed = false;
const check = (label, ok) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${label}`);
  if (!ok) failed = true;
};

const docx = await paperDocx();
const IMPORT = 'input[aria-label="Import a .zip, .tex or .docx file"]';
const DOCX_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const importFile = (p, name, bytes, type = DOCX_TYPE) => p.setInputFiles(IMPORT, { name, mimeType: type, buffer: Buffer.from(bytes) });
const projectId = (p) => new URL(p.url()).searchParams.get("p");
// The document as saved in this browser (OPFS), not as the editor shows it.
// Retried: Chrome swaps a file into place as a write closes, and a read in
// that instant finds nothing (the app never reads while it writes).
const stored = async (p, id) => {
  for (let i = 0; ; i++) {
    try {
      return await storedOnce(p, id);
    } catch (err) {
      if (i >= 5 || !/NotFoundError/.test(String(err))) throw err;
      await new Promise((r) => setTimeout(r, 150));
    }
  }
};
const storedOnce = (p, id) =>
  p.evaluate(async (id) => {
    const dir = await (await (await navigator.storage.getDirectory()).getDirectoryHandle("margalink-write")).getDirectoryHandle(id);
    const bytes = new Uint8Array(await (await (await dir.getFileHandle("paper.docx")).getFile()).arrayBuffer());
    return { b64: btoa(Array.from(bytes, (c) => String.fromCharCode(c)).join("")), updatedAt: JSON.parse(await (await (await dir.getFileHandle("project.json")).getFile()).text()).updatedAt };
  }, id);
const storedText = async (p, id) => docText(Buffer.from((await stored(p, id)).b64, "base64"));
const bodyText = (p) => p.locator('[data-testid="doc-editor"] .layout-page');
// Click at the end of a (one-line) paragraph as drawn on the page.
const clickInto = async (p, text) => {
  const span = bodyText(p).getByText(text.slice(0, 30)).first();
  await span.scrollIntoViewIfNeeded();
  const box = await span.boundingBox();
  await p.mouse.click(box.x + box.width - 1, box.y + box.height / 2);
};
const shown = (p, re) => p.getByText(re).first().waitFor({ timeout: 5000 }).then(() => true, () => false);
// Waits for something to become true (a save landing on disk), up to `ms`.
const eventually = async (fn, ms = 8000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await fn()) return true;
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
};
const storedHas = (p, id, text) => eventually(async () => (await storedText(p, id)).includes(text));

// --- an empty project list (OPFS is per profile; cleared from a plain same-origin file) ---
await page.goto(`${O}/templates/templates.json`);
await page.evaluate(async () => (await navigator.storage.getDirectory()).removeEntry("margalink-write", { recursive: true }).catch(() => {}));
await page.goto(`${O}/write`);
await page.waitForSelector("text=Write your paper.");

// --- refused: the old format and macros, each with what to do; nothing is created ---
await importFile(page, "old paper.doc", oldWordDoc(), "application/msword");
check(".doc is refused with what to do", await shown(page, /old \.doc format/));
await importFile(page, "macros.docm", asMacroDocument(docx), "application/vnd.ms-word.document.macroEnabled.12");
check(".docm is refused (macros)", await shown(page, /contains macros/));
check("a refused file makes no project", (await page.locator('[data-testid="project-list"] li').count()) === 0);

// --- a .docx opens in the Word workspace, as written ---
await importFile(page, "Sleep paper.docx", docx);
await page.waitForSelector('[data-testid="doc-workspace"]');
await bodyText(page).getByText(TEXT.intro.slice(0, 30)).first().waitFor({ timeout: 20000 });
check("a .docx opens in the Word editor, its text on the page", true);
check("the template's header shows", (await page.locator('[data-testid="doc-editor"]').innerText()).includes(TEXT.header));
const id = projectId(page);
check("the project is kept with its document unchanged until edited", (await stored(page, id)).b64 === Buffer.from(docx).toString("base64"));

// --- clicking around changes nothing on disk ---
const untouched = await stored(page, id);
await clickInto(page, TEXT.methods);
await clickInto(page, TEXT.results);
await page.waitForTimeout(3500);
const after = await stored(page, id);
check("clicking around alone saves nothing", after.b64 === untouched.b64 && after.updatedAt === untouched.updatedAt);

// --- typing saves on its own ---
await clickInto(page, TEXT.intro);
await page.keyboard.type(" Typed in the smoke.");
check("typing is saved within a few seconds", await storedHas(page, id, "Typed in the smoke."));
check("the status line says it's saved", await eventually(async () => (await page.locator('[data-testid="save-state"]').textContent()) === "Saved"));

// --- undo works across a save ---
await page.keyboard.type(" Then undone.");
await storedHas(page, id, "Then undone.");
await page.keyboard.press(process.platform === "darwin" ? "Meta+z" : "Control+z");
const undone = await eventually(async () => !(await storedText(page, id)).includes("Then undone."));
check("undo works after an autosave", undone && (await storedText(page, id)).includes("Typed in the smoke."));

// --- the word count follows the document ---
check("the status line counts the document's words", /≈ \d+ words/.test(await page.locator('[data-testid="doc-workspace"]').innerText()));

// --- a reload keeps the text ---
await page.reload();
await bodyText(page).getByText(TEXT.intro.slice(0, 30)).first().waitFor({ timeout: 20000 });
check("a reload keeps the text", (await page.locator('[data-testid="doc-editor"]').innerText()).includes("Typed in the smoke."));

// --- leaving right after typing still saves ---
await clickInto(page, TEXT.results);
await page.keyboard.type(" Left at once.");
await page.click("text=← All projects");
await page.waitForSelector("text=Write your paper.");
check("leaving right after typing still saves", (await storedText(page, id)).includes("Left at once."));

// --- Download .docx: the edited document, the template's styles as they were ---
await page.click('[data-testid="project-list"] button:text-is("Sleep paper")');
await page.waitForSelector('[data-testid="doc-workspace"]');
await bodyText(page).getByText(TEXT.intro.slice(0, 30)).first().waitFor({ timeout: 20000 });
const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download .docx" }).click()]);
const got = new Uint8Array(readFileSync(await download.path()));
check(`the download is named for the project (${download.suggestedFilename()})`, download.suggestedFilename() === "Sleep-paper.docx");
check("the download has the edits", docText(got).includes("Typed in the smoke.") && docText(got).includes("Left at once."));
check("the template's styles are byte-identical", part(got, "word/styles.xml") === part(docx, "word/styles.xml"));
check("its header and footer kept their text", part(got, "word/header1.xml")?.includes(TEXT.header) && part(got, "word/footer1.xml")?.includes(TEXT.footer));

// --- a second tab is read-only ---
const second = await context.newPage();
watch(second);
await second.goto(page.url());
await second.waitForSelector("text=open in another tab", { timeout: 15000 });
const beforeSecond = await storedText(second, id);
await clickInto(second, TEXT.methods).catch(() => {});
await second.keyboard.type(" stale words");
await second.waitForTimeout(3000);
check("a second tab on the same project is read-only", (await storedText(second, id)) === beforeSecond && !(await second.locator('[data-testid="doc-editor"]').innerText()).includes("stale words"));
await second.close();

// --- a backup comes back as a Word project ---
await page.click("text=← All projects");
await page.waitForSelector("text=Write your paper.");
const [backup] = await Promise.all([page.waitForEvent("download"), page.locator('[data-testid="project-list"] li', { hasText: "Sleep paper" }).getByRole("button", { name: "Download backup" }).click()]);
await page.setInputFiles(IMPORT, { name: "Sleep paper backup.zip", mimeType: "application/zip", buffer: readFileSync(await backup.path()) });
await page.waitForSelector('[data-testid="doc-workspace"]');
await bodyText(page).getByText(TEXT.intro.slice(0, 30)).first().waitFor({ timeout: 20000 });
check("a Word project's backup imports as a Word project", (await page.locator('[data-testid="doc-editor"]').innerText()).includes("Left at once."));

// --- a template (.dotx) opens as a document ---
await page.click("text=← All projects");
await page.waitForSelector("text=Write your paper.");
await importFile(page, "Journal template.dotx", asTemplate(docx), "application/vnd.openxmlformats-officedocument.wordprocessingml.template");
await page.waitForSelector('[data-testid="doc-workspace"]');
const dotxId = projectId(page);
const dotxStored = Buffer.from((await stored(page, dotxId)).b64, "base64");
check("a .dotx opens as a document", /wordprocessingml\.document\.main\+xml/.test(strFromU8(unzipSync(dotxStored)["[Content_Types].xml"])));
check("Word projects are marked as such in the list", await (async () => {
  await page.click("text=← All projects");
  await page.waitForSelector("text=Write your paper.");
  return (await page.locator('[data-testid="project-list"] li', { hasText: "Journal template" }).innerText()).includes("Word");
})());

check(`no page errors, no request bodies, nothing off our origin${problems.length ? `: ${problems.slice(0, 5).join(" | ")}` : ""}`, problems.length === 0);
await browser.close();
process.exit(failed ? 1 : 0);
