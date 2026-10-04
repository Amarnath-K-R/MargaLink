// Dev-only: Word documents in /write, end to end against a running dev
// server (port 3000). The documents are made by scripts/fixtures/docx_fixtures.mjs.
//   Import a .docx and a .dotx; .doc and .docm are refused with what to do.
//   Typing saves; clicking around alone doesn't; undo works across a save;
//   the text survives a reload and leaving right after typing; Download .docx
//   gives the edited document with the template's styles untouched; a
//   second tab is read-only; a backup comes back as a Word project.
//   The windows read the document as saved: Checks (an auto-numbered
//   reference list counted), Journal (no templates for Word), Match, and
//   Review through its consent (mocked API) to Jump to source, which
//   selects the quoted passage in the document. A figure from the Figures
//   window goes in at the cursor at the size it was drawn (89 mm), and
//   later saves don't store its picture twice. The editor's stylesheet,
//   still loaded after the project closes, doesn't restyle / or /review.
//   No page errors; only the review's requests carry a body, after consent;
//   nothing leaves our origin but the matching model's and the figure
//   engine's public files (cached in a persistent profile, as check_write.mjs).
//   node scripts/smoke/check_write_docx.mjs
//   ORIGIN=http://localhost:8789 node scripts/smoke/check_write_docx.mjs   # against a build
import { chromium } from "playwright";
import { mkdirSync, readFileSync } from "node:fs";
import { unzipSync, strFromU8 } from "fflate";
import { asMacroDocument, asTemplate, docText, oldWordDoc, paperDocx, part, TEXT } from "../fixtures/docx_fixtures.mjs";
import { mockAccount } from "./mock_account.mjs";
import { reviewAnswer } from "./mock_review.mjs";

// ORIGIN: another server, e.g. the production build under its real headers
// (wrangler pages dev out, from a folder without functions/, so no beta gate).
const O = process.env.ORIGIN ?? "http://localhost:3000";
const SCRATCH = process.env.SMOKE_OUT ?? new URL("../../.smoke/", import.meta.url).pathname;
mkdirSync(SCRATCH, { recursive: true });
const context = await chromium.launchPersistentContext(`${SCRATCH}/write-docx-profile`, { viewport: { width: 1400, height: 900 }, acceptDownloads: true });
const page = context.pages()[0] ?? (await context.newPage());
const problems = [];
let consented = false; // the review's consent was given: its requests may carry the paper's text
const reviewBodies = [];
const watch = (p) => {
  p.on("pageerror", (e) => problems.push(`pageerror: ${e.message.slice(0, 160)}`));
  p.on("console", (m) => m.type() === "error" && !/Failed to load resource/.test(m.text()) && problems.push(`console: ${m.text().slice(0, 160)}`));
  p.on("request", (r) => {
    if (r.postData()) {
      if (consented && /\/api\/review(\/start)?$/.test(r.url())) reviewBodies.push(r.url());
      else problems.push(`a request with a body: ${r.method()} ${r.url()}`);
    }
    // the matching model and its runtime: public files, fetched without a body
    const publicModel = /^https:\/\/(huggingface\.co|(?:[\w-]+\.)+hf\.co|cdn\.jsdelivr\.net)\//.test(r.url()) && r.method() === "GET";
    if (!r.url().startsWith(O) && !/^(data:|blob:)/.test(r.url()) && !publicModel) problems.push(`left the origin: ${r.url().slice(0, 120)}`);
  });
};
watch(page);
page.on("dialog", (d) => void d.accept());
const account = await mockAccount(context, { origin: O }); // the Review window's review is paid for
// Anything the Content-Security-Policy blocks is a console error, so a problem;
// except eval: the zip reader's util polyfill (is-generator-function) probes
// for generators with Function() inside a try, and falls back when it's refused.
await context.addInitScript(() => document.addEventListener("securitypolicyviolation", (e) => e.blockedURI !== "eval" && console.error(`CSP blocked ${e.blockedURI} (${e.violatedDirective})`)));
// The review's passes go to a mocked /api/review (scripts/smoke/mock_review.mjs). Never a real Anthropic call.
await context.route("**/api/review", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(reviewAnswer(route.request().postDataJSON())) }));

