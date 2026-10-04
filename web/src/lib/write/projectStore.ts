// /write's projects, kept in the browser's Origin Private File System — on
// this device only; nothing is uploaded. One folder per project, holding its
// files and a project.json. The directory handles are passed in, so the
// selfcheck drives this with an in-memory fake.
import { spellingFrom, type Spelling } from "../writing/spelling.ts";
import { flattenSingleRoot, unzipFiles, zipFiles, type ZipEntry } from "./zip.ts";

export type FileHandle = {
  kind: "file";
  getFile(): Promise<{ arrayBuffer(): Promise<ArrayBuffer>; text(): Promise<string> }>;
  createWritable(): Promise<{ write(d: Uint8Array | string): Promise<void>; close(): Promise<void> }>;
};
export type DirHandle = {
  kind: "directory";
  getDirectoryHandle(name: string, o?: { create?: boolean }): Promise<DirHandle>;
  getFileHandle(name: string, o?: { create?: boolean }): Promise<FileHandle>;
  removeEntry(name: string, o?: { recursive?: boolean }): Promise<void>;
  entries(): AsyncIterable<[string, DirHandle | FileHandle]>;
};

export type ProjectMeta = {
  id: string;
  name: string;
  kind?: "docx"; // a Word document (DocWorkspace), its one file paper.docx; absent: a LaTeX project
  main: string;
  engine: "pdftex" | "xetex";
  journalId: string | null;
  journalName?: string | null; // the target journal's name, so the workspace needn't load the whole index to show it
  templateId: string | null;
  packs?: string[]; // data packs the template needs up front (["all"] for classes like IEEEtran)
  spelling?: Spelling; // the paper's English and its own words (absent: US English, none); carried in backups
  rewriteConsent?: string; // when Rewrite (Claude) was turned on for this paper, in this browser; never in a backup
  createdAt: string;
  updatedAt: string;
};

const META = "project.json";
// The app's own per-project files (the last compiled PDF): not project files,
// not in backups.
const HIDDEN = ".margalink";
const ROOT = "margalink-write";
const TEXT_EXT = /\.(tex|bib|cls|sty|bst|def|cfg|txt|md)$/i;
const FONTSPEC = /\\usepackage(\[[^\]]*\])?\{fontspec\}/; // needs XeTeX

const parts = (path: string) => path.split("/").filter(Boolean);

// A project file's path: relative, no empty/"."/".." segments, and never the
// store's own project.json or .margalink/ folder.
export function checkPath(path: string): void {
  const segs = path.split("/");
  if (!path || segs.some((s) => s === "" || s === "." || s === "..")) throw new Error(`"${path}" isn't a file name this project can use.`);
  if (path === META || segs[0] === HIDDEN) throw new Error(`"${path}" is reserved. Pick another name.`);
}

// A Word project's one file, and its type (for the File the hub windows read).
export const DOCX_MAIN = "paper.docx";
export const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const WORD_DOCUMENT = "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml";
const WORD_TEMPLATE = "application/vnd.openxmlformats-officedocument.wordprocessingml.template.main+xml";

/**
 * A Word file as the document a Word project keeps: a .docx unchanged, byte
 * for byte; a template (.dotx) with its main part declared a document, which
 * is all that differs. Anything else is refused with what to do instead.
 */
