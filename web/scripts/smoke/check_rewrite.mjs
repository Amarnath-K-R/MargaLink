// Dev-only: Rewrite in /write, against a running dev server (port 3000),
// signed in through mock_account.mjs, with /api/rewrite stubbed (the real
// Function is checked by rewriteEndpoint.selfcheck.ts and, with Claude, by
// scripts/eval/rewrite_live.ts).
//   LaTeX: the selection's price on the menu; nothing sent before the
//   paper's consent; the rewrite as a diff; Replace, and one undo takes it
//   back; Try again is charged again; text changed meanwhile offers Copy; a
//   refused rewrite says it was refunded; too few coins offers Buy coins;
//   the status line counts what was sent; consent is kept with the paper,
//   never in its backup, and can be turned off; a read-only tab and a
//   signed-out visitor get no rewrite.
//   Word: the same through the editor's own bar and right-click menu, on a
//   paragraph with a footnote and a Zotero citation, which are still there
//   (and still a footnote and a citation) once the rewrite is saved.
//   node scripts/smoke/check_rewrite.mjs
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { unzipSync, strFromU8 } from "fflate";
import { kitchenSinkDocx, part } from "../fixtures/docx_fixtures.mjs";
import { mockAccount } from "./mock_account.mjs";

const O = process.env.ORIGIN ?? "http://localhost:3000";
const SCRATCH = process.env.SMOKE_OUT ?? new URL("../../.smoke/", import.meta.url).pathname;
mkdirSync(SCRATCH, { recursive: true });
const context = await chromium.launchPersistentContext(`${SCRATCH}/rewrite-profile`, { viewport: { width: 1400, height: 900 }, acceptDownloads: true });
const account = await mockAccount(context, { balance: 20, origin: O });
const page = context.pages()[0] ?? (await context.newPage());
const problems = [];
page.on("pageerror", (e) => problems.push(`pageerror: ${e.message.slice(0, 160)}`));
page.on("console", (m) => m.type() === "error" && !/Failed to load resource/.test(m.text()) && problems.push(`console: ${m.text().slice(0, 160)}`));
page.on("request", (r) => {
  if (r.postData() && !/\/api\/rewrite$/.test(r.url())) problems.push(`a request with a body: ${r.method()} ${r.url()}`);
  if (!r.url().startsWith(O) && !/^(data:|blob:)/.test(r.url())) problems.push(`left the origin: ${r.url().slice(0, 120)}`);
});
page.on("dialog", (d) => void d.accept());

// /api/rewrite, stubbed: a few words swapped, every placeholder kept; charged from the mock's balance.
const SWAPS = [["was short", "seemed brief"], ["were enrolled", "joined the study"]];
let mode = "ok";
const rewrites = [];
await context.route("**/api/rewrite", async (route) => {
  const body = route.request().postDataJSON();
  rewrites.push(body);
  if (mode === "slow") await new Promise((r) => setTimeout(r, 2500));
  if (mode === "fail") return route.fulfill({ status: 422, contentType: "text/plain", body: "Claude's rewrite didn't keep your citations, numbers or paragraphs as they were, so it wasn't used. Your coin was refunded." });
  if (body.coins > account.balance) return route.fulfill({ status: 402, json: { coins: body.coins, balance: account.balance } });
  account.balance -= body.coins;
  const text = SWAPS.reduce((t, [a, b]) => t.replace(a, b), body.passage);
  return route.fulfill({ json: { text, notes: [], coins: body.coins, balance: account.balance } });
});

