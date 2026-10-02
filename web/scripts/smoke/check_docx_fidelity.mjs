// Dev-only: does a Word document survive being edited in /write? Each
// document is imported and edited in one paragraph, saved, edited in
// another paragraph (a second save in the same session must keep the
// first's edit), closed, reopened, edited again and closed, as in real use,
// and the saved file is compared with the
// original: everything a paper carries is still there (citation fields,
// cross-references, footnotes, comments, tracked changes, equations,
// pictures, content controls, line numbering, columns), the template's
// styles, numbering, theme and fonts are byte for byte the same, headers,
// footers, footnotes and endnotes say what they said, document variables (a
// citation manager's settings) are kept, every part the document points to exists,
// no picture was stored twice, our paper reader still reads it, and no
// drawn line holds more text than fits (Folio's two-column float bug, see
// docs/word-editor-known-issues.md). Against
// a running dev server (port 3000).
//   node scripts/smoke/check_docx_fidelity.mjs
//   FIDELITY_DIR=.. node scripts/smoke/check_docx_fidelity.mjs   # also every .docx/.dotx in that folder (never committed)
import { chromium } from "playwright";
import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { strFromU8, unzipSync } from "fflate";
import mammoth from "mammoth";
import { kitchenSinkDocx, paperDocx } from "../fixtures/docx_fixtures.mjs";

const O = "http://localhost:3000";
const SCRATCH = process.env.SMOKE_OUT ?? new URL("../../.smoke/", import.meta.url).pathname;
mkdirSync(SCRATCH, { recursive: true });
const docs = [
  { name: "kitchen-sink.docx", bytes: await kitchenSinkDocx() },
  { name: "paper.docx", bytes: await paperDocx() },
  ...(process.env.FIDELITY_DIR
    ? readdirSync(process.env.FIDELITY_DIR)
        .filter((f) => /\.(docx|dotx)$/i.test(f))
        .map((f) => ({ name: f, bytes: new Uint8Array(readFileSync(join(process.env.FIDELITY_DIR, f))) }))
    : []),
];

