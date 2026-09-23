// Owns the lifecycle of the Web Worker that runs generated matplotlib code
// against real data. Never imports Pyodide or its types — the worker
// (public/figureWorker.mjs) is the only thing that touches Pyodide; this
// file just talks to it over postMessage. See figureWorker.mjs's header
// for why it lives in public/, un-bundled.

const RUN_TIMEOUT_MS = 15_000;

export type FigureImages = { png: string; svg: string; pdf: string };
export type ProgressStage = "loading-runtime" | "loading-packages" | "running";

type WorkerMessage = {
  type: "ready" | "progress" | "result" | "error";
  stage?: ProgressStage;
  message?: string;
  png?: string;
  svg?: string;
  pdf?: string;
};

let worker: Worker | null = null;
let readyPromise: Promise<void> | null = null;

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker("/figureWorker.mjs", { type: "module" });
  }
  return worker;
}

function resetWorker(): void {
  worker?.terminate();
  worker = null;
  readyPromise = null;
}

// Start loading Pyodide the moment a file parses successfully, so it's
// usually ready by the time the model's generated code comes back — free
// latency hiding, nothing more than calling this early. Idempotent: a
// second call while one is already in flight (or already succeeded) is a
// no-op.
export function warmUp(onProgress?: (stage: ProgressStage) => void): void {
  if (readyPromise) return;
  const w = getWorker();
  readyPromise = new Promise<void>((resolve, reject) => {
    const onMessage = (e: MessageEvent<WorkerMessage>) => {
      const data = e.data;
      if (data.type === "progress") {
        onProgress?.(data.stage!);
      } else if (data.type === "ready") {
        w.removeEventListener("message", onMessage);
        resolve();
      } else if (data.type === "error") {
        w.removeEventListener("message", onMessage);
        reject(new Error(data.message));
      }
    };
    w.addEventListener("message", onMessage);
    w.postMessage({ type: "warmup" });
  });
  // A failed warm-up shouldn't wedge every later attempt — tear the worker
  // down so the next warmUp()/runFigureCode() call starts clean.
  readyPromise.catch(() => resetWorker());
}

export async function runFigureCode(code: string, csv: string, onProgress?: (stage: ProgressStage) => void): Promise<FigureImages> {
  warmUp(onProgress);
  const ready = readyPromise;
  if (ready) await ready;
  const w = getWorker();

  return new Promise<FigureImages>((resolve, reject) => {
    let settled = false;
    // terminate() is the only reliable way to stop pathological/looping
    // generated code — Pyodide's own interrupt mechanism needs a
    // SharedArrayBuffer, which needs COOP/COEP response headers, which
    // would break the cross-origin CDN import this design depends on.
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resetWorker();
      reject(new Error("That code didn't finish in 15 seconds — try Regenerate."));
    }, RUN_TIMEOUT_MS);

    const onMessage = (e: MessageEvent<WorkerMessage>) => {
      const data = e.data;
      if (data.type === "progress") {
        onProgress?.(data.stage!);
        return;
      }
      if (settled) return;
      if (data.type === "result") {
        settled = true;
        clearTimeout(timer);
        w.removeEventListener("message", onMessage);
        resolve({ png: data.png!, svg: data.svg!, pdf: data.pdf! });
      } else if (data.type === "error") {
        settled = true;
        clearTimeout(timer);
        w.removeEventListener("message", onMessage);
        reject(new Error(data.message));
      }
    };
    w.addEventListener("message", onMessage);
    w.postMessage({ type: "run", code, csv });
  });
}

// Defense in depth, screened before anything runs — the real isolation is
// the Worker itself (no DOM, no filesystem access, terminated after
// RUN_TIMEOUT_MS regardless of what it's doing), so this exists to reject
// an obviously out-of-bounds generation early with a clear message, not to
// be the only thing standing between generated code and the sandbox.
const DENYLIST: { pattern: RegExp; reason: string }[] = [
  { pattern: /\bimport\s+os\b/, reason: "file/OS access (os)" },
  { pattern: /\bimport\s+sys\b/, reason: "system access (sys)" },
  { pattern: /\bimport\s+subprocess\b/, reason: "process execution (subprocess)" },
  { pattern: /\bimport\s+socket\b/, reason: "network access (socket)" },
  { pattern: /\bimport\s+urllib\b/, reason: "network access (urllib)" },
  { pattern: /\brequests\b/, reason: "network access (requests)" },
  { pattern: /\bimport\s+js\b/, reason: "reaching out of the sandbox (import js)" },
  { pattern: /\bopen\s*\(/, reason: "file access (open)" },
  { pattern: /\b__import__\s*\(/, reason: "dynamic imports (__import__)" },
];

export function isCodeSafeToRun(code: string): string | null {
  for (const { pattern, reason } of DENYLIST) {
    if (pattern.test(code)) return `Generated code was rejected before running: ${reason}.`;
  }
  return null;
}
