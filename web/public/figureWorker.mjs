// Renders figures against real data, entirely inside this worker — never on
// the main thread, never on a server. Plain JS on purpose: this file is not
// bundled or typechecked. All typed logic lives in src/lib/figureRunner.ts,
// the only thing that talks to this file, over postMessage. The drawing
// itself is public/figurelib.py (the same file the CPython selfcheck in
// web/figurelib/ tests); this file only loads it and passes messages.
//
// Deliberately lives in public/, not imported from src/ as
// `new Worker(new URL("./worker.ts", import.meta.url))` — that form hands
// the worker to Turbopack, which would try to bundle this file's imports
// (Pyodide) into the static export. Pyodide is ~30MB; Cloudflare Pages
// rejects any single file over 25MB. Living in public/, the static export
// copies this file verbatim and the bundler never looks inside it — the
// same reason src/lib/embed.ts CDN-loads onnxruntime-web instead of
// letting the bundler discover it.
//
// Protocol (every message carries the caller's id):
//   → {type:"warmup", id, scipy, fonts}
//   → {type:"render", id, spec, csv, dtypes, formats, dpi, hook, preview}
//   ← {type:"started", id}                    the job left the queue (the caller's timeout starts here)
//   ← {type:"progress", id, stage} … {type:"ready", id}
//   ← {type:"result", id, images, meta, hookWarning}
//   ← {type:"error", id, code, detail, traceback}
import { loadPyodide } from "https://cdn.jsdelivr.net/pyodide/v314.0.7/full/pyodide.mjs";

let pyodidePromise = null;

// Marks a failure as "couldn't load" (network, CDN) rather than a render bug.
function asLoadError(err) {
  const e = err instanceof Error ? err : new Error(String(err));
  e.isLoad = true;
  throw e;
}
let scipyPromise = null;
const fontsLoaded = new Set();
let frameCsv = null;
let frameDtypes = null;

function getPyodide(report) {
  if (!pyodidePromise) {
    pyodidePromise = (async () => {
      report("loading-runtime");
      const pyodide = await loadPyodide();
      report("loading-packages");
      // Explicit list, not loadPackagesFromImports() — deterministic, and
      // SciPy (+14 MB) stays out until a figure actually asks for a test.
      await pyodide.loadPackage(["pandas", "matplotlib", "pillow"]);
      const res = await fetch("/figurelib.py");
      if (!res.ok) throw new Error(`Couldn't load the figure renderer (HTTP ${res.status}).`);
      pyodide.FS.writeFile("/home/pyodide/figurelib.py", await res.text());
      pyodide.runPython("import json, figurelib");
      return pyodide;
    })().catch(asLoadError);
    // A failed load shouldn't wedge every later message on the same rejection.
    pyodidePromise.catch(() => (pyodidePromise = null));
  }
  return pyodidePromise;
}

async function ensureScipy(pyodide, report) {
  if (!scipyPromise) {
    report("loading-scipy");
    scipyPromise = pyodide.loadPackage(["scipy"]).catch(asLoadError);
    scipyPromise.catch(() => (scipyPromise = null));
  }
  await scipyPromise;
}

// Liberation Sans/Serif from our own origin (public/fonts/), registered once.
async function ensureFonts(pyodide, files, report) {
  const missing = files.filter((f) => !fontsLoaded.has(f));
  if (missing.length === 0) return;
  try {
    await fetchFonts(pyodide, missing, report);
  } catch (err) {
    asLoadError(err);
  }
}

async function fetchFonts(pyodide, missing, report) {
  report("loading-fonts");
  pyodide.FS.mkdirTree("/fonts");
  for (const file of missing) {
    const res = await fetch(`/fonts/${file}`);
    if (!res.ok) throw new Error(`Couldn't load the font ${file} (HTTP ${res.status}).`);
    pyodide.FS.writeFile(`/fonts/${file}`, new Uint8Array(await res.arrayBuffer()));
  }
  pyodide.globals.set("__font_paths__", JSON.stringify(missing.map((f) => `/fonts/${f}`)));
  pyodide.runPython("figurelib.register_fonts(json.loads(__font_paths__))");
  for (const f of missing) fontsLoaded.add(f);
}

