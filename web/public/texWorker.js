// Compiles a /write project with TeX Live, entirely inside this worker. The
// engine is BusyTeX (MIT; TeX Live compiled to WebAssembly), unmodified, loaded
// from our R2 bucket; its pipeline script is classic (importScripts), so this
// is a classic worker. Plain JS on purpose: not bundled, not typechecked — the
// typed side is src/lib/texRunner.ts, the only thing that talks to this file.
// The project's files arrive by postMessage and never leave the worker.
//
// Protocol (every message carries the caller's id):
//   → {type:"compile", id, files:[{path, data}], main, driver, bibtex, packs, base, preload, all}
//   ← {type:"started", id} {type:"progress", id, stage, detail}
//   ← {type:"result", id, pdf, exitCode, log, texLog} | {type:"error", id, code, detail}

let pipeline = null;
let ready = null;
let current = null; // the id being worked on, for errors raised outside a promise
const TEXT = /\.(tex|bib|cls|sty|bst|def|cfg|clo|ltx|txt|bbx|cbx|lbx|dtx|ins)$/i;
const decoder = new TextDecoder();

function report(stage, detail) {
  if (current !== null) self.postMessage({ type: "progress", id: current, stage, detail });
}

// BusyTeX prints each command as "$ busytex pdflatex …"; that's the moment TeX runs.
function onPrint(msg) {
  const m = /^\$ busytex (\S+)/.exec(String(msg));
  if (m) report("running", m[1]);
  else if (/Data packages used \(not preloaded\): \[(.+)\]/.test(String(msg))) report("loading-package", RegExp.$1);
}

function init(msg) {
  if (ready) return ready;
  report("loading-engine");
  ready = new Promise((resolve, reject) => {
    try {
      importScripts(`${msg.base}/busytex_pipeline.js`);
      pipeline = new BusytexPipeline(
        `${msg.base}/busytex.js`,
        `${msg.base}/busytex.wasm`,
        msg.all.map((f) => `${msg.base}/${f}`),
        // packs ["all"]: every data pack up front (a class needing files the
        // main .tex doesn't name); otherwise the core, with the rest on demand.
        (msg.packs.includes("all") ? msg.all : msg.preload).map((f) => `${msg.base}/${f}`),
        [],
        onPrint,
        () => resolve(),
        true,
        BusytexPipeline.ScriptLoaderWorker,
      );
      guardArgs(pipeline);
    } catch (err) {
      reject(err);
    }
  });
  ready.catch(() => (ready = null));
  return ready;
}

// The release's pipeline reuses one argument array for two TeX runs (the two
// passes around bibtex), and the engine's callMain prepends the program path
// to the array it is given — so the second run starts
// "/bin/busytex /bin/busytex pdflatex" and fails for any paper with a
// bibliography. Every engine module the pipeline creates (at start, and again
// when a paper needs new packages) gets a callMain that works on a copy.
// BusyTeX's own files stay unmodified.
function copyArgs(M) {
  if (M && !M.__margalinkArgsCopied && typeof M.callMain === "function") {
    const callMain = M.callMain;
    M.callMain = (args) => callMain.call(M, Array.from(args || []));
    M.__margalinkArgsCopied = true;
  }
  return M;
}
function guardArgs(p) {
  const reload = p.reload_module.bind(p);
  p.reload_module = async (...a) => copyArgs(await reload(...a));
  if (p.Module) p.Module = Promise.resolve(p.Module).then(copyArgs);
}

async function compile(msg) {
  try {
    await init(msg);
  } catch (err) {
    return { type: "error", id: msg.id, code: "load_failed", detail: String((err && err.message) || err) };
  }
  const files = msg.files.map((f) => ({ path: f.path, contents: TEXT.test(f.path) ? decoder.decode(f.data) : f.data }));
  const packs = msg.all.map((f) => `${msg.base}/${f}`);
  // "silent": the release's "info" mode adds --debug to bibtex8, which then fails and
  // corrupts the next pdflatex call. The .log files are written either way.
  const r = await pipeline.compile(files, msg.main, msg.bibtex, "silent", msg.driver, packs);
  // The log of the last TeX run (not bibtex/xdvipdfmx) is what the diagnostics read.
  const tex = (r.logs || []).filter((l) => !/^(bibtex|xdvipdfmx)/.test(l.cmd)).pop();
  return { type: "result", id: msg.id, pdf: r.pdf || null, exitCode: r.exit_code, log: r.log || "", texLog: tex ? tex.log : "" };
}

// One compile at a time: the engine's in-memory filesystem is shared.
const queue = [];
let busy = false;
self.onmessage = (event) => {
  queue.push(event.data);
  void pump();
};
async function pump() {
  if (busy) return;
  busy = true;
  while (queue.length) {
    const msg = queue.shift();
    current = msg.id;
    self.postMessage({ type: "started", id: msg.id });
    let out;
    try {
      out = await compile(msg);
    } catch (err) {
      out = { type: "error", id: msg.id, code: "worker_failed", detail: String((err && err.message) || err) };
    }
    if (out.pdf) self.postMessage(out, [out.pdf.buffer]);
    else self.postMessage(out);
    current = null;
  }
  busy = false;
}

// A failure inside the engine's own loading (e.g. a data file 404) surfaces here.
self.addEventListener("error", (e) => {
  if (current !== null) self.postMessage({ type: "error", id: current, code: "load_failed", detail: String(e.message || e) });
});
