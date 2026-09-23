// Runs generated matplotlib code against real data, entirely inside this
// worker — never on the main thread, never on a server. Plain JS on
// purpose: this file is not bundled or typechecked. All typed logic lives
// in src/lib/figureRunner.ts, which is the only thing that talks to this
// file, over postMessage.
//
// Deliberately lives in public/, not imported from src/ as
// `new Worker(new URL("./worker.ts", import.meta.url))` — that form hands
// the worker to Turbopack, which would try to bundle this file's imports
// (Pyodide) into the static export. Pyodide is ~30MB; Cloudflare Pages
// rejects any single file over 25MB. Living in public/, the static export
// copies this file verbatim and the bundler never looks inside it — the
// same reason src/lib/embed.ts CDN-loads onnxruntime-web instead of
// letting the bundler discover it.
import { loadPyodide } from "https://cdn.jsdelivr.net/pyodide/v314.0.7/full/pyodide.mjs";

let pyodidePromise = null;

function getPyodide(report) {
  if (!pyodidePromise) {
    pyodidePromise = (async () => {
      report("loading-runtime");
      const pyodide = await loadPyodide();
      report("loading-packages");
      // Explicit package list, not loadPackagesFromImports() — deterministic,
      // and lets warm-up start before any generated code exists to inspect.
      // seaborn is NOT available in this Pyodide distribution (would need
      // micropip fetching from PyPI at runtime, another origin, another
      // failure mode) — figurePrompt.ts's system prompt forbids it.
      await pyodide.loadPackage(["pandas", "matplotlib"]);
      return pyodide;
    })();
  }
  return pyodidePromise;
}

// Three separate statements, not one concatenated string — a syntax or
// runtime error in the generated code then produces a traceback whose
// line numbers match exactly what the UI shows the user, rather than
// being offset by however many preamble/epilogue lines came before it.
const PREAMBLE = `
import io, base64
import pandas as pd
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
df = pd.read_csv(io.StringIO(__csv__))
`.trim();

const EPILOGUE = `
fig = plt.gcf()
__out__ = {}
for __fmt__ in ("png", "svg", "pdf"):
    __buf__ = io.BytesIO()
    fig.savefig(__buf__, format=__fmt__, dpi=200, bbox_inches="tight")
    __out__[__fmt__] = base64.b64encode(__buf__.getvalue()).decode()
`.trim();

function errorMessage(err) {
  return String((err && err.message) || err);
}

self.onmessage = async (event) => {
  const { type } = event.data;
  const report = (stage) => self.postMessage({ type: "progress", stage });

  if (type === "warmup") {
    try {
      await getPyodide(report);
      self.postMessage({ type: "ready" });
    } catch (err) {
      self.postMessage({ type: "error", message: errorMessage(err) });
    }
    return;
  }

  if (type === "run") {
    const { code, csv } = event.data;
    try {
      const pyodide = await getPyodide(report);
      pyodide.globals.set("__csv__", csv);
      report("running");
      await pyodide.runPythonAsync(PREAMBLE);
      await pyodide.runPythonAsync(code);
      await pyodide.runPythonAsync(EPILOGUE);
      const out = pyodide.globals.get("__out__").toJs({ dict_converter: Object.fromEntries });
      self.postMessage({ type: "result", png: out.png, svg: out.svg, pdf: out.pdf });
    } catch (err) {
      self.postMessage({ type: "error", message: errorMessage(err) });
    }
  }
};