let failed = false;
const check = (label, ok) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${label}`);
  if (!ok) failed = true;
};
const eventually = async (fn, ms = 10000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await fn()) return true;
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
};
const card = page.locator('[data-testid="rewrite-card"]');
const seen = (loc) => loc.first().waitFor({ timeout: 8000 }).then(() => true, () => false);
const meta = (id) =>
  page.evaluate(async (id) => {
    const dir = await (await (await navigator.storage.getDirectory()).getDirectoryHandle("margalink-write")).getDirectoryHandle(id);
    return JSON.parse(await (await (await dir.getFileHandle("project.json")).getFile()).text());
  }, id);
const backupMeta = async () => {
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download backup" }).first().click()]);
  const zip = unzipSync(new Uint8Array(await (await download.createReadStream()).toArray().then((c) => Buffer.concat(c))));
  return JSON.parse(strFromU8(zip["project.json"]));
};
const sentLine = () => page.getByText(/request(s)? carried text you agreed to send|Nothing from this paper has been sent/).first().innerText();

// --- a LaTeX paper (OPFS cleared from a plain same-origin file)
await page.goto(`${O}/templates/templates.json`);
await page.evaluate(async () => (await navigator.storage.getDirectory()).removeEntry("margalink-write", { recursive: true }).catch(() => {}));
await page.goto(`${O}/write`);
await page.click('[data-template="article"]');
const cm = page.locator('[data-testid="latex-editor"] .cm-content');
await cm.waitFor();
const texId = new URL(page.url()).searchParams.get("p");
const SENTENCE = "Sleep was short after surgery~\\cite{knuth1984} in $n = 12$ adults.";
await page.click('[data-testid="latex-editor"] .cm-line:has-text("Start here")');
await page.keyboard.press("End");
await page.keyboard.press("Enter");
await page.keyboard.type(SENTENCE);
const source = () => cm.innerText();
// The sentence's line, from its start: all of it, or its first `chars` characters (as a person would, with the keyboard).
const selectText = async (text) => {
  await page.click(`[data-testid="latex-editor"] .cm-line:has-text("${text.slice(0, 20)}")`, { position: { x: 2, y: 6 } }); // the line's first row: it may wrap
  await page.keyboard.press("Home");
  for (let i = 0; i < text.length; i++) await page.keyboard.press("Shift+ArrowRight");
};
const rewriteMenu = async () => {
  await page.getByRole("toolbar", { name: "Formatting" }).getByRole("button", { name: "Rewrite" }).click();
  return page.locator('[data-testid="rewrite-menu"]').first();
};

await selectText(SENTENCE);
let menu = await rewriteMenu();
check(`the menu shows the selection's price (${await menu.locator('[data-testid="rewrite-price"]').innerText()})`, /7 words: 1 M coin$/.test((await menu.locator('[data-testid="rewrite-price"]').innerText()).trim()));
await menu.getByRole("menuitem", { name: "Paraphrase" }).click();
check("the first rewrite in a paper asks for consent", await seen(card.getByRole("alertdialog", { name: "Rewrite consent" })));
check("and nothing is sent before it", rewrites.length === 0);
check("Turn on waits for the box", await card.getByRole("button", { name: "Turn on for this paper" }).isDisabled());
const focusIn = (sel) => page.evaluate((sel) => !!document.activeElement?.closest(sel), sel);
check("the consent takes the keyboard, at its box", await page.evaluate(() => document.activeElement?.getAttribute("type") === "checkbox" && !!document.activeElement.closest('[data-testid="rewrite-card"]')));
await page.keyboard.press("Space");
await page.keyboard.press("Tab");
await page.keyboard.press("Enter");
check("then the rewrite shows as a diff", await seen(card.locator('[data-testid="rewrite-diff"] ins', { hasText: "seemed" })));
check("only the passage went, the citation and the maths as placeholders", rewrites.length === 1 && rewrites[0].passage === "Sleep was short after surgery~⟦1⟧ in ⟦2⟧ adults." && rewrites[0].format === "latex" && rewrites[0].dialect === "us");
check("consent is kept with the paper", await eventually(async () => typeof (await meta(texId)).rewriteConsent === "string"));
check(`the status line counts what was sent (${await sentLine()})`, /1 request carried text/.test(await sentLine()));
check("the result takes the keyboard, at Replace", await page.evaluate(() => document.activeElement?.textContent === "Replace"));
await page.keyboard.press("Enter");
check("Replace puts the rewrite in", await eventually(async () => (await source()).includes("Sleep seemed brief after surgery~\\cite{knuth1984} in $n = 12$ adults.")));
check("and closes the card, the keyboard back in the editor", (await card.count()) === 0 && (await focusIn('[data-testid="latex-editor"]')));
await cm.click();
await page.keyboard.press("ControlOrMeta+z");
check("one undo takes it back", await eventually(async () => (await source()).includes(SENTENCE)));