// Before any custom-code tweak runs, this worker loads everything it could
// still need (SciPy, every bundled font) and then removes every way to reach
// the network, for the rest of its life: non-configurable, non-writable
// throwing stubs on the global object and on its prototypes, so a tweak can't
// delete its way back to the original. This is the enforcement layer behind
// isCodeSafeToRun (which keeps a tweak from reaching JavaScript at all) and
// the user's explicit "Run this tweak" click.
// Dynamic import() can't be stubbed, so everything that turns a string into
// code is closed too. ponytail: a CSP header on this file (connect-src /
// script-src limited to self + the Pyodide CDN path) is the upgrade if these
// JS-level locks ever prove thin.
let networkLocked = false;
const NETWORK_APIS = ["fetch", "XMLHttpRequest", "WebSocket", "EventSource", "importScripts", "Worker", "SharedWorker", "WebTransport", "BroadcastChannel", "caches"];
async function lockNetwork(pyodide, report) {
  if (networkLocked) return;
  await ensureScipy(pyodide, report);
  await ensureFonts(pyodide, pyJson(pyodide, "[f for fs in figurelib.FONT_FILES.values() for f in fs]"), report);
  const deny = () => {
    throw new Error("Network access is disabled once custom code can run.");
  };
  const scopes = [];
  for (let o = self; o && o !== Object.prototype; o = Object.getPrototypeOf(o)) scopes.push(o);
  for (const scope of scopes) {
    for (const name of NETWORK_APIS) {
      try {
        Object.defineProperty(scope, name, { value: deny, writable: false, configurable: false });
      } catch {
        // already non-configurable on this scope — the own stub on `self` still shadows it
      }
    }
  }
  // import() can't be stubbed, but it needs code built from a string: close
  // eval, every function constructor, and string-form timers.
  Object.defineProperty(self, "eval", { value: deny, writable: false, configurable: false });
  // Stand-ins keep each constructor's `prototype`, so `x instanceof Function`
  // (which Pyodide's glue relies on) still works; calling them throws.
  const standIn = (proto) => {
    const f = function () {
      deny();
    };
    Object.defineProperty(f, "prototype", { value: proto, writable: false });
    return f;
  };
  for (const fn of [function () {}, async function () {}, function* () {}, async function* () {}]) {
    const proto = Object.getPrototypeOf(fn);
    Object.defineProperty(proto, "constructor", { value: standIn(proto), writable: false, configurable: false });
  }
  Object.defineProperty(self, "Function", { value: standIn(Function.prototype), writable: false, configurable: false });
  for (const name of ["setTimeout", "setInterval"]) {
    const original = self[name].bind(self);
    const guarded = (handler, ...rest) => (typeof handler === "function" ? original(handler, ...rest) : deny());
    for (const scope of scopes) {
      try {
        Object.defineProperty(scope, name, { value: guarded, writable: false, configurable: false });
      } catch {
        // see above
      }
    }
  }
  networkLocked = true;
}

const pyJson = (pyodide, expr) => JSON.parse(pyodide.runPython(`json.dumps(${expr})`));

async function render(msg, report) {
  const { id, spec, csv, dtypes, formats, dpi, hook } = msg;
  if (hook && !hook.includes("def customize(")) {
    return { type: "error", id, code: "hook_failed", detail: { reason: "no customize" }, traceback: "" };
  }
  const pyodide = await getPyodide(report);
  const dtypesJson = JSON.stringify(dtypes);
  // The frame is re-parsed only when the data or its typing changed — a
  // control tweak re-renders against the cached frame.
  if (csv !== frameCsv || dtypesJson !== frameDtypes) {
    pyodide.globals.set("__csv__", csv);
    pyodide.globals.set("__dtypes__", dtypesJson);
    try {
      pyodide.runPython("__df__ = figurelib.load_frame(__csv__, json.loads(__dtypes__)); del __csv__");
    } catch (err) {
      frameCsv = frameDtypes = null;
      return { type: "error", id, code: "render_failed", detail: { stage: "load" }, traceback: String(err?.message ?? err) };
    }
    frameCsv = csv;
    frameDtypes = dtypesJson;
  }
  pyodide.globals.set("__spec__", JSON.stringify(spec));
  pyodide.runPython("__spec_obj__ = json.loads(__spec__)");
  if (pyJson(pyodide, "figurelib.needs_scipy(__spec_obj__)")) await ensureScipy(pyodide, report);
  await ensureFonts(pyodide, pyJson(pyodide, "figurelib.fonts_for(__spec_obj__)"), report);
  if (hook) await lockNetwork(pyodide, report);
  report(formats.length === 1 && formats[0] === "png" ? "rendering" : "exporting");
  pyodide.globals.set("__formats__", JSON.stringify(formats));
  pyodide.globals.set("__dpi__", dpi);
  pyodide.globals.set("__hook__", hook ?? null);
  const out = pyJson(pyodide, "figurelib.run_request(__spec_obj__, __df__, json.loads(__formats__), __dpi__, __hook__)");
  if (out.error) return { type: "error", id, ...out.error };
  return { type: "result", id, images: out.images, meta: out.meta, hookWarning: out.hookWarning };
}

async function handle(msg) {
  const report = (stage) => self.postMessage({ type: "progress", id: msg.id, stage });
  try {
    if (msg.type === "warmup") {
      const pyodide = await getPyodide(report);
      if (msg.scipy) await ensureScipy(pyodide, report);
      if (msg.fonts) await ensureFonts(pyodide, pyJson(pyodide, "figurelib.FONT_FILES['sans-serif']"), report);
      self.postMessage({ type: "ready", id: msg.id });
    } else if (msg.type === "render") {
      self.postMessage(await render(msg, report));
    }
  } catch (err) {
    // Loading failures (network, CDN) vs. anything else going wrong mid-render.
    const code = err?.isLoad ? "load_failed" : "render_failed";
    self.postMessage({ type: "error", id: msg.id, code, detail: code === "render_failed" ? { stage: "worker" } : {}, traceback: String(err?.message ?? err) });
  }
}

// One job at a time: renders share the cached frame and Python globals, so
// interleaving two at an await point would render one against the other's
// data. A new preview replaces any preview still waiting (only the newest
// matters; the replaced ones answer "superseded"), so dragging a control
// can't pile up a queue of stale renders.
const jobs = [];
let running = false;
self.onmessage = (event) => {
  const msg = event.data;
  if (msg.type === "render" && msg.preview) {
    for (let i = jobs.length - 1; i >= 0; i--) {
      if (jobs[i].type === "render" && jobs[i].preview) {
        self.postMessage({ type: "error", id: jobs[i].id, code: "superseded", detail: {}, traceback: "" });
        jobs.splice(i, 1);
      }
    }
  }
  jobs.push(msg);
  void pump();
};
async function pump() {
  if (running) return;
  running = true;
  while (jobs.length) {
    const msg = jobs.shift();
    self.postMessage({ type: "started", id: msg.id });
    await handle(msg);
  }
  running = false;
}