let failed = false;
const check = (label, ok) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${label}`);
  if (!ok) failed = true;
};

const docx = await paperDocx();
const IMPORT = 'input[aria-label="Import a .zip, .tex or Word file"]';
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
// The document as drawn, its lines joined (the page breaks lines where they wrap).
const shownText = async (p) => (await p.locator('[data-testid="doc-editor"]').innerText()).replace(/\s+/g, " ");
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
// The editor's stylesheet stays loaded after a Word project closes (Next keeps
// it): every element's computed style on / and /review, before any Word
// project opens, to compare with after one has (at the end).
const styles = () =>
  page.waitForLoadState("networkidle").then(() =>
    page.waitForTimeout(500).then(() =>
      page.evaluate(() => {
        const props = ["font-family", "font-size", "font-weight", "line-height", "letter-spacing", "color", "background-color", "margin-top", "margin-bottom", "padding-top", "padding-left", "border-top-width", "border-top-style", "border-radius", "display", "box-sizing", "outline-style", "caret-color", "text-transform"];
        // the visible elements (where a page's scripts and route wrappers sit
        // differs between a load and a client-side visit), in no order
        return [...document.querySelectorAll("body *")]
          .filter((e) => e.checkVisibility())
          .map((e) => `${e.tagName.toLowerCase()}.${String(e.className).slice(0, 40)} ${props.map((p) => getComputedStyle(e).getPropertyValue(p)).join(";")}`)
          .sort();
      }),
    ),
  );
await page.goto(`${O}/`);
const homeBefore = await styles();
await page.goto(`${O}/review`);
const reviewBefore = await styles();
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
check("the template's header shows", (await shownText(page)).includes(TEXT.header));
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

// --- a later save in another paragraph keeps what earlier saves wrote ---
await clickInto(page, TEXT.methods);
await page.keyboard.type(" And in methods.");
await storedHas(page, id, "And in methods.");
check("a save after an edit elsewhere keeps the earlier saved edits", (await storedText(page, id)).includes("Typed in the smoke."));

// --- ⌘S saves at once (not two seconds later) ---
await clickInto(page, TEXT.methods);
await page.keyboard.type(" Saved by key.");
await page.keyboard.press("ControlOrMeta+s");
check("⌘S saves at once", await eventually(async () => (await storedText(page, id)).includes("Saved by key."), 1200));

// --- edits made while a save runs, up to its last moment, are saved too (Folio's
// save forgets edits made while it ran, so its own record alone would lose them) ---
// The CPU is slowed so a save takes most of a second; opening a window starts
// one, and a numbered word goes in every 25 ms until the file is written.
await page.evaluate(() => {
  window.__realCreateWritable = FileSystemFileHandle.prototype.createWritable;
  FileSystemFileHandle.prototype.createWritable = function (...args) {
    if (this.name === "paper.docx") window.__saving = false;
    return window.__realCreateWritable.apply(this, args);
  };
});
const cpu = await context.newCDPSession(page);
await cpu.send("Emulation.setCPUThrottlingRate", { rate: 10 });
await clickInto(page, TEXT.results);
await page.keyboard.type(" Typing through a save:");
const typedDuring = await page.evaluate(
  () =>
    new Promise((done) => {
      const words = [];
      window.__saving = true;
      [...document.querySelectorAll('[role="group"][aria-label="Tools"] button')].find((b) => b.textContent.includes("Checks")).click(); // saves first
      const next = () => {
        if (!window.__saving) return done(words);
        words.push(`w${words.length + 1}`);
        document.execCommand("insertText", false, ` ${words.at(-1)}`);
        setTimeout(next, 25);
      };
      setTimeout(next, 0);
    }),
);
await page.getByRole("dialog", { name: "Checks" }).waitFor({ timeout: 60_000 });
await page.keyboard.press("Escape");
await page.waitForFunction(() => !document.querySelector("dialog[open]"));
await cpu.send("Emulation.setCPUThrottlingRate", { rate: 1 });
await page.evaluate(() => (FileSystemFileHandle.prototype.createWritable = window.__realCreateWritable));
check(
  `edits made while a save runs are saved too (${typedDuring.length} words typed during it)`,
  typedDuring.length > 0 && (await eventually(async () => (await storedText(page, id)).includes(`${typedDuring.join(" ")}`), 12000)),
);

// --- a save that fails says so; Download .docx then still has the latest edits; the next save clears it ---
await page.evaluate(() => {
  window.__realWrite = FileSystemWritableFileStream.prototype.write;
  FileSystemWritableFileStream.prototype.write = () => Promise.reject(new DOMException("The disk is full.", "QuotaExceededError"));
});
await clickInto(page, TEXT.methods);
await page.keyboard.type(" Not on disk.");
check("a failed save says so", await shown(page, /Couldn't save your last edit/));
const [failedDownload] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download .docx" }).click()]);
check("after a failed save, Download .docx has the latest edits", docText(readFileSync(await failedDownload.path())).includes("Not on disk."));
await page.evaluate(() => (FileSystemWritableFileStream.prototype.write = window.__realWrite));
await clickInto(page, TEXT.methods);
await page.keyboard.type(" On disk now.");
check(
  "the next save goes through and clears the message",
  (await storedHas(page, id, "On disk now.")) && (await storedText(page, id)).includes("Not on disk.") && (await eventually(async () => (await page.getByText(/Couldn't save your last edit/).count()) === 0, 3000)),
);

// --- ⌘-click on the logo opens home in a new tab and leaves the document open here ---
const [homeTab] = await Promise.all([context.waitForEvent("page", { timeout: 5000 }).catch(() => null), page.click('a[aria-label="MargaLink home"]', { modifiers: ["ControlOrMeta"] })]);
check("⌘-click on the logo opens home in a new tab", homeTab !== null && (await page.locator('[data-testid="doc-workspace"]').count()) === 1);
await homeTab?.close();

// --- the word count follows the document ---
check("the status line counts the document's words", /≈ \d+ words/.test(await page.locator('[data-testid="doc-workspace"]').innerText()));

// --- a reload keeps the text ---
await page.reload();
await bodyText(page).getByText(TEXT.intro.slice(0, 30)).first().waitFor({ timeout: 20000 });
const reloaded = await shownText(page);
check(`a reload keeps the text${reloaded.includes("Typed in the smoke.") ? "" : ` (shows: "${reloaded.slice(reloaded.indexOf("Short sleep"), reloaded.indexOf("Short sleep") + 140)}")`}`, reloaded.includes("Typed in the smoke."));

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
check("a second tab on the same project is read-only", (await storedText(second, id)) === beforeSecond && !(await shownText(second)).includes("stale words"));
await second.close();

// --- a backup comes back as a Word project ---
await page.click("text=← All projects");
await page.waitForSelector("text=Write your paper.");
const [backup] = await Promise.all([page.waitForEvent("download"), page.locator('[data-testid="project-list"] li', { hasText: "Sleep paper" }).getByRole("button", { name: "Download backup" }).click()]);
await page.setInputFiles(IMPORT, { name: "Sleep paper backup.zip", mimeType: "application/zip", buffer: readFileSync(await backup.path()) });
await page.waitForSelector('[data-testid="doc-workspace"]');
await bodyText(page).getByText(TEXT.intro.slice(0, 30)).first().waitFor({ timeout: 20000 });
check("a Word project's backup imports as a Word project", (await shownText(page)).includes("Left at once."));

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

// --- a document that can't be read: an error, and the windows say the document isn't open (no Compile button) ---
await page.evaluate(() => {
  window.__realGetFile = FileSystemFileHandle.prototype.getFile;
  FileSystemFileHandle.prototype.getFile = function () {
    return this.name === "paper.docx" ? Promise.reject(new DOMException("Unreadable.", "NotReadableError")) : window.__realGetFile.call(this);
  };
});
await page.locator('[data-testid="project-list"] li', { hasText: "Journal template" }).locator("button").first().click();
await page.waitForSelector('[data-testid="doc-workspace"]');
check("a document that can't be read says so", await shown(page, /couldn't be opened/));
await page.click('[role="group"][aria-label="Tools"] button:has-text("Checks")');
await page.getByRole("dialog", { name: "Checks" }).waitFor();
const sayNotOpen = await page.getByRole("dialog", { name: "Checks" }).getByText(/isn.t open/).waitFor({ timeout: 10000 }).then(() => true, () => false);
check("its windows say the document isn't open, with no Compile button", sayNotOpen && !/Compile/.test(await page.getByRole("dialog", { name: "Checks" }).innerText()));
await page.keyboard.press("Escape");
await page.evaluate(() => (FileSystemFileHandle.prototype.getFile = window.__realGetFile));
await page.click("text=← All projects");
await page.waitForSelector("text=Write your paper.");

// --- the windows read the document as saved ---
const window_ = (name) => page.getByRole("dialog", { name });
const openTool = async (name) => {
  await page.click(`[role="group"][aria-label="Tools"] button:has-text("${name}")`);
  await window_(name).waitFor();
};
const closeWindow = async () => {
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector("dialog[open]"));
};
await importFile(page, "Hub paper.docx", docx);
await page.waitForSelector('[data-testid="doc-workspace"]');
await bodyText(page).getByText(TEXT.intro.slice(0, 30)).first().waitFor({ timeout: 20000 });
const hubId = projectId(page);

// Checks: the document's counts, its auto-numbered references included; a window opened right after typing reads the typing
await clickInto(page, TEXT.methods);
await page.keyboard.type(" Opened at once.");
await openTool("Checks");
check("opening a window right after typing saves first", (await storedText(page, hubId)).includes("Opened at once."));
await page.waitForSelector('[data-testid="checks"] dl');
const checksText = await page.locator('[data-testid="checks"]').innerText();
check("Checks reads the Word document (word count)", /Word count/.test(checksText));
check(
  `an auto-numbered reference list is counted (${(await page.locator('[data-testid="checks"] dt:text-is("References (approximate)") + dd').textContent())?.trim()})`,
  (await page.locator('[data-testid="checks"] dt:text-is("References (approximate)") + dd').textContent())?.trim() === "2",
);
await closeWindow();
const beforeReopen = await stored(page, hubId);
await openTool("Checks");
await page.waitForSelector('[data-testid="checks"] dl');
await closeWindow();
check("reopening a window without edits saves nothing", (await stored(page, hubId)).updatedAt === beforeReopen.updatedAt);

// Journal: a target journal, and no template section (templates are LaTeX only)
const hasIndex = await page.evaluate(() => fetch("/index/meta.json").then((r) => r.ok, () => false));
await page.click('button[aria-label="Target journal"]');
await window_("Journal").waitFor();
if (hasIndex) {
  await window_("Journal").getByLabel("Search journals").fill("JAMA Neurology");
  await window_("Journal").getByRole("button", { name: /^JAMA Neurology/ }).click();
  check(
    "the Journal window sets the target journal",
    await page.waitForFunction(() => document.querySelector('button[aria-label="Target journal"]')?.textContent?.includes("JAMA Neurology"), null, { timeout: 10_000 }).then(() => true, () => false),
  );
}
check("the Journal window offers no LaTeX template for a Word project", (await window_("Journal").getByRole("heading", { name: "Template" }).count()) === 0);
await closeWindow();

// Match: the saved document against the index (the first run fetches the model)
if (hasIndex) {
  await openTool("Match");
  await window_("Match").getByRole("button", { name: "Find matching journals" }).click();
  check("Match ranks journals for the Word document", await window_("Match").locator("[data-testid=results] li").first().waitFor({ timeout: 180_000 }).then(() => true, () => false));
  await closeWindow();
} else console.log("skip the Journal search and Match (no index built)");

// Review: through the consent notice to results; Jump to source selects the quoted passage
check("no request carried a body before the review's consent", problems.every((p) => !p.startsWith("a request with a body")));
await openTool("Review");
const review = window_("Review");
await page.waitForFunction(
  () => {
    const w = document.querySelector('[data-testid="review-window"]');
    return !!w && (w.textContent.includes("(your target journal)") || [...w.querySelectorAll("button")].some((b) => b.textContent.startsWith("JAMA")));
  },
  null,
  { timeout: 30_000 },
);
if (!(await review.getByText("(your target journal)").count())) await review.getByRole("button", { name: /^JAMA/ }).click();
await review.getByRole("button", { name: /^Get a standard review by Claude \d+ M coins$/ }).click();
await review.locator('[role="alertdialog"]').waitFor();
check("the review's consent notice appears inside the window", /in \d+ (?:short )?requests/.test(await review.locator('[role="alertdialog"]').innerText()));
await review.getByLabel(/I agree to send this text to Anthropic/).check();
consented = true;
await review.getByText("Send it and review").click();
await review.locator('[data-testid="review-coverage"]').waitFor({ timeout: 60_000 });
await page.waitForFunction(() => !document.querySelector('[data-testid="review-progress"]'), null, { timeout: 60_000 });
// Sections with only minor points start collapsed: open the first one, as a person would, to reach its quotes.
await review.locator("[data-testid=review-sections] details:not([open]) > summary").first().click({ timeout: 2000 }).catch(() => {});
const jumps = review.getByRole("button", { name: "Jump to source" });
check("the review's quotes offer Jump to source", (await jumps.count()) >= 1);
const quote = (await review.locator("li:has(button:text-is('Jump to source'))").first().innerText()).match(/“([^”]+)”/)?.[1] ?? "";
await jumps.first().click();
check("Jump to source closes the window", await page.waitForFunction(() => !document.querySelector("dialog[open]"), null, { timeout: 5000 }).then(() => true, () => false));
// The passage is selected: typing replaces exactly it (no caret movement,
// so nothing waits on the browser's selectionchange timing).
const beforeJumpType = await storedText(page, hubId);
await page.keyboard.type("JUMPED");
const at = beforeJumpType.indexOf(quote);
const expected = at < 0 ? null : beforeJumpType.slice(0, at) + "JUMPED" + beforeJumpType.slice(at + quote.length);
const replaced = expected !== null && (await eventually(async () => (await storedText(page, hubId)) === expected));
const landed = replaced
  ? ""
  : await storedText(page, hubId).then((t) => {
      let d = 0;
      while (d < t.length && t[d] === expected?.[d]) d++;
      return ` (differs at ${d}: saved "${t.slice(Math.max(0, d - 30), d + 30)}", expected "${expected?.slice(Math.max(0, d - 30), d + 30)}")`;
    });
check(`the quoted passage was selected in the document ("${quote.slice(0, 40)}…")${landed}`, replaced);
check("the review was paid for once", account.starts.length === 1);
check("the status bar says something was sent", (await page.locator('[data-testid="doc-workspace"]').innerText()).includes("carried text you agreed to send"));
check(`only the review's requests carried a body (${reviewBodies.length})`, reviewBodies.length > 0);