// --- Try again is charged again; consent isn't asked twice
const before = account.balance;
await selectText(SENTENCE);
menu = await rewriteMenu();
await menu.getByRole("menuitem", { name: "Paraphrase" }).click(); // the stub only swaps words: Shorten would rightly be refused
await seen(card.locator('[data-testid="rewrite-diff"]'));
check("no second consent in the same paper", (await card.getByRole("alertdialog").count()) === 0);
await card.getByRole("button", { name: /Try again · 1 M coin/ }).click();
check("Try again sends again, and is charged again", await eventually(async () => rewrites.length === 3 && account.balance === before - 2));

// --- the text changed meanwhile: Try again asks to select it again (nothing sent, nothing charged)
await seen(card.locator('[data-testid="rewrite-diff"]'));
await page.click(`[data-testid="latex-editor"] .cm-line:has-text("${SENTENCE.slice(0, 20)}")`, { position: { x: 2, y: 6 } });
await page.keyboard.press("Home");
for (let i = 0; i < "Sleep ".length; i++) await page.keyboard.press("ArrowRight");
await page.keyboard.type("well "); // inside the passage (typing just before it isn't a change to it)
const sentBeforeAgain = rewrites.length;
await card.getByRole("button", { name: /Try again/ }).click();
check("Try again after the text changed asks to select it again, and sends nothing", (await seen(card.getByText(/The text changed since you asked/))) && rewrites.length === sentBeforeAgain);
await page.keyboard.press("Escape");
await cm.click();
await page.keyboard.press("ControlOrMeta+z");
await eventually(async () => (await source()).includes(SENTENCE));
await selectText(SENTENCE);
menu = await rewriteMenu();
await menu.getByRole("menuitem", { name: "Paraphrase" }).click();

// --- the text changed meanwhile: Copy, not Replace
await seen(card.locator('[data-testid="rewrite-diff"]'));
await page.click(`[data-testid="latex-editor"] .cm-line:has-text("${SENTENCE.slice(0, 20)}")`, { position: { x: 2, y: 6 } });
await page.keyboard.press("Home");
for (let i = 0; i < "Sleep was short ".length; i++) await page.keyboard.press("ArrowRight");
await page.keyboard.type("well ");
await card.getByRole("button", { name: "Replace" }).click();
check("text changed since: the card says so and offers Copy", await seen(card.getByRole("button", { name: "Copy the rewrite" })));
check("and the paper is as edited", (await source()).includes("Sleep was short well after surgery"));
await page.keyboard.press("Escape");

// --- a rewrite on its way: no second one meanwhile; the editor remade (a file switch) can't be written blind
mode = "slow";
await selectText(SENTENCE.slice(0, 15));
menu = await rewriteMenu();
await menu.getByRole("menuitem", { name: "Paraphrase" }).click();
await page.waitForTimeout(400);
menu = await rewriteMenu();
check("while a rewrite is on its way the menu offers no other", /on its way/.test(await menu.locator('[data-testid="rewrite-price"]').innerText()) && (await menu.getByRole("menuitem", { name: "Paraphrase" }).isDisabled()));
await page.keyboard.press("Escape");
mode = "ok";
await seen(card.locator('[data-testid="rewrite-diff"]'));
await page.click('[data-testid="file-tree"] >> text=refs.bib');
await page.waitForTimeout(600);
await page.click('[data-testid="file-tree"] >> text=main.tex');
await cm.waitFor();
await card.getByRole("button", { name: "Replace" }).click();
await page.waitForTimeout(500);
check("Replace after a file switch offers Copy instead of writing nowhere", (await seen(card.getByRole("button", { name: "Copy the rewrite" }))) && !(await source()).includes("Sleep seemed brief"));
await page.keyboard.press("Escape");

