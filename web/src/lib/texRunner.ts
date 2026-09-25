// Owns the Web Worker that compiles a /write project with TeX Live in the
// browser (public/texWorker.js → the BusyTeX engine on our R2 host). The
// project's files go to the worker by postMessage and never anywhere else.
import { DATA_PACKS, ENGINE_BASE_URL } from "./texEngine.ts";
import { parseTexLog, type TexDiagnostic } from "./texLog.ts";
import type { ZipEntry } from "./zip.ts";

// Deadline for TeX itself once it runs. Downloading the engine (~140 MB the
// first time) has none: a slow link isn't a hung macro.
export const COMPILE_TIMEOUT_MS = 90_000;

export type TexEngineName = "pdftex" | "xetex";
export type CompileRequest = { files: ZipEntry[]; main: string; engine: TexEngineName; bibtex: boolean | null; packs: string[] };
export type CompileResult = { pdf: Uint8Array | null; log: string; exitCode: number; diagnostics: TexDiagnostic[] };
export type TexStage = "loading-engine" | "loading-package" | "running";

const MESSAGES = {
  timeout: "TeX ran for more than 90 seconds and was stopped — usually a macro that loops. Check your latest edit, then compile again.",
  load_failed: "The TeX engine couldn't load. Check your connection and try again.",
  worker_failed: "The TeX engine stopped unexpectedly. Compile again to restart it.",
} as const;

export class TexCompileError extends Error {
  readonly code: keyof typeof MESSAGES;
  readonly detail: string;
  constructor(code: keyof typeof MESSAGES, detail = "") {
    super(MESSAGES[code]);
    this.name = "TexCompileError";
    this.code = code;
    this.detail = detail;
  }
}

type Incoming = {
  type: "started" | "progress" | "result" | "error";
  id: number;
  stage?: TexStage;
  detail?: string;
  pdf?: Uint8Array | null;
  exitCode?: number;
  log?: string;
  texLog?: string;
  code?: keyof typeof MESSAGES;
};
type Pending = {
  resolve: (m: Incoming) => void;
  reject: (e: Error) => void;
  onProgress?: (s: TexStage, detail?: string) => void;
  timer?: ReturnType<typeof setTimeout>;
  msg: object; // what was posted, to re-send it if the worker has to be replaced
};

let worker: Worker | null = null;
// Every data pack preloaded, for the rest of the session: set by a template
// that declares it (packs: ["all"]) or after a compile fails on a file only a
// pack we didn't load has (BusyTeX only looks for packages in the main .tex,
// not in the class files a template brings — IEEEtran's Times fonts, acmart's
// xkeyval).
let allPacks = false;
// Tested against the log with its line breaks removed: TeX wraps at 79 columns, mid-word.
// Only TeX's own files: a missing figure or \input of the paper's is the author's to fix.
const NEEDS_MORE = /File `[^']+\.(?:sty|cls|clo|fd|def|cfg|bst|ldf|tfm|enc|map|pfb|otf|ttf)' not found|not loadable: Metric \(TFM\) file not found/;
let seq = 0;
let latest = 0;
const pending = new Map<number, Pending>();

let createWorker = (): Worker => new Worker("/texWorker.js");
// Test seam: the selfcheck swaps in an in-process fake.
export function __resetAllPacks(): void {
  allPacks = false;
}
export function __setTexWorkerFactory(f: () => Worker): void {
  reset(new TexCompileError("worker_failed", "replaced"));
  createWorker = f;
}

function reset(reason: Error): void {
  worker?.terminate();
  worker = null;
  for (const p of pending.values()) {
    clearTimeout(p.timer);
    p.reject(reason);
  }
  pending.clear();
}

// A run that loops is stopped with its worker; compiles queued behind it are
// sent again to a fresh one, not failed with its timeout.
function timedOut(id: number): void {
  const waiting = [...pending].filter(([k]) => k !== id);
  for (const [k] of waiting) pending.delete(k);
  reset(new TexCompileError("timeout"));
  if (!waiting.length) return;
  const w = getWorker();
  for (const [k, p] of waiting) {
    pending.set(k, { ...p, timer: undefined });
    w.postMessage(p.msg);
  }
}

function getWorker(): Worker {
  if (worker) return worker;
  const w = createWorker();
  w.onmessage = (e: MessageEvent<Incoming>) => {
    const m = e.data;
    const p = pending.get(m.id);
    if (!p) return;
    if (m.type === "progress") {
      p.onProgress?.(m.stage!, m.detail);
      if (m.stage === "running" && p.timer === undefined) {
        p.timer = setTimeout(() => timedOut(m.id), COMPILE_TIMEOUT_MS);
      }
      return;
    }
    if (m.type === "started") return;
    // An engine that failed (to load, or mid-run) isn't trusted again: the next compile gets a fresh worker.
    if (m.type === "error") return reset(new TexCompileError(m.code ?? "worker_failed", m.detail ?? ""));
    pending.delete(m.id);
    clearTimeout(p.timer);
    p.resolve(m);
  };
  w.onerror = () => reset(new TexCompileError("worker_failed"));
  worker = w;
  return w;
}

// Compiles a project. Resolves null when a newer compile was started meanwhile
// (its result is the one that matters).
export async function compileProject(req: CompileRequest, onProgress?: (stage: TexStage, detail?: string) => void): Promise<CompileResult | null> {
  if (req.packs.includes("all") && !allPacks) {
    allPacks = true;
    // The engine's packs are fixed when it starts: one started without them must go.
    if (worker) reset(new TexCompileError("worker_failed", "restarting with every data pack"));
  }
  const w = getWorker();
  const id = ++seq;
  latest = id;
  const msg = {
    type: "compile",
    id,
    files: req.files,
    main: req.main,
    driver: req.engine === "xetex" ? "xetex_bibtex8_dvipdfmx" : "pdftex_bibtex8",
    bibtex: req.bibtex,
    packs: allPacks ? ["all"] : req.packs,
    base: ENGINE_BASE_URL,
    preload: DATA_PACKS.filter((p) => p.always).map((p) => p.js),
    all: DATA_PACKS.map((p) => p.js),
  };
  const done = new Promise<Incoming>((resolve, reject) => pending.set(id, { resolve, reject, onProgress, msg }));
  w.postMessage(msg);
  try {
    const m = await done;
    if (id !== latest) return null;
    if (!m.pdf && !allPacks && NEEDS_MORE.test((m.texLog ?? "").replace(/\n/g, ""))) {
      // One retry on a fresh worker with every pack (the engine's package
      // state can't be re-initialised in place).
      allPacks = true;
      onProgress?.("loading-package", "all");
      reset(new TexCompileError("worker_failed", "restarting with every data pack"));
      return compileProject(req, onProgress);
    }
    return { pdf: m.pdf ?? null, log: m.log ?? "", exitCode: m.exitCode ?? 1, diagnostics: parseTexLog(m.texLog ?? "") };
  } catch (err) {
    if (id !== latest) return null;
    throw err;
  }
}