// --- a figure from the Figures window, at the cursor, at the size it was drawn ---
const drawings = (xml) => xml.match(/<w:drawing>/g)?.length ?? 0;
const storedPart = async (p, id, path) => part(Buffer.from((await stored(p, id)).b64, "base64"), path) ?? "";
const media = async (p, id) => Object.entries(unzipSync(Buffer.from((await stored(p, id)).b64, "base64"))).filter(([n]) => n.startsWith("word/media/") && !n.endsWith("/"));
const before = drawings(await storedPart(page, hubId, "word/document.xml"));
await clickInto(page, TEXT.results);
await openTool("Figures");
const [csvChooser] = await Promise.all([page.waitForEvent("filechooser"), window_("Figures").getByText("Drop a CSV or XLSX").click()]);
await csvChooser.setFiles(new URL("../fixtures/messy.csv", import.meta.url).pathname);
await window_("Figures").locator('[data-testid="preview-table"]').waitFor({ timeout: 15_000 });
await window_("Figures").locator('[data-template="box"]').click();
await window_("Figures").locator('[data-testid="figure-image"]').waitFor({ timeout: 180_000 }); // first run fetches the figure engine into this profile
await window_("Figures").getByRole("button", { name: "Insert into paper" }).click();
check("Insert into paper closes the window", await page.waitForFunction(() => !document.querySelector("dialog[open]"), null, { timeout: 90_000 }).then(() => true, () => false));
check("the figure is in the saved document", await eventually(async () => drawings(await storedPart(page, hubId, "word/document.xml")) === before + 1));
const cx = Number((await storedPart(page, hubId, "word/document.xml")).match(/<wp:extent cx="(\d+)"/)?.[1]);
check(`at the width it was drawn for, 89 mm (${(cx / 36000).toFixed(1)} mm)`, Math.abs(cx - 3_204_000) / 3_204_000 < 0.02);
check("next to the paragraph the cursor was in", (await storedPart(page, hubId, "word/document.xml")).indexOf("<w:drawing>") > (await storedPart(page, hubId, "word/document.xml")).indexOf(TEXT.results.slice(0, 30)));
const mediaAfterInsert = await media(page, hubId);
await clickInto(page, TEXT.intro);
await page.keyboard.type(" Saved again.");
await storedHas(page, hubId, "Saved again.");
const mediaLater = await media(page, hubId);
check(`a later save stores the picture once (${mediaAfterInsert.length} → ${mediaLater.length} files)`, mediaLater.length === mediaAfterInsert.length && new Set(mediaLater.map(([, d]) => Buffer.from(d).toString("base64"))).size === mediaLater.length);

