// Runnable check for templateCatalog.ts, against the committed
// public/templates/templates.json. Run directly:
//   node src/lib/templateCatalog.selfcheck.ts
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { escapeTex, starterProject, templateForJournal, type Template } from "./templateCatalog.ts";

const DIR = new URL("../../public/templates/", import.meta.url).pathname;
const templates = JSON.parse(readFileSync(`${DIR}templates.json`, "utf8")) as Template[];
const byId = (id: string) => templates.find((t) => t.id === id)!;

// 1. every bundled template's files exist; link-only ones have a publisher page and no files
for (const t of templates) {
  if (t.bundled) {
    assert.ok(t.files.includes(t.main), `${t.id}: main is one of its files`);
    for (const f of t.files) assert.ok(existsSync(`${DIR}${t.id}/${f}`), `${t.id}/${f} exists`);
  } else {
    assert.match(String(t.publisherUrl), /^https:\/\//, `${t.id}: link-only needs a publisher page`);
    assert.deepEqual(t.files, []);
  }
  assert.ok(["pdftex", "xetex"].includes(t.engine));
}
assert.deepEqual(templates.filter((t) => t.bundled).map((t) => t.id).sort(), ["acmart", "article", "elsarticle", "ieeetran"]);

// 2. a journal's publisher (host_organization_name in meta.json) picks its template
assert.equal(templateForJournal("Elsevier BV", templates)?.id, "elsarticle");
assert.equal(templateForJournal("Institute of Electrical and Electronics Engineers", templates)?.id, "ieeetran");
assert.equal(templateForJournal("Association for Computing Machinery", templates)?.id, "acmart");
assert.equal(templateForJournal("Springer Nature", templates)?.id, "sn-jnl");
assert.equal(templateForJournal("Springer Science+Business Media", templates)?.id, "sn-jnl");
assert.equal(templateForJournal("BioMed Central", templates)?.id, "sn-jnl");
assert.equal(templateForJournal("Routledge", templates)?.id, "tandf");
assert.equal(templateForJournal("American Psychological Association", templates)?.id, "apa");
assert.equal(templateForJournal("Some Small Society Press", templates), null);
assert.equal(templateForJournal(null, templates), null);
assert.equal(templateForJournal("Russell Sage Foundation", templates), null, "patterns are anchored: not SAGE Publishing");

// 3. a starter project: the bundled files, with the journal named in main.tex
const served = new Map<string, Uint8Array>();
for (const t of templates) for (const f of t.files) served.set(`/templates/${t.id}/${f}`, new Uint8Array(readFileSync(`${DIR}${t.id}/${f}`)));
const fakeFetch = (async (url: string) => {
  const body = served.get(url);
  return body ? new Response(new Blob([body.slice()])) : new Response("missing", { status: 404 });
}) as typeof fetch;
{
  const files = await starterProject(byId("elsarticle"), { id: "S1", display_name: "Journal of Hydrology & Water_Resources" }, fakeFetch);
  assert.deepEqual(files.map((f) => f.path).sort(), [...byId("elsarticle").files].sort());
  const main = new TextDecoder().decode(files.find((f) => f.path === "main.tex")!.data);
  assert.ok(main.startsWith("% Journal: Journal of Hydrology & Water_Resources\n"), "a comment names the chosen journal");
  assert.ok(main.includes("\\journal{Journal of Hydrology \\& Water\\_Resources}"), "elsarticle's \\journal{} is filled, TeX-escaped");
  assert.ok(main.includes("\\title{Your title}"));
  // a binary-safe copy of the class file
  assert.deepEqual(files.find((f) => f.path === "elsarticle.cls")!.data, served.get("/templates/elsarticle/elsarticle.cls"));
}
{
  const plain = await starterProject(byId("article"), null, fakeFetch);
  const main = new TextDecoder().decode(plain.find((f) => f.path === "main.tex")!.data);
  assert.ok(main.startsWith("\\documentclass"), "no journal, no comment");
}
await assert.rejects(starterProject(byId("sn-jnl"), null, fakeFetch), /download/i, "link-only templates have nothing to start from");
assert.equal(escapeTex("50% of $x & #1 {a} ~ ^"), "50\\% of \\$x \\& \\#1 \\{a\\} \\textasciitilde{} \\textasciicircum{}");

console.log("templateCatalog.selfcheck: OK");
