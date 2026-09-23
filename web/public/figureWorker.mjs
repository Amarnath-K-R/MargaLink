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
//   → {type:"render", id, spec, csv, dtypes, formats, dpi, hook}
//   → {type:"run", id, code, csv}            legacy script path, removed with the old page
//   ← {type:"progress", id, stage} … {type:"ready", id}
//   ← {type:"result", id, images, meta, hookWarning}
//   ← {type:"error", id, code, detail, traceback}
import { loadPyodide } from "https://cdn.jsdelivr.net/pyodide/v314.0.7/full/pyodide.mjs";

let pyodidePromise = null;
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
    })();
    // A failed load shouldn't wedge every later message on the same rejection.
    pyodidePromise.catch(() => (pyodidePromise = null));
  }
  return pyodidePromise;
}

async function ensureScipy(pyodide, report) {
  if (!scipyPromise) {
    report("loading-scipy");
    scipyPromise = pyodide.loadPackage(["scipy"]);
    scipyPromise.catch(() => (scipyPromise = null));
  }
  await scipyPromise;
}

// Liberation Sans/Serif from our own origin (public/fonts/), registered once.
async function ensureFonts(pyodide, files, report) {
  const missing = files.filter((f) => !fontsLoaded.has(f));
  if (missing.length === 0) return;
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
  report(formats.length === 1 && formats[0] === "png" ? "rendering" : "exporting");
  pyodide.globals.set("__formats__", JSON.stringify(formats));
  pyodide.globals.set("__dpi__", dpi);
  pyodide.globals.set("__hook__", hook ?? null);
  const out = pyJson(pyodide, "figurelib.run_request(__spec_obj__, __df__, json.loads(__formats__), __dpi__, __hook__)");
  if (out.error) return { type: "error", id, ...out.error };
  return { type: "result", id, images: out.images, meta: out.meta, hookWarning: out.hookWarning };
}

// Legacy: runs a whole Claude-written script (the pre-spec page). Removed
// together with that page.
async function runScript({ id, code, csv }, report) {
  const pyodide = await getPyodide(report);
  pyodide.globals.set("__csv__", csv);
  report("rendering");
  await pyodide.runPythonAsync(
    'import io, base64\nimport pandas as pd\nimport matplotlib.pyplot as plt\nplt.close("all")\ndf = pd.read_csv(io.StringIO(__csv__))',
  );
  await pyodide.runPythonAsync(code);
  await pyodide.runPythonAsync(
    '__out__ = {}\nfor __fmt__ in ("png", "svg", "pdf"):\n    __buf__ = io.BytesIO()\n    plt.gcf().savefig(__buf__, format=__fmt__, dpi=200, bbox_inches="tight")\n    __out__[__fmt__] = base64.b64encode(__buf__.getvalue()).decode()',
  );
  const images = pyodide.globals.get("__out__").toJs({ dict_converter: Object.fromEntries });
  return { type: "result", id, images, meta: null, hookWarning: null };
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
    } else if (msg.type === "run") {
      self.postMessage(await runScript(msg, report));
    }
  } catch (err) {
    // Loading failures (network, CDN) — no Python traceback involved.
    self.postMessage({ type: "error", id: msg.id, code: "load_failed", detail: {}, traceback: String(err?.message ?? err) });
  }
}

// One message at a time: renders share the cached frame and Python globals,
// so interleaving two at an await point would render one against the other's data.
let queue = Promise.resolve();
self.onmessage = (event) => {
  queue = queue.then(() => handle(event.data));
};
