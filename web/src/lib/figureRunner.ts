// Owns the lifecycle of the Web Worker that renders figures against real
// data. Never imports Pyodide or its types — the worker
// (public/figureWorker.mjs) is the only thing that touches Pyodide; this
// file just talks to it over postMessage. See figureWorker.mjs's header
// for why it lives in public/, un-bundled.
import type { FigureSpec } from "./figureSpec.ts";
import type { Dtype } from "./spreadsheet.ts";

export const PREVIEW_TIMEOUT_MS = 20_000;
export const EXPORT_TIMEOUT_MS = 45_000;
// A render that has to fetch SciPy or fonts first gets this long instead —
// and so does the wait in the worker's queue, before a job has started.
export const LOAD_TIMEOUT_MS = 90_000;

export type ImageFormat = "png" | "tiff" | "svg" | "pdf";
export type ProgressStage = "loading-runtime" | "loading-packages" | "loading-scipy" | "loading-fonts" | "rendering" | "exporting";
export type TestResult = { pair: string; p: number | null; test: string }; // p null: the test was undefined (e.g. constant data)
export type RenderMeta = { font: string; panels: { n: Record<string, number>; tests: TestResult[] }[] };
export type RenderResult = { images: Partial<Record<ImageFormat, string>>; meta: RenderMeta; hookWarning: string | null };
export type RenderRequest = { spec: FigureSpec; csv: string; dtypes: Record<string, Dtype>; formats: ImageFormat[]; dpi: number; hook: string | null };

// A render that failed. `message` is plain prose built from `code` and
// `detail` (column names, roles, enum values — never a cell value).
// `traceback` can quote a value: show it only locally, never send it.
export class FigureRenderError extends Error {
  readonly code: string;
  readonly detail: Record<string, unknown>;
  readonly traceback: string;
  constructor(code: string, detail: Record<string, unknown>, traceback: string) {
    super(describeRenderError(code, detail));
    this.name = "FigureRenderError";
    this.code = code;
    this.detail = detail;
    this.traceback = traceback;
  }
}

export function describeRenderError(code: string, d: Record<string, unknown>): string {
  const col = d.column ? `"${d.column}"` : "";
  switch (code) {
    case "missing_column":
      return d.column ? `Column ${col} (for ${d.role}) isn't in the data.` : `Choose a column for "${d.role}".`;
    case "wrong_dtype":
      return `Column ${col} can't be used for ${d.role} — it needs ${[d.expected].flat().join(" or ")} values.`;
    case "empty_after_na":
      return `No rows are left once empty cells in ${[d.columns].flat().map((c) => `"${c}"`).join(", ")} are dropped.`;
    case "unknown_group":
      return `The group "${d.ref}" isn't in the data.`;
    case "too_few_groups":
      return `Not enough groups: ${d.reason}.`;
    case "scipy_required":
      return "The statistics library couldn't load. Turn off the significance test or error type to render without it.";
    case "unsupported_combo":
      return d.reason ? `That combination isn't supported: ${d.reason}.` : `That combination isn't supported (${Object.values(d).filter(Boolean).join(", ")}).`;
    case "hook_failed":
      return "The custom tweak isn't a customize(fig, axes, df) function, so it can't run.";
    case "load_failed":
      return "The figure engine couldn't load. Check your connection and try again.";
    case "timeout":
      return "The figure took too long to draw and was stopped. Try fewer points or panels.";
    default:
      return d.stage === "load" ? "The data couldn't be read into the figure engine." : `Drawing the figure failed${d.family ? ` (${d.family} panel)` : ""}.`;
  }
}

type Outgoing = { type: "warmup"; scipy: boolean; fonts: boolean } | ({ type: "render"; preview: boolean } & RenderRequest);
type Incoming = {
  type: "started" | "progress" | "ready" | "result" | "error";
  id: number;
  stage?: ProgressStage;
  images?: RenderResult["images"];
  meta?: RenderMeta;
  hookWarning?: string | null;
  code?: string;
  detail?: Record<string, unknown>;
  traceback?: string;
};
type Pending = {
  resolve: (m: Incoming) => void;
  reject: (e: Error) => void;
  onProgress?: (s: ProgressStage) => void;
  timer?: ReturnType<typeof setTimeout>;
  timeoutMs: number | null; // armed when the worker starts the job, not when it's queued
};

let worker: Worker | null = null;
let seq = 0;
let latestPreview = 0;
let readyPromise: Promise<void> | null = null;
const pending = new Map<number, Pending>();

// Test seam: the selfcheck swaps in an in-process fake.
let createWorker = (): Worker => new Worker("/figureWorker.mjs", { type: "module" });
export function __setWorkerFactory(f: () => Worker): void {
  resetWorker(new Error("worker replaced"));
  createWorker = f;
}

