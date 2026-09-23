// Runnable check for figureRunner.ts: message routing, stale-preview drops,
// errors, timeouts (against an in-process fake Worker — the real Pyodide
// worker is covered by the smoke test), and the custom-code denylist.
//   node src/lib/figureRunner.selfcheck.ts
import assert from "node:assert/strict";
import { mock } from "node:test";
import { DEFAULT_SPEC } from "./figureSpec.ts";
import {
  FigureRenderError,
  PREVIEW_TIMEOUT_MS,
  __setWorkerFactory,
  cancelPreviews,
  exportFigure,
  isCodeSafeToRun,
  renderFigure,
  type RenderRequest,
} from "./figureRunner.ts";

type Msg = { type: string; id: number; [k: string]: unknown };
// Replies are sent only when the test says so, so ordering is explicit.
class FakeWorker {
  static all: FakeWorker[] = [];
  onmessage: ((e: { data: unknown }) => void) | null = null;
  inbox: Msg[] = [];
  terminated = false;
  holdQueue = false; // true: renders sit in the worker's queue (no "started")
  constructor() {
    FakeWorker.all.push(this);
  }
  postMessage(m: Msg) {
    this.inbox.push(m);
    if (m.type === "warmup") this.reply({ type: "ready", id: m.id });
    if (m.type === "render" && !this.holdQueue) this.reply({ type: "started", id: m.id });
  }
  terminate() {
    this.terminated = true;
  }
  reply(data: object) {
    queueMicrotask(() => this.onmessage?.({ data }));
  }
  renders() {
    return this.inbox.filter((m) => m.type === "render");
  }
}
const flush = () => new Promise<void>((r) => setImmediate(r));
const REQ: RenderRequest = { spec: DEFAULT_SPEC, csv: "a,b\n1,2\n", dtypes: { a: "numeric", b: "numeric" }, formats: ["png"], dpi: 110, hook: null };
const META = { font: "Liberation Sans", panels: [] };

mock.timers.enable({ apis: ["setTimeout"] });
__setWorkerFactory(() => new FakeWorker() as unknown as Worker);

// 1. overlapping previews: the older one resolves null even if it finishes last
{
  const first = renderFigure(REQ);
  const second = renderFigure(REQ);
  await flush();
  const w = FakeWorker.all.at(-1)!;
  const [r1, r2] = w.renders();
  w.reply({ type: "result", id: r2.id, images: { png: "SECOND" }, meta: META, hookWarning: null });
  w.reply({ type: "result", id: r1.id, images: { png: "FIRST" }, meta: META, hookWarning: null });
  assert.equal((await second)?.images.png, "SECOND");
  assert.equal(await first, null, "a superseded preview is dropped");
}