// --- what a document carries, counted ---
const parts = (bytes) => Object.fromEntries(Object.entries(unzipSync(bytes)).filter(([p]) => !p.endsWith("/")));
const text = (xml) => [...(xml ?? "").matchAll(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>/g)].map((m) => m[1]).join("");
const docBody = (bytes) => text(strFromU8(unzipSync(bytes)["word/document.xml"]));
const FEATURES = {
  tables: /<w:tbl>/g,
  pictures: /<w:drawing>/g,
  "embedded objects (old equations)": /<w:object\b/g,
  links: /<w:hyperlink\b/g,
  sections: /<w:sectPr\b/g,
  "column settings": /<w:cols\b[^>]*w:num="\d+"/g,
  footnotes: /<w:footnoteReference\b/g,
  endnotes: /<w:endnoteReference\b/g,
  equations: /<m:oMath>/g,
  "comment anchors": /<w:commentRangeStart\b/g,
  "comment marks": /<w:commentReference\b/g,
  fields: /<w:fldChar w:fldCharType="begin"/g,
  "simple fields": /<w:fldSimple\b/g,
  "content controls": /<w:sdt>/g,
  "line numbering": /<w:lnNumType\b/g,
  insertions: /<w:ins\b/g,
  deletions: /<w:del\b/g,
  bookmarks: /<w:bookmarkStart\b/g,
  "numbered paragraphs": /<w:numPr>/g,
};
// A table of contents' entries are generated: Word rebuilds them (with their
// own PAGEREF fields) whenever the table is updated, and an editor may keep
// them as plain text. Counted without them; the TOC field itself still counts.
function withoutTocEntries(xml) {
  const cut = [];
  const open = [];
  for (const m of xml.matchAll(/<w:fldChar w:fldCharType="(begin|separate|end)"[^>]*>|<w:instrText[^>]*>([^<]*)<\/w:instrText>/g)) {
    if (m[1] === "begin") open.push({ instr: "", from: -1 });
    else if (m[2] !== undefined && open.length) open.at(-1).instr += m[2];
    else if (m[1] === "separate" && open.length) open.at(-1).from = m.index + m[0].length;
    else if (m[1] === "end" && open.length) {
      const f = open.pop();
      if (/^\s*TOC\b/.test(f.instr) && f.from >= 0 && !open.length) cut.push([f.from, m.index]);
    }
  }
  return cut.reduceRight((x, [from, to]) => x.slice(0, from) + x.slice(to), xml);
}
function measure(bytes) {
  const all = parts(bytes);
  const xml = withoutTocEntries(
    Object.entries(all)
      .filter(([p]) => /^word\/(document|header\d*|footer\d*)\.xml$/.test(p))
      .map(([, d]) => strFromU8(d))
      .join(""),
  );
  const counts = Object.fromEntries(Object.entries(FEATURES).map(([k, re]) => [k, (xml.match(re) ?? []).length]));
  // the kinds of field: citation managers (ADDIN), SEQ, REF, PAGEREF, TOC, PAGE…
  const kinds = [...xml.matchAll(/<w:instrText[^>]*>\s*([A-Z]+)(?:\s+([A-Z_.]+))?/g), ...xml.matchAll(/<w:fldSimple w:instr="\s*([A-Z]+)/g)].map((m) => (m[1] === "ADDIN" ? `ADDIN ${m[2] ?? ""}`.trim() : m[1])).sort();
  const headers = Object.fromEntries(Object.entries(all).filter(([p]) => /^word\/(header|footer)\d*\.xml$/.test(p)).map(([p, d]) => [p, text(strFromU8(d))]));
  const notes = ["word/footnotes.xml", "word/endnotes.xml"].map((p) => text(all[p] && strFromU8(all[p])));
  // document variables: citation managers keep a document's settings there (Zotero's style)
  const docVars = [...(all["word/settings.xml"] ? strFromU8(all["word/settings.xml"]) : "").matchAll(/<w:docVar\b[^>]*\/>/g)].map((m) => m[0]).sort();
  return { all, counts, kinds, headers, notes, docVars, body: text(strFromU8(all["word/document.xml"])) };
}
// Every part a relationship points to (other than a web link) exists in the file.
function brokenLinks(all) {
  const out = [];
  for (const [p, d] of Object.entries(all)) {
    if (!p.endsWith(".rels")) continue;
    const base = p.replace(/_rels\/[^/]*\.rels$/, "");
    for (const m of strFromU8(d).matchAll(/<Relationship\b([^>]*)\/>/g)) {
      const a = m[1];
      if (/TargetMode="External"/.test(a)) continue;
      const target = a.match(/Target="([^"]+)"/)?.[1];
      if (!target) continue;
      const resolved = target.startsWith("/") ? target.slice(1) : join(base, target).replace(/\\/g, "/");
      if (!(resolved in all)) out.push(`${p} → ${target}`);
    }
  }
  return out;
}
const duplicateMedia = (all) => {
  const seen = new Map();
  for (const [p, d] of Object.entries(all)) if (p.startsWith("word/media/")) seen.set(createHash("sha256").update(d).digest("hex"), [...(seen.get(createHash("sha256").update(d).digest("hex")) ?? []), p]);
  return [...seen.values()].filter((ps) => ps.length > 1);
};

// --- the browser ---
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message.slice(0, 160)));
page.on("dialog", (d) => void d.accept());
const IMPORT = 'input[aria-label="Import a .zip, .tex or Word file"]';
const stored = (id) =>
  page.evaluate(async (id) => {
    const dir = await (await (await navigator.storage.getDirectory()).getDirectoryHandle("margalink-write")).getDirectoryHandle(id);
    return btoa(Array.from(new Uint8Array(await (await (await dir.getFileHandle("paper.docx")).getFile()).arrayBuffer()), (c) => String.fromCharCode(c)).join(""));
  }, id);
// Type at the end of the first run of text of the nth body paragraph (not
// a header's or footer's) with a real word in it.
const editParagraph = async (n, mark) => {
  await page.locator('[data-testid="doc-editor"] .layout-page .layout-paragraph').first().waitFor({ timeout: 30000 });
  const at = await page.evaluate((n) => {
    const paragraphs = [...document.querySelectorAll('[data-testid="doc-editor"] .layout-page .layout-paragraph')].filter((p) => !p.closest("[data-hf-r-id]") && /\w{4,}/.test(p.textContent));
    const span = [...(paragraphs[n]?.querySelectorAll("span") ?? [])].find((s) => !s.querySelector("span") && /\w{4,}/.test(s.textContent));
    const r = span?.getBoundingClientRect();
    return r && { x: r.right - 1, y: r.top + r.height / 2 };
  }, n);
  if (!at) throw new Error(`no body paragraph ${n} to edit`);
  await page.mouse.click(at.x, at.y);
  await page.keyboard.type(` ${mark}`);
};
const savedHas = async (id, mark) => {
  for (const end = Date.now() + 10000; Date.now() < end; await new Promise((r) => setTimeout(r, 250))) if (docBody(Buffer.from(await stored(id), "base64")).includes(mark)) return true;
  return false;
};
const leave = async () => {
  await page.click("text=← All projects");
  await page.waitForSelector("text=Write your paper.");
};

await page.goto(`${O}/templates/templates.json`);
await page.evaluate(async () => (await navigator.storage.getDirectory()).removeEntry("margalink-write", { recursive: true }).catch(() => {}));
await page.goto(`${O}/write`);
await page.waitForSelector("text=Write your paper.");