function getWorker(): Worker {
  if (worker) return worker;
  const w = createWorker();
  w.onmessage = (e: MessageEvent<Incoming>) => {
    const m = e.data;
    const p = pending.get(m.id);
    if (!p) return;
    if (m.type === "started") {
      if (p.timeoutMs !== null) rearm(m.id, p.timeoutMs);
      return;
    }
    if (m.type === "progress") {
      p.onProgress?.(m.stage!);
      if (m.stage === "loading-scipy" || m.stage === "loading-fonts") rearm(m.id, LOAD_TIMEOUT_MS);
      return;
    }
    pending.delete(m.id);
    clearTimeout(p.timer);
    if (m.type === "error") p.reject(new FigureRenderError(m.code ?? "render_failed", m.detail ?? {}, m.traceback ?? ""));
    else p.resolve(m);
  };
  worker = w;
  return w;
}

// terminate() is the only reliable way to stop a runaway render — Pyodide's
// own interrupt needs SharedArrayBuffer, which needs COOP/COEP headers,
// which would break the cross-origin CDN import this design depends on.
function resetWorker(reason: Error): void {
  worker?.terminate();
  worker = null;
  readyPromise = null;
  for (const [, p] of pending) {
    clearTimeout(p.timer);
    p.reject(reason);
  }
  pending.clear();
}

function rearm(id: number, ms: number): void {
  const p = pending.get(id);
  if (!p) return;
  clearTimeout(p.timer);
  p.timer = setTimeout(() => resetWorker(new FigureRenderError("timeout", {}, "")), ms);
}

function send(msg: Outgoing, timeoutMs: number | null, onProgress?: (s: ProgressStage) => void): { id: number; done: Promise<Incoming> } {
  const w = getWorker();
  const id = ++seq;
  const done = new Promise<Incoming>((resolve, reject) => pending.set(id, { resolve, reject, onProgress, timeoutMs }));
  if (timeoutMs !== null) rearm(id, LOAD_TIMEOUT_MS); // queue wait; the real deadline starts on "started"
  w.postMessage({ ...msg, id });
  return { id, done };
}

// Start loading Pyodide early (on file parse), so it's usually ready by the
// time the first figure is asked for. Idempotent while one is in flight or
// has succeeded; scipy/fonts ask for those extras too. No timeout — a slow
// first download isn't a runaway render.
export function warmUp(opts: { scipy?: boolean; fonts?: boolean } = {}, onProgress?: (stage: ProgressStage) => void): Promise<void> {
  if (!readyPromise || opts.scipy || opts.fonts) {
    const ready = send({ type: "warmup", scipy: !!opts.scipy, fonts: !!opts.fonts }, null, onProgress).done.then(() => undefined);
    // A failed warm-up shouldn't wedge every later call — start clean next time.
    ready.catch(() => resetWorker(new Error("warm-up failed")));
    readyPromise = ready;
  }
  return readyPromise;
}

async function renderOnce(req: RenderRequest, timeoutMs: number, onProgress?: (s: ProgressStage) => void, preview = false): Promise<RenderResult | null> {
  await warmUp({}, onProgress);
  const { id, done } = send({ type: "render", ...req, preview }, timeoutMs, onProgress);
  if (preview) latestPreview = id;
  try {
    const m = await done;
    if (preview && id !== latestPreview) return null;
    return { images: m.images ?? {}, meta: m.meta!, hookWarning: m.hookWarning ?? null };
  } catch (err) {
    if (preview && id !== latestPreview) return null;
    throw err;
  }
}

// Makes every preview still in flight stale (resolves null) — for when the
// preview is cleared or the figure became invalid, so a late result can't
// reappear over it.
export function cancelPreviews(): void {
  latestPreview = 0;
}

// Live preview. Resolves null when a newer preview was requested meanwhile
// (its result or error is stale — the caller just ignores it).
export function renderFigure(req: RenderRequest, onProgress?: (stage: ProgressStage) => void): Promise<RenderResult | null> {
  return renderOnce(req, PREVIEW_TIMEOUT_MS, onProgress, true);
}

// Publication export — never superseded by a preview.
export async function exportFigure(req: RenderRequest, onProgress?: (stage: ProgressStage) => void): Promise<RenderResult> {
  return (await renderOnce(req, EXPORT_TIMEOUT_MS, onProgress))!;
}

// The custom-code denylist lives with the hook prompt (pure, so the server
// enforces the same rules); re-exported for the page and the worker path.
export { isCodeSafeToRun } from "./figurePrompt.ts";