// 2. a worker error becomes FigureRenderError with prose; the traceback rides along only as a field
{
  const p = renderFigure(REQ);
  await flush();
  const w = FakeWorker.all.at(-1)!;
  w.reply({ type: "error", id: w.renders().at(-1)!.id, code: "missing_column", detail: { role: "x", column: "dose" }, traceback: "KeyError: 'SECRET-VALUE'" });
  const err = await p.then(() => null, (e: unknown) => e);
  assert.ok(err instanceof FigureRenderError);
  assert.equal(err.code, "missing_column");
  assert.match(err.message, /Column "dose" \(for x\) isn't in the data/);
  assert.ok(!err.message.includes("SECRET-VALUE"), "the traceback never becomes the message");
  assert.equal(err.traceback, "KeyError: 'SECRET-VALUE'");
}

// 3. a hung render times out, the worker is terminated, and the next render gets a fresh one
{
  const p = renderFigure(REQ);
  await flush();
  const hung = FakeWorker.all.at(-1)!;
  mock.timers.tick(PREVIEW_TIMEOUT_MS + 1);
  const err = await p.then(() => null, (e: unknown) => e);
  assert.ok(err instanceof FigureRenderError && err.code === "timeout");
  assert.ok(hung.terminated);
  const next = exportFigure({ ...REQ, formats: ["tiff"] });
  await flush();
  const fresh = FakeWorker.all.at(-1)!;
  assert.notEqual(fresh, hung);
  fresh.reply({ type: "result", id: fresh.renders()[0].id, images: { tiff: "T" }, meta: META, hookWarning: null });
  assert.equal((await next).images.tiff, "T");
}

// 4. loading SciPy extends the deadline instead of killing the render
{
  const p = renderFigure(REQ);
  await flush();
  const w = FakeWorker.all.at(-1)!;
  const id = w.renders().at(-1)!.id;
  w.reply({ type: "progress", id, stage: "loading-scipy" });
  await flush();
  mock.timers.tick(PREVIEW_TIMEOUT_MS + 1);
  assert.ok(!w.terminated, "still loading, not hung");
  w.reply({ type: "result", id, images: { png: "OK" }, meta: META, hookWarning: "a warning" });
  const r = await p;
  assert.equal(r?.hookWarning, "a warning");
}

// 5. a render still waiting in the worker's queue isn't killed at the preview deadline
{
  const p = exportFigure(REQ);
  await flush();
  const w = FakeWorker.all.at(-1)!;
  w.holdQueue = true;
  const q = renderFigure(REQ);
  await flush();
  const queuedId = w.renders().at(-1)!.id;
  mock.timers.tick(PREVIEW_TIMEOUT_MS + 1);
  assert.ok(!w.terminated, "queued, not hung");
  w.reply({ type: "result", id: w.renders()[w.renders().length - 2].id, images: { png: "E" }, meta: META, hookWarning: null });
  w.reply({ type: "started", id: queuedId });
  w.reply({ type: "result", id: queuedId, images: { png: "Q" }, meta: META, hookWarning: null });
  assert.equal((await p).images.png, "E");
  assert.equal((await q)?.images.png, "Q");
  // superseded while queued → resolves null, no error
  const a = renderFigure(REQ);
  await flush();
  w.reply({ type: "error", id: w.renders().at(-1)!.id, code: "superseded", detail: {}, traceback: "" });
  const b = renderFigure(REQ);
  await flush();
  w.reply({ type: "started", id: w.renders().at(-1)!.id });
  w.reply({ type: "result", id: w.renders().at(-1)!.id, images: { png: "B" }, meta: META, hookWarning: null });
  assert.equal(await a, null);
  assert.equal((await b)?.images.png, "B");
  // cancelPreviews makes an in-flight preview stale
  const c = renderFigure(REQ);
  await flush();
  cancelPreviews();
  w.reply({ type: "result", id: w.renders().at(-1)!.id, images: { png: "LATE" }, meta: META, hookWarning: null });
  assert.equal(await c, null, "a late result after the preview was cleared is dropped");
}

mock.timers.reset();

// 5. the custom-code denylist
const BENIGN = `def customize(fig, axes, df):
    axes[0].set_title("Change by arm")
    axes[0].axhline(0, color="0.5", lw=0.5)
`;
assert.equal(isCodeSafeToRun(BENIGN), null, "an ordinary customize() passes");
assert.equal(isCodeSafeToRun("import matplotlib.ticker as mticker\nfrom numpy import linspace\n" + BENIGN), null, "plotting-stack imports pass");
for (const snippet of [
  "import os",
  "from os import path",
  "import sys",
  "import subprocess",
  "import socket",
  "import urllib.request",
  "requests.get('http://example.com')",
  "import js",
  "from pyodide.http import pyfetch",
  "open('/etc/passwd')",
  "__import__('os')",
  "eval('1')",
  "exec('x=1')",
  "getattr(fig, 'savefig')",
  "fig.savefig('x.png')",
  "plt.show()",
  // bypasses a reviewer found against the old regex denylist
  "import numpy, js",
  "import pyodide_js",
  "__builtins__['__imp'+'ort__']('js')",
  "importlib.import_module('j'+'s')",
  "from pyodide.ffi import to_js",
  "import matplotlib.pyplot as plt, os",
  "df.to_csv('x')",
  "pd.read_csv('https://x')",
  "np.__class__",
]) {
  assert.notEqual(isCodeSafeToRun(snippet), null, `"${snippet}" should be rejected`);
}

console.log("figureRunner.selfcheck: OK");