// --- the editor's styles stay inside it: / and /review look as they did, reached in the same page ---
// Elements styled in a way the page didn't have before: a restyled element
// shows up here. (Elements only the first visit shows, like the homepage's
// intro, are just missing the second time: not counted.)
const restyled = (before, after) => {
  const left = new Map();
  for (const k of before) left.set(k, (left.get(k) ?? 0) + 1);
  return after.filter((k) => (left.get(k) ? (left.set(k, left.get(k) - 1), false) : true));
};
await page.click('a[aria-label="MargaLink home"]');
await page.waitForURL(`${O}/`);
const homeDiff = restyled(homeBefore, await styles());
check(`after a Word project, / looks as before${homeDiff.length ? ` (${homeDiff.length} elements differ: ${homeDiff.slice(0, 2).join(" | ")})` : ""}`, homeDiff.length === 0);
await page.locator('a[href="/review"]').filter({ visible: true }).first().click();
await page.waitForURL(`${O}/review`);
const reviewDiff = restyled(reviewBefore, await styles());
check(`and so does /review${reviewDiff.length ? ` (${reviewDiff.length} elements differ: ${reviewDiff.slice(0, 2).join(" | ")})` : ""}`, reviewDiff.length === 0);

// --- the browser's Back (a client-side route change) still saves the last edits ---
await page.click('nav[aria-label="MargaLink"] a[href="/write"]');
await page.waitForSelector("text=Write your paper.");
await page.locator('[data-testid="project-list"] li', { hasText: "Hub paper" }).locator("button").first().click();
await page.waitForSelector('[data-testid="doc-workspace"]');
await clickInto(page, TEXT.methods);
await page.keyboard.type(" Gone back.");
await page.goBack();
await page.waitForURL(`${O}/review`);
check("Back right after typing still saves", await storedHas(page, hubId, "Gone back."));

// --- closing the tab right after typing asks first (the edit isn't saved yet) ---
const closing = await context.newPage();
watch(closing);
let asked = false;
closing.on("dialog", (d) => {
  if (d.type() === "beforeunload") asked = true;
  void d.accept();
});
await closing.goto(`${O}/write?p=${hubId}`);
await bodyText(closing).getByText(TEXT.intro.slice(0, 30)).first().waitFor({ timeout: 20000 });
await clickInto(closing, TEXT.intro);
await closing.keyboard.type("Q");
await closing.close({ runBeforeUnload: true });
check("closing the tab right after typing asks first", await eventually(async () => asked, 3000));

check(`no page errors, no request bodies, nothing off our origin${problems.length ? `: ${problems.slice(0, 5).join(" | ")}` : ""}`, problems.length === 0);
await context.close();
process.exit(failed ? 1 : 0);