export function toDocx(bytes: Uint8Array): Uint8Array {
  // Word's old binary format and password-protected .docx files are both OLE containers.
  if (bytes[0] === 0xd0 && bytes[1] === 0xcf) {
    throw new Error("This is a password-protected document or Word's old .doc format. In Word, remove the password or save it as a .docx, then import it again.");
  }
  const notWord = new Error("That isn't a Word document (.docx). In Word, save it as a .docx, then import it again.");
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw notWord;
  let entries: ZipEntry[];
  try {
    entries = unzipFiles(bytes);
  } catch (err) {
    if (err instanceof Error && /too (many|large)/.test(err.message)) throw new Error(err.message.replace("This zip has too many files", "This Word file has too many parts").replace("This zip", "This Word file"));
    throw notWord;
  }
  const text = (path: string) => {
    const e = entries.find((x) => x.path === path);
    return e ? new TextDecoder().decode(e.data) : null;
  };
  const types = text("[Content_Types].xml");
  // The package names its main part; the editor reads only word/document.xml, where Word puts it.
  const main = text("_rels/.rels")?.match(/<Relationship\b[^>]*relationships\/officeDocument"[^>]*>/)?.[0].match(/Target="\/?([^"]+)"/)?.[1] ?? "word/document.xml";
  if (main !== "word/document.xml" && entries.some((e) => e.path === main)) {
    throw new Error("This Word document is stored in a way the editor can't open. In Word, use Save As to save it again as a .docx, then import that.");
  }
  if (types === null || !entries.some((e) => e.path === "word/document.xml")) throw notWord;
  // What the main part is (a document, a template, macro-enabled) is its own declared type, not any other part's.
  const override = types.match(/<Override\b[^>]*PartName="\/word\/document\.xml"[^>]*\/?>/)?.[0] ?? "";
  const mainType = override.match(/ContentType="([^"]+)"/)?.[1] ?? "";
  if (/macroEnabled/i.test(mainType)) throw new Error("That document contains macros (.docm). In Word, save it as a plain .docx, then import it again.");
  if (mainType !== WORD_TEMPLATE) return bytes;
  const fixed = types.replace(override, override.replace(WORD_TEMPLATE, WORD_DOCUMENT));
  return zipFiles(entries.map((e) => (e.path === "[Content_Types].xml" ? { path: e.path, data: new TextEncoder().encode(fixed) } : e)));
}

export function findMainTex(entries: { path: string; text: string | null }[]): string | null {
  if (entries.some((e) => e.path === "main.tex")) return "main.tex";
  return entries.find((e) => e.path.endsWith(".tex") && e.text && /\\documentclass/.test(e.text))?.path ?? null;
}

/** A file that isn't UTF-8 (a Latin-1 .bib, say): shown read-only rather than edited, which would replace its accented letters for good. */
export class NotUtf8Error extends Error {
  override name = "NotUtf8Error";
  readonly path: string;
  constructor(path: string) {
    super(`${path} isn't UTF-8 text, so it's shown read-only (editing it here would replace its accented letters). Edit it elsewhere, or convert it to UTF-8.`);
    this.path = path;
  }
}

export class ProjectStore {
  private readonly root: DirHandle;
  private readonly now: () => string;
  private metaChain: Promise<unknown> = Promise.resolve();
  constructor(root: DirHandle, now: () => string = () => new Date().toISOString()) {
    this.root = root;
    this.now = now;
  }

  // The real browser store. Asks the browser to keep this data under storage
  // pressure (best effort; the page still shows the "back it up" banner).
  static async open(): Promise<ProjectStore> {
    const storage = navigator.storage;
    if (!storage?.getDirectory) throw new Error("This browser can't save projects (no Origin Private File System). Try a current Chrome, Edge, Firefox or Safari.");
    void storage.persist?.().catch(() => false);
    const top = (await storage.getDirectory()) as unknown as DirHandle;
    return new ProjectStore(await top.getDirectoryHandle(ROOT, { create: true }));
  }

  private async dir(id: string): Promise<DirHandle> {
    return this.root.getDirectoryHandle(id);
  }

  private async fileHandle(id: string, path: string, create: boolean): Promise<FileHandle> {
    const segs = parts(path);
    let d = await this.dir(id);
    for (const s of segs.slice(0, -1)) d = await d.getDirectoryHandle(s, { create });
    return d.getFileHandle(segs[segs.length - 1], { create });
  }

  private async writeRaw(id: string, path: string, data: Uint8Array | string): Promise<void> {
    const w = await (await this.fileHandle(id, path, true)).createWritable();
    await w.write(data);
    await w.close();
  }

  async list(): Promise<ProjectMeta[]> {
    const out: ProjectMeta[] = [];
    for await (const [name, h] of this.root.entries()) {
      if (h.kind !== "directory") continue;
      try {
        out.push(await this.meta(name));
      } catch {
        // a folder without a readable project.json isn't a project
      }
    }
    return out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async create(meta: Omit<ProjectMeta, "id" | "createdAt" | "updatedAt">, files: ZipEntry[]): Promise<ProjectMeta> {
    for (const f of files) checkPath(f.path);
    const id = crypto.randomUUID();
    await this.root.getDirectoryHandle(id, { create: true });
    const at = this.now();
    const full: ProjectMeta = { ...meta, id, createdAt: at, updatedAt: at };
    try {
      for (const f of files) await this.writeRaw(id, f.path, f.data);
      await this.writeRaw(id, META, JSON.stringify(full));
    } catch (err) {
      await this.remove(id).catch(() => {}); // no half-written, invisible project left behind
      throw err;
    }
    return full;
  }

  async remove(id: string): Promise<void> {
    await this.root.removeEntry(id, { recursive: true });
  }

  async meta(id: string): Promise<ProjectMeta> {
    return JSON.parse(await (await (await this.fileHandle(id, META, false)).getFile()).text()) as ProjectMeta;
  }

  // Read-modify-write of project.json, one at a time: in this tab through a
  // promise chain, across tabs through a Web Lock where the browser has them.
  async setMeta(id: string, patch: Partial<ProjectMeta>): Promise<void> {
    const update = () => this.meta(id).then((m) => this.writeRaw(id, META, JSON.stringify({ ...m, ...patch, id, updatedAt: this.now() })));
    const locks = typeof navigator === "undefined" ? undefined : (navigator as { locks?: { request(n: string, f: () => Promise<void>): Promise<void> } }).locks;
    const run = this.metaChain.then(() => (locks ? locks.request(`margalink-meta-${id}`, update) : update()));
    this.metaChain = run.catch(() => {});
    await run;
  }

  async files(id: string): Promise<string[]> {
    const out: string[] = [];
    const walk = async (d: DirHandle, prefix: string) => {
      for await (const [name, h] of d.entries()) {
        const path = prefix + name;
        if (h.kind === "directory") {
          if (path !== HIDDEN) await walk(h, `${path}/`);
        }
        else if (path !== META) out.push(path);
      }
    };
    await walk(await this.dir(id), "");
    return out.sort();
  }

  async read(id: string, path: string): Promise<Uint8Array> {
    return new Uint8Array(await (await (await this.fileHandle(id, path, false)).getFile()).arrayBuffer());
  }

  async readText(id: string, path: string): Promise<string> {
    const bytes = new Uint8Array(await (await (await this.fileHandle(id, path, false)).getFile()).arrayBuffer());
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      throw new NotUtf8Error(path);
    }
  }

  async write(id: string, path: string, data: Uint8Array | string): Promise<void> {
    checkPath(path);
    await this.writeRaw(id, path, data);
    await this.setMeta(id, {});
  }

  async deleteFile(id: string, path: string): Promise<void> {
    const segs = parts(path);
    let d = await this.dir(id);
    for (const s of segs.slice(0, -1)) d = await d.getDirectoryHandle(s);
    await d.removeEntry(segs[segs.length - 1], { recursive: true });
    await this.setMeta(id, {});
  }

  async exists(id: string, path: string): Promise<boolean> {
    return this.fileHandle(id, path, false).then(
      () => true,
      () => false,
    );
  }

  async rename(id: string, from: string, to: string): Promise<void> {
    checkPath(to);
    if (await this.exists(id, to)) throw new Error(`${to} already exists.`);
    const data = await this.read(id, from);
    await this.writeRaw(id, to, data);
    await this.deleteFile(id, from);
  }

  async saveLastPdf(id: string, pdf: Uint8Array): Promise<void> {
    await this.writeRaw(id, `${HIDDEN}/last.pdf`, pdf);
  }

  async lastPdf(id: string): Promise<Uint8Array | null> {
    try {
      return await this.read(id, `${HIDDEN}/last.pdf`);
    } catch {
      return null;
    }
  }

  // The last review of this paper (its report as JSON): the app's own file, beside the last PDF,
  // so it's never a project file and never in a backup. null forgets it.
  async saveLastReview(id: string, json: string | null): Promise<void> {
    if (json !== null) return this.writeRaw(id, `${HIDDEN}/review.json`, json);
    try {
      await (await (await this.dir(id)).getDirectoryHandle(HIDDEN)).removeEntry("review.json");
    } catch {
      // nothing kept: nothing to forget
    }
  }

  async lastReview(id: string): Promise<string | null> {
    try {
      return await this.readText(id, `${HIDDEN}/review.json`);
    } catch {
      return null;
    }
  }

  // With the project's settings (main file, engine, journal, template), which importZip honours.
  async exportZip(id: string): Promise<Uint8Array> {
    const paths = await this.files(id);
    const files = await Promise.all(paths.map(async (path) => ({ path, data: await this.read(id, path) })));
    const meta: Partial<ProjectMeta> = { ...(await this.meta(id)) };
    delete meta.rewriteConsent; // consent is given in this browser, for this copy of the paper
    return zipFiles([...files, { path: META, data: new TextEncoder().encode(JSON.stringify(meta)) }]);
  }

  // A backup, a publisher's template or an Overleaf export: one top-level
  // folder is flattened. A MargaLink backup brings its settings (a Word
  // project's comes back as one); otherwise the main file is the one with
  // \documentclass, and fontspec means XeTeX.
  async importZip(name: string, bytes: Uint8Array, journalId: string | null = null, journalName: string | null = null): Promise<ProjectMeta> {
    const all = flattenSingleRoot(unzipFiles(bytes));
    const entries = all.filter((e) => e.path !== META && !e.path.startsWith(`${HIDDEN}/`));
    const decoder = new TextDecoder();
    const saved = backupSettings(all.find((e) => e.path === META)?.data);
    const doc = saved.kind === "docx" ? entries.find((e) => e.path === DOCX_MAIN) : undefined;
    if (doc) return this.importDocx(name, doc.data, journalId ?? saved.journalId ?? null, journalId ? journalName : (saved.journalName ?? null), saved.spelling);
    const main =
      saved.main && entries.some((e) => e.path === saved.main) ? saved.main : findMainTex(entries.map((e) => ({ path: e.path, text: TEXT_EXT.test(e.path) ? decoder.decode(e.data) : null })));
    if (!main) throw new Error("That zip has no .tex file with a \\documentclass line, so there's nothing to compile.");
    const engine = saved.engine ?? (entries.some((e) => FONTSPEC.test(TEXT_EXT.test(e.path) ? decoder.decode(e.data) : "")) ? "xetex" : "pdftex");
    return this.create(
      {
        name,
        main,
        engine,
        journalId: journalId ?? saved.journalId ?? null,
        journalName: journalId ? journalName : (saved.journalName ?? null),
        templateId: saved.templateId ?? null,
        ...(saved.packs ? { packs: saved.packs } : {}),
        ...(saved.spelling ? { spelling: saved.spelling } : {}),
      },
      entries,
    );
  }

  // A single .tex file. It becomes main.tex whatever it was called (a name
  // TeX compiles safely); its figures and .bib can be added after.
  async importTex(name: string, bytes: Uint8Array, journalId: string | null = null, journalName: string | null = null): Promise<ProjectMeta> {
    const text = new TextDecoder().decode(bytes);
    if (!/\\documentclass/.test(text)) throw new Error("That .tex file has no \\documentclass line, so it can't compile on its own. To bring a whole project, import its .zip.");
    return this.create({ name, main: "main.tex", engine: FONTSPEC.test(text) ? "xetex" : "pdftex", journalId, journalName, templateId: null }, [{ path: "main.tex", data: bytes }]);
  }

  // A Word document or template (DocWorkspace edits it). The engine is a LaTeX
  // setting and unused here; the type requires one.
  async importDocx(name: string, bytes: Uint8Array, journalId: string | null = null, journalName: string | null = null, spelling?: Spelling): Promise<ProjectMeta> {
    return this.create({ name, kind: "docx", main: DOCX_MAIN, engine: "pdftex", journalId, journalName, templateId: null, ...(spelling ? { spelling } : {}) }, [{ path: DOCX_MAIN, data: toDocx(bytes) }]);
  }
}

// The settings a MargaLink backup carries (its project.json), each checked:
// a zip is untrusted input, so anything malformed is simply not used.
function backupSettings(data: Uint8Array | undefined): Partial<Pick<ProjectMeta, "kind" | "main" | "engine" | "journalId" | "journalName" | "templateId" | "packs" | "spelling">> {
  if (!data) return {};
  let m: Record<string, unknown>;
  try {
    m = JSON.parse(new TextDecoder().decode(data));
  } catch {
    return {};
  }
  if (!m || typeof m !== "object") return {};
  const str = (v: unknown) => (typeof v === "string" && v.length <= 500 ? v : undefined);
  return {
    kind: m.kind === "docx" ? "docx" : undefined,
    main: str(m.main),
    engine: m.engine === "pdftex" || m.engine === "xetex" ? m.engine : undefined,
    journalId: str(m.journalId),
    journalName: str(m.journalName),
    templateId: str(m.templateId),
    packs: Array.isArray(m.packs) && m.packs.every((p) => typeof p === "string") ? (m.packs as string[]) : undefined,
    spelling: spellingFrom(m.spelling),
  };
}

// Debounced saving: the editor calls save() on every change; the store is
// written once typing pauses for `delay` ms, with the latest text. flush()
// writes anything pending right away (page hide, compile, switching files).
// `T`: what's saved, text for a LaTeX file; a Word project saves `null` and
// its write() asks the editor for the document's bytes when it runs.
export function autosaver<T = string>(
  write: (id: string, path: string, text: T) => Promise<void>,
  delay = 1000,
  setTimer: (fn: () => void, ms: number) => unknown = (fn, ms) => setTimeout(fn, ms),
  clearTimer: (t: unknown) => void = (t) => clearTimeout(t as ReturnType<typeof setTimeout>),
  onError: (err: unknown) => void = () => {},
) {
  // One entry per file, so a save that failed for one file is still pending
  // after edits to another.
  const pending = new Map<string, { id: string; path: string; text: T }>();
  const key = (id: string, path: string) => `${id}\u0000${path}`;
  let timer: unknown = null;
  // Writes run one at a time, in order; flush() waits for the one in flight,
  // so nothing (a delete, a compile) can run underneath a save.
  let chain: Promise<void> = Promise.resolve();
  const run = () => {
    const batch = [...pending.values()];
    pending.clear();
    timer = null;
    if (!batch.length) return chain;
    const next = chain.then(async () => {
      let failure: unknown = null;
      for (const p of batch) {
        try {
          await write(p.id, p.path, p.text);
        } catch (err) {
          // kept for the next try, unless newer text for that file has replaced it
          if (!pending.has(key(p.id, p.path))) pending.set(key(p.id, p.path), p);
          failure ??= err;
        }
      }
      if (failure !== null) {
        onError(failure);
        throw failure;
      }
    });
    chain = next.catch(() => {});
    return next;
  };
  const save = (id: string, path: string, text: T) => {
    const k = key(id, path);
    if ([...pending.keys()].some((other) => other !== k)) void run().catch(() => {}); // a different file: save the others now (errors go to onError)
    pending.set(k, { id, path, text });
    if (timer !== null) clearTimer(timer);
    timer = setTimer(() => void run().catch(() => {}), delay);
  };
  save.flush = async () => {
    if (timer !== null) clearTimer(timer);
    await run();
  };
  return save;
}