let failed = false;
const report = (doc, label, ok, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${doc}: ${label}${detail ? ` (${detail})` : ""}`);
  if (!ok) failed = true;
};

for (const doc of docs) {
  const shortName = doc.name.replace(/\.(docx|dotx)$/i, "");
  await page.setInputFiles(IMPORT, { name: doc.name, mimeType: "application/octet-stream", buffer: Buffer.from(doc.bytes) });
  await page.waitForSelector('[data-testid="doc-workspace"]');
  const id = new URL(page.url()).searchParams.get("p");
  await editParagraph(0, "FIDELITY-ONE");
  if (!(await savedHas(id, "FIDELITY-ONE"))) report(doc.name, "the first edit saves", false);
  await editParagraph(1, "FIDELITY-TWO"); // another paragraph, another save, same session
  await page.screenshot({ path: `${SCRATCH}/fidelity-${shortName}.png` });
  // Every drawn line holds no more text than fits it (a line measured for a
  // wider column draws its words on top of each other).
  const overfull = await page.evaluate(() => {
    const ctx = document.createElement("canvas").getContext("2d");
    let worst = { ratio: 0, text: "" };
    for (const line of document.querySelectorAll('[data-testid="doc-editor"] .layout-page *')) {
      if (line.style.whiteSpace !== "pre" || !line.textContent.trim() || line.clientWidth < 50) continue;
      let natural = 0;
      for (const span of line.querySelectorAll("span:not(:has(span))")) {
        const cs = getComputedStyle(span);
        ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
        natural += ctx.measureText(span.textContent).width;
      }
      if (natural / line.clientWidth > worst.ratio) worst = { ratio: natural / line.clientWidth, text: line.textContent.slice(0, 40) };
    }
    return worst;
  });
  await leave();
  await page.locator('[data-testid="project-list"] li', { hasText: shortName }).first().locator("button").first().click();
  await page.waitForSelector('[data-testid="doc-workspace"]');
  await editParagraph(2, "FIDELITY-THREE");
  await leave();
  const out = new Uint8Array(Buffer.from(await stored(id), "base64"));
  writeFileSync(`${SCRATCH}/fidelity-${shortName}.saved.docx`, out);

  const before = measure(doc.bytes);
  const after = measure(out);
  report(doc.name, "all three edits are in the saved document", ["FIDELITY-ONE", "FIDELITY-TWO", "FIDELITY-THREE"].every((m) => after.body.includes(m)), ["FIDELITY-ONE", "FIDELITY-TWO", "FIDELITY-THREE"].filter((m) => !after.body.includes(m)).join(", ") && `missing ${["FIDELITY-ONE", "FIDELITY-TWO", "FIDELITY-THREE"].filter((m) => !after.body.includes(m)).join(", ")}`);
  const lost = Object.keys(FEATURES).filter((k) => after.counts[k] !== before.counts[k]).map((k) => `${k} ${before.counts[k]} → ${after.counts[k]}`);
  report(doc.name, "everything it carries is still there", lost.length === 0, lost.join(", "));
  report(doc.name, "the same fields", JSON.stringify(after.kinds) === JSON.stringify(before.kinds), `${before.kinds.join(" ")} → ${after.kinds.join(" ")}`);
  const unlike = ["word/styles.xml", "word/numbering.xml", "word/theme/theme1.xml", "word/fontTable.xml"].filter((p) => p in before.all && (!(p in after.all) || Buffer.compare(Buffer.from(before.all[p]), Buffer.from(after.all[p])) !== 0));
  report(doc.name, "styles, numbering, theme and fonts byte for byte", unlike.length === 0, unlike.join(", "));
  const headerDiff = Object.keys(before.headers).filter((p) => after.headers[p] !== before.headers[p]);
  report(doc.name, "headers and footers say the same", headerDiff.length === 0, headerDiff.join(", "));
  report(doc.name, "footnotes and endnotes say the same", JSON.stringify(after.notes) === JSON.stringify(before.notes));
  report(doc.name, "document variables kept (a citation manager's settings)", JSON.stringify(after.docVars) === JSON.stringify(before.docVars), `${before.docVars.length} → ${after.docVars.length}`);
  const broken = brokenLinks(after.all);
  report(doc.name, "every part it points to exists", broken.length === 0, broken.slice(0, 3).join("; "));
  const dupes = duplicateMedia(after.all).filter((ps) => !duplicateMedia(before.all).some((b) => b.join() === ps.join()));
  report(doc.name, "no picture stored twice", dupes.length === 0, dupes.map((d) => d.join(" = ")).join("; "));
  report(doc.name, "every line's text fits its line", overfull.ratio < 1.15, `worst ${overfull.ratio.toFixed(2)}x: "${overfull.text}"`);
  const read = await mammoth.extractRawText({ buffer: Buffer.from(out) }).then((r) => r.value, () => "");
  report(doc.name, "our paper reader still reads it", read.includes("FIDELITY-ONE"));
}

report("all", `no page errors${errors.length ? `: ${errors.slice(0, 3).join(" | ")}` : ""}`, errors.length === 0);
console.log(`screenshots and saved documents: ${SCRATCH}fidelity-*`);
await browser.close();
process.exit(failed ? 1 : 0);