// --- a refused rewrite, and too few coins
await selectText("Sleep was short well after surgery");
mode = "fail";
menu = await rewriteMenu();
await menu.getByRole("menuitem", { name: "Expand" }).click();
check("a refused rewrite says it was refunded", await seen(card.getByText(/refunded/)));
await page.keyboard.press("Escape");
mode = "ok";
account.balance = 0;
await selectText("Sleep was short well after surgery");
menu = await rewriteMenu();
await menu.getByRole("menuitem", { name: "Expand" }).click();
check("too few coins: the price, the balance and Buy coins", (await seen(card.getByText("This costs 1 M coin and you have 0."))) && (await card.getByRole("link", { name: "Buy coins" }).count()) === 1);
await page.keyboard.press("Escape");
account.balance = 10;

// --- consent is never in a backup, and can be turned off
check("the backup leaves the consent out", (await backupMeta()).rewriteConsent === undefined);
await page.keyboard.press("ControlOrMeta+k");
await page.getByLabel("Search commands").fill("Turn off Rewrite");
await page.keyboard.press("Enter");
check("Turn off Rewrite for this paper forgets the consent", await eventually(async () => (await meta(texId)).rewriteConsent === undefined));
await selectText("Sleep was short well after surgery");
menu = await rewriteMenu();
await menu.getByRole("menuitem", { name: "Paraphrase" }).click();
check("and the next rewrite asks again", await seen(card.getByRole("alertdialog", { name: "Rewrite consent" })));
await page.keyboard.press("Escape");

// --- a read-only tab (another holds the paper) gets no rewrite
const other = await context.newPage();
await other.goto(page.url());
await other.locator('[data-testid="latex-editor"] .cm-content').waitFor();
await other.waitForTimeout(2500);
check("a read-only tab has no Rewrite", (await other.getByRole("button", { name: "Rewrite" }).count()) === 0);
await other.close();

// --- Word: the editor's bar and right-click menu, objects kept through Replace and save
await page.click("text=← All projects");
await page.waitForSelector("text=Write your paper.");
await page.setInputFiles('input[aria-label="Import a .zip, .tex or Word file"]', { name: "Kitchen sink.docx", mimeType: "application/octet-stream", buffer: Buffer.from(await kitchenSinkDocx()) });
await page.waitForSelector('[data-testid="doc-workspace"]');
const docId = new URL(page.url()).searchParams.get("p");
await page.waitForTimeout(3000);
const stored = async () => {
  for (let i = 0; ; i++) {
    try {
      return await page.evaluate(async (id) => {
        const dir = await (await (await navigator.storage.getDirectory()).getDirectoryHandle("margalink-write")).getDirectoryHandle(id);
        const bytes = new Uint8Array(await (await (await dir.getFileHandle("paper.docx")).getFile()).arrayBuffer());
        return btoa(Array.from(bytes, (c) => String.fromCharCode(c)).join(""));
      }, docId);
    } catch (err) {
      if (i >= 5 || !/NotFoundError|NotReadableError/.test(String(err))) throw err;
      await new Promise((r) => setTimeout(r, 150));
    }
  }
};
const docXml = async () => part(Buffer.from(await stored(), "base64"), "word/document.xml");
// Drag across the drawn page from the start of one phrase to the end of another.
const where = (text, end) =>
  page.evaluate(([text, end]) => {
    for (const el of document.querySelectorAll('[data-testid="doc-editor"] .layout-page span')) {
      const node = [...el.childNodes].find((n) => n.nodeType === 3 && n.textContent.includes(text));
      if (!node) continue;
      const i = node.textContent.indexOf(text) + (end ? text.length - 1 : 0);
      const r = document.createRange();
      r.setStart(node, i);
      r.setEnd(node, i + 1);
      const b = r.getBoundingClientRect();
      return { x: end ? b.right - 1 : b.left + 1, y: b.top + b.height / 2 };
    }
    return null;
  }, [text, end]);
