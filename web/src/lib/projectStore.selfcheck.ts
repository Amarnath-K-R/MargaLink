// Runnable check for projectStore.ts against an in-memory stand-in for the
// browser's Origin Private File System. Run directly:
//   node src/lib/projectStore.selfcheck.ts
import assert from "node:assert/strict";
import { ProjectStore, autosaver, findMainTex, type DirHandle, type FileHandle } from "./projectStore.ts";
import { zipFiles } from "./zip.ts";

// --- a minimal OPFS fake: directories of files holding bytes ---
class FakeFile implements FileHandle {
  kind = "file" as const;
  bytes = new Uint8Array(0);
  async getFile() {
    const b = this.bytes;
    return { arrayBuffer: async () => b.slice().buffer, text: async () => new TextDecoder().decode(b) };
  }
  async createWritable() {
    const chunks: Uint8Array[] = [];
    return {
      write: async (d: Uint8Array | string) => void chunks.push(typeof d === "string" ? new TextEncoder().encode(d) : d),
      close: async () => {
        const total = chunks.reduce((n, c) => n + c.length, 0);
        const out = new Uint8Array(total);
        let at = 0;
        for (const c of chunks) (out.set(c, at), (at += c.length));
        this.bytes = out;
      },
    };
  }
}
class FakeDir implements DirHandle {
  kind = "directory" as const;
  children = new Map<string, FakeDir | FakeFile>();
  async getDirectoryHandle(name: string, o?: { create?: boolean }) {
    let c = this.children.get(name);
    if (!c && o?.create) this.children.set(name, (c = new FakeDir()));
    if (!(c instanceof FakeDir)) throw new DOMException(`no directory ${name}`, "NotFoundError");
    return c;
  }
  async getFileHandle(name: string, o?: { create?: boolean }) {
    let c = this.children.get(name);
    if (!c && o?.create) this.children.set(name, (c = new FakeFile()));
    if (!(c instanceof FakeFile)) throw new DOMException(`no file ${name}`, "NotFoundError");
    return c;
  }
  async removeEntry(name: string) {
    if (!this.children.delete(name)) throw new DOMException(`no entry ${name}`, "NotFoundError");
  }
  async *entries(): AsyncIterableIterator<[string, FakeDir | FakeFile]> {
    yield* this.children.entries();
  }
}

const enc = (s: string) => new TextEncoder().encode(s);
const MAIN = "\\documentclass{article}\n\\begin{document}Hello\\end{document}\n";
let clock = Date.parse("2026-09-25T10:00:00Z");
const now = () => new Date((clock += 1000)).toISOString();
const store = new ProjectStore(new FakeDir(), now);

// 1. create, list, read/write, updatedAt
const p = await store.create({ name: "My paper", main: "main.tex", engine: "pdftex", journalId: null, templateId: "article" }, [
  { path: "main.tex", data: enc(MAIN) },
  { path: "refs.bib", data: enc("@article{a, title={T}}") },
]);
assert.match(p.id, /^[a-z0-9-]{8,}$/);
const listed = await store.list();
assert.equal(listed.length, 1);
assert.equal(listed[0].name, "My paper");
assert.ok(listed[0].createdAt);
assert.equal(await store.readText(p.id, "main.tex"), MAIN);
const before = (await store.meta(p.id)).updatedAt;
await store.write(p.id, "main.tex", MAIN.replace("Hello", "Hi"));
assert.ok((await store.readText(p.id, "main.tex")).includes("Hi"));
assert.ok((await store.meta(p.id)).updatedAt > before, "a write bumps updatedAt");

// 2. nested paths, binary files, listing, rename, delete
const png = Uint8Array.from({ length: 300 }, (_, i) => i % 256);
await store.write(p.id, "figures/plot.png", png);
assert.deepEqual(await store.read(p.id, "figures/plot.png"), png);
assert.deepEqual((await store.files(p.id)).sort(), ["figures/plot.png", "main.tex", "refs.bib"], "files() is recursive and hides project.json");
await store.rename(p.id, "refs.bib", "bib/refs.bib");
assert.deepEqual((await store.files(p.id)).sort(), ["bib/refs.bib", "figures/plot.png", "main.tex"]);
await store.deleteFile(p.id, "figures/plot.png");
assert.ok(!(await store.files(p.id)).includes("figures/plot.png"));

// 3. export → import reproduces the files; the copy is a separate project
await store.write(p.id, "figures/plot.png", png);
const zip = await store.exportZip(p.id);
const copy = await store.importZip("Copy", zip);
assert.notEqual(copy.id, p.id);
assert.deepEqual((await store.files(copy.id)).sort(), (await store.files(p.id)).sort());
assert.deepEqual(await store.read(copy.id, "figures/plot.png"), png);
assert.equal(copy.main, "main.tex");

// 4. a template zip with one top-level folder is flattened, and its main file found (Review Focus 3)
const template = zipFiles([
  { path: "elsarticle/elsarticle.cls", data: enc("% class") },
  { path: "elsarticle/elsarticle-template.tex", data: enc("\\documentclass[review]{elsarticle}\n") },
  { path: "elsarticle/figs/logo.pdf", data: enc("%PDF") },
]);
const imported = await store.importZip("Elsevier", template, "https://openalex.org/S1");
assert.deepEqual((await store.files(imported.id)).sort(), ["elsarticle-template.tex", "elsarticle.cls", "figs/logo.pdf"]);
assert.equal(imported.main, "elsarticle-template.tex");
assert.equal(imported.journalId, "https://openalex.org/S1");

// 5. findMainTex: main.tex first, then the file with \documentclass, else null
assert.equal(findMainTex([{ path: "a.tex", text: "\\documentclass{x}" }, { path: "main.tex", text: "" }]), "main.tex");
assert.equal(findMainTex([{ path: "notes.tex", text: "no class" }, { path: "paper.tex", text: "\\documentclass{x}" }]), "paper.tex");
assert.equal(findMainTex([{ path: "a.sty", text: null }]), null);

// 6. remove deletes the project and only it
await store.remove(copy.id);
assert.deepEqual((await store.list()).map((m) => m.id).sort(), [p.id, imported.id].sort());
await assert.rejects(store.meta(copy.id));

// 7. the autosaver writes only the last text once typing stops (Review Focus 1)
{
  const writes: string[] = [];
  const timers: (() => void)[] = [];
  const save = autosaver(async (_id, _path, text) => void writes.push(text), 1000, (fn) => {
    timers.push(fn);
    return timers.length;
  }, () => {});
  save("p", "main.tex", "a");
  save("p", "main.tex", "ab");
  save("p", "main.tex", "abc");
  timers.at(-1)!(); // the last scheduled flush fires
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(writes, ["abc"], "one write, with the last text");
  save("p", "main.tex", "abcd");
  await save.flush(); // leaving the page flushes what's pending
  assert.deepEqual(writes, ["abc", "abcd"]);
}

console.log("projectStore.selfcheck: OK");
