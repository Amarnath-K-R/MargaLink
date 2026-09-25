// /write's projects, kept in the browser's Origin Private File System — on
// this device only; nothing is uploaded. One folder per project, holding its
// files and a project.json. The directory handles are passed in, so the
// selfcheck drives this with an in-memory fake.
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
  main: string;
  engine: "pdftex" | "xetex";
  journalId: string | null;
  templateId: string | null;
  packs?: string[]; // data packs the template needs up front (["all"] for classes like IEEEtran)
  createdAt: string;
  updatedAt: string;
};

const META = "project.json";
// The app's own per-project files (the last compiled PDF): not project files,
// not in backups.
const HIDDEN = ".margalink";
const ROOT = "margalink-write";
const TEXT_EXT = /\.(tex|bib|cls|sty|bst|def|cfg|txt|md)$/i;

const parts = (path: string) => path.split("/").filter(Boolean);

// A project file's path: relative, no empty/"."/".." segments, and never the
// store's own project.json or .margalink/ folder.
export function checkPath(path: string): void {
  const segs = path.split("/");
  if (!path || segs.some((s) => s === "" || s === "." || s === "..")) throw new Error(`"${path}" isn't a file name this project can use.`);
  if (path === META || segs[0] === HIDDEN) throw new Error(`"${path}" is reserved — pick another name.`);
}

export function findMainTex(entries: { path: string; text: string | null }[]): string | null {
  if (entries.some((e) => e.path === "main.tex")) return "main.tex";
  return entries.find((e) => e.path.endsWith(".tex") && e.text && /\\documentclass/.test(e.text))?.path ?? null;
}

export class ProjectStore {
  private readonly root: DirHandle;
  private readonly now: () => string;
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

  async setMeta(id: string, patch: Partial<ProjectMeta>): Promise<void> {
    await this.writeRaw(id, META, JSON.stringify({ ...(await this.meta(id)), ...patch, id, updatedAt: this.now() }));
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
    return (await (await this.fileHandle(id, path, false)).getFile()).text();
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

  async exportZip(id: string): Promise<Uint8Array> {
    const paths = await this.files(id);
    return zipFiles(await Promise.all(paths.map(async (path) => ({ path, data: await this.read(id, path) }))));
  }

  // A backup, a publisher's template or an Overleaf export: one top-level
  // folder is flattened, and the main file is the one with \documentclass.
  async importZip(name: string, bytes: Uint8Array, journalId: string | null = null): Promise<ProjectMeta> {
    const entries = flattenSingleRoot(unzipFiles(bytes)).filter((e) => e.path !== META && !e.path.startsWith(`${HIDDEN}/`));
    const decoder = new TextDecoder();
    const main = findMainTex(entries.map((e) => ({ path: e.path, text: TEXT_EXT.test(e.path) ? decoder.decode(e.data) : null })));
    if (!main) throw new Error("That zip has no .tex file with a \\documentclass line, so there's nothing to compile.");
    const engine = entries.some((e) => /\\usepackage(\[[^\]]*\])?\{fontspec\}/.test(TEXT_EXT.test(e.path) ? decoder.decode(e.data) : "")) ? "xetex" : "pdftex";
    return this.create({ name, main, engine, journalId, templateId: null }, entries);
  }
}

// Debounced saving: the editor calls save() on every change; the store is
// written once typing pauses for `delay` ms, with the latest text. flush()
// writes anything pending right away (page hide, compile, switching files).
export function autosaver(
  write: (id: string, path: string, text: string) => Promise<void>,
  delay = 1000,
  setTimer: (fn: () => void, ms: number) => unknown = (fn, ms) => setTimeout(fn, ms),
  clearTimer: (t: unknown) => void = (t) => clearTimeout(t as ReturnType<typeof setTimeout>),
  onError: (err: unknown) => void = () => {},
) {
  let pending: { id: string; path: string; text: string } | null = null;
  let timer: unknown = null;
  // Writes run one at a time, in order; flush() waits for the one in flight,
  // so nothing (a delete, a compile) can run underneath a save.
  let chain: Promise<void> = Promise.resolve();
  const run = () => {
    const p = pending;
    pending = null;
    timer = null;
    if (!p) return chain;
    const next = chain.then(async () => {
      try {
        await write(p.id, p.path, p.text);
      } catch (err) {
        pending ??= p; // keep it for the next try, unless newer text has replaced it
        onError(err);
        throw err;
      }
    });
    chain = next.catch(() => {});
    return next;
  };
  const save = (id: string, path: string, text: string) => {
    if (pending && (pending.id !== id || pending.path !== path)) void run().catch(() => {}); // a different file: save the previous one now (errors go to onError)
    pending = { id, path, text };
    if (timer !== null) clearTimer(timer);
    timer = setTimer(() => void run().catch(() => {}), delay);
  };
  save.flush = async () => {
    if (timer !== null) clearTimer(timer);
    await run();
  };
  return save;
}