const dragSelect = async (from, to) => {
  const a = await where(from, false);
  const b = await where(to, true);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 4 });
  await page.mouse.move(b.x, b.y, { steps: 4 });
  await page.mouse.up();
};
await dragSelect("Adults recovering", "(Smith, 2019)");
await page.getByRole("button", { name: "Rewrite" }).first().click();
menu = page.locator('[data-testid="rewrite-menu"]').first();
check(`Word: the bar's Rewrite shows the price (${await menu.locator('[data-testid="rewrite-price"]').innerText().catch(() => "?")})`, /M coin/.test(await menu.locator('[data-testid="rewrite-price"]').innerText().catch(() => "")));
const onScreen = async (loc) => {
  const box = await loc.boundingBox();
  const hit = box && (await page.evaluate(({ x, y }) => !!document.elementFromPoint(x, y)?.closest('[data-testid="rewrite-menu"]'), { x: box.x + 20, y: box.y + box.height - 12 }));
  return !!hit;
};
check("Word: and the tools are on screen, not clipped by the editor's bar", await onScreen(menu));
const sentBefore = rewrites.length;
await menu.getByRole("menuitem", { name: "Paraphrase" }).click();
check("Word: a new paper asks for its own consent", await seen(card.getByRole("alertdialog", { name: "Rewrite consent" })));
await card.getByRole("checkbox").check();
await card.getByRole("button", { name: "Turn on for this paper" }).click();
await seen(card.locator('[data-testid="rewrite-diff"]'));
const wordReq = rewrites.at(-1);
check(`Word: the footnote mark and the citation went as placeholders (${JSON.stringify(wordReq?.passage).slice(0, 120)})`, rewrites.length === sentBefore + 1 && wordReq.format === "text" && /enrolled⟦1⟧ and followed/.test(wordReq.passage) && /⟦2⟧/.test(wordReq.passage) && !wordReq.passage.includes("Smith"));
check("Word: the diff shows the citation as itself", await seen(card.locator('[data-testid="rewrite-diff"]', { hasText: "(Smith, 2019)" })));
await card.getByRole("button", { name: "Replace" }).click();
const xmlAfter = async () => (await eventually(async () => (await docXml()).includes("joined the study"), 15000)) && (await docXml());
const xml = await xmlAfter();
check("Word: the rewrite is saved", !!xml && !xml.includes("were enrolled"));
check("Word: the footnote is still a footnote", !!xml && /<w:footnoteReference w:id="1"\/>/.test(xml));
check("Word: the citation is still a Zotero field", !!xml && xml.includes("ADDIN ZOTERO_ITEM") && xml.includes("(Smith, 2019)"));
await page.keyboard.press("ControlOrMeta+z");
check("Word: one undo takes it back", await eventually(async () => (await docXml()).includes("were enrolled"), 15000));

// right-click menu, then a change before Replace: Copy
await dragSelect("Adults recovering", "ninety days.");
await page.mouse.click((await where("ninety", false)).x, (await where("ninety", false)).y, { button: "right" });
await page.getByText("Rewrite with Claude…").first().click();
check("Word: the right-click item opens the tools by the selection", await seen(card.locator('[data-testid="rewrite-menu"]')));
await card.getByRole("menuitem", { name: "Clarity and flow" }).click();
await seen(card.locator('[data-testid="rewrite-diff"]'));
await page.mouse.click((await where("ninety", false)).x, (await where("ninety", false)).y);
await page.keyboard.type("X");
await card.getByRole("button", { name: "Replace" }).click();
check("Word: text changed since: Copy, not Replace", await seen(card.getByRole("button", { name: "Copy the rewrite" })));
await page.keyboard.press("Escape");

// --- signed out: the sign-in panel, nothing sent
await context.clearCookies();
await context.unroute("**/api/me");
await context.route("**/api/me", (route) => route.fulfill({ status: 401, body: "" }));
await page.goto(`${O}/write?p=${texId}`);
await cm.waitFor();
await page.waitForTimeout(1500);
const sentSignedOut = rewrites.length;
await selectText("Sleep was short well after surgery");
menu = await rewriteMenu();
await menu.getByRole("menuitem", { name: "Paraphrase" }).click();
check("signed out: Rewrite asks you to sign in", await seen(card.getByText("Sign in to use Rewrite.")));
check("and sends nothing", rewrites.length === sentSignedOut);

check(`no page errors, no other request bodies, nothing off our origin${problems.length ? `: ${problems.slice(0, 5).join(" | ")}` : ""}`, problems.length === 0);
await context.close();
process.exit(failed ? 1 : 0);
