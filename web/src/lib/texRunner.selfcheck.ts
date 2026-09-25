// Runnable check for texRunner.ts against an in-process fake worker: message
// routing, superseded compiles, timeouts, errors, progress, diagnostics.
//   node src/lib/texRunner.selfcheck.ts
import assert from "node:assert/strict";
import { mock } from "node:test";
import { COMPILE_TIMEOUT_MS, TexCompileError, __setTexWorkerFactory, compileProject, type CompileRequest } from "./texRunner.ts";

type Msg = { type: string; id: number; [k: string]: unknown };
class FakeWorker {
  static all: FakeWorker[] = [];
  onmessage: ((e: { data: unknown }) => void) | null = null;
  inbox: Msg[] = [];
  terminated = false;
  constructor() {
    FakeWorker.all.push(this);
  }
  postMessage(m: Msg) {
    this.inbox.push(m);
  }
  terminate() {
    this.terminated = true;
  }
  reply(data: object) {
    queueMicrotask(() => this.onmessage?.({ data }));
  }
  last() {
    return this.inbox.at(-1)!;
  }
}
const flush = () => new Promise<void>((r) => setImmediate(r));
const enc = (s: string) => new TextEncoder().encode(s);
const REQ: CompileRequest = { files: [{ path: "main.tex", data: enc("\\documentclass{article}") }], main: "main.tex", engine: "pdftex", bibtex: null, packs: ["science"] };
const PDF = enc("%PDF-1.5 …");

mock.timers.enable({ apis: ["setTimeout"] });
__setTexWorkerFactory(() => new FakeWorker() as unknown as Worker);

// 1. a compile resolves with the PDF and parsed diagnostics; the request reaches the worker intact
{
  const stages: string[] = [];
  const p = compileProject(REQ, (s) => stages.push(s));
  await flush();
  const w = FakeWorker.all.at(-1)!;
  const m = w.last();
  assert.equal(m.type, "compile");
  assert.equal(m.main, "main.tex");
  assert.equal(m.driver, "pdftex_bibtex8");
  assert.deepEqual(m.packs, ["science"], "the packs a paper needs are passed through (Review Focus 4)");
  assert.ok(Array.isArray(m.preload) && Array.isArray(m.all) && typeof m.base === "string");
  w.reply({ type: "progress", id: m.id, stage: "loading-engine" });
  w.reply({ type: "progress", id: m.id, stage: "running", detail: "pdflatex" });
  w.reply({ type: "result", id: m.id, pdf: PDF, exitCode: 0, log: "all logs", texLog: "(./main.tex\nLaTeX Warning: Citation `x' on page 1 undefined on input line 3.\n)" });
  const r = await p;
  assert.deepEqual(r?.pdf, PDF);
  assert.equal(r?.exitCode, 0);
  assert.equal(r?.log, "all logs");
  assert.equal(r?.diagnostics[0].kind, "warning");
  assert.equal(r?.diagnostics[0].line, 3);
  assert.deepEqual(stages, ["loading-engine", "running"]);
}

// 2. xetex projects use the xetex driver
{
  const p = compileProject({ ...REQ, engine: "xetex" });
  await flush();
  const w = FakeWorker.all.at(-1)!;
  assert.equal(w.last().driver, "xetex_bibtex8_dvipdfmx");
  w.reply({ type: "result", id: w.last().id, pdf: null, exitCode: 1, log: "", texLog: "(./main.tex\n! Undefined control sequence.\nl.4 \\foo" });
  const r = await p;
  assert.equal(r?.pdf, null, "a failed compile has no PDF");
  assert.equal(r?.diagnostics[0].line, 4);
}

// 3. a newer compile supersedes an older one still running: the older resolves null
{
  const a = compileProject(REQ);
  await flush();
  const w = FakeWorker.all.at(-1)!;
  const idA = w.last().id;
  const b = compileProject(REQ);
  await flush();
  const idB = w.last().id;
  w.reply({ type: "result", id: idA, pdf: PDF, exitCode: 0, log: "", texLog: "" });
  w.reply({ type: "result", id: idB, pdf: PDF, exitCode: 0, log: "b", texLog: "" });
  assert.equal(await a, null);
  assert.equal((await b)?.log, "b");
}

// 4. downloading the engine has no deadline; running TeX does — a hung run is stopped and the next compile gets a fresh worker (Review Focus 2)
{
  const p = compileProject(REQ);
  await flush();
  const hung = FakeWorker.all.at(-1)!;
  const id = hung.last().id;
  hung.reply({ type: "progress", id, stage: "loading-engine" });
  await flush();
  mock.timers.tick(COMPILE_TIMEOUT_MS * 3);
  assert.ok(!hung.terminated, "a slow first download isn't a hang");
  hung.reply({ type: "progress", id, stage: "running", detail: "pdflatex" });
  await flush();
  mock.timers.tick(COMPILE_TIMEOUT_MS + 1);
  const err = await p.then(() => null, (e: unknown) => e);
  assert.ok(err instanceof TexCompileError && err.code === "timeout");
  assert.ok(hung.terminated);
  const next = compileProject(REQ);
  await flush();
  const fresh = FakeWorker.all.at(-1)!;
  assert.notEqual(fresh, hung);
  fresh.reply({ type: "result", id: fresh.last().id, pdf: PDF, exitCode: 0, log: "", texLog: "" });
  assert.deepEqual((await next)?.pdf, PDF);
}

// 5. a worker error becomes a TexCompileError with its code
{
  const p = compileProject(REQ);
  await flush();
  const w = FakeWorker.all.at(-1)!;
  w.reply({ type: "error", id: w.last().id, code: "load_failed", detail: "fetch busytex.wasm: 404" });
  const err = await p.then(() => null, (e: unknown) => e);
  assert.ok(err instanceof TexCompileError);
  assert.equal(err.code, "load_failed");
  assert.match(err.message, /couldn't load/i);
}

// 6. a class that needs files outside the loaded packs: one automatic retry on a fresh worker with every pack
{
  const stages: string[] = [];
  const p = compileProject({ ...REQ, packs: [] }, (s, d) => stages.push(`${s}${d ? ":" + d : ""}`));
  await flush();
  const first = FakeWorker.all.at(-1)!;
  assert.ok(!(first.last().packs as string[]).includes("all"));
  // as TeX writes it: the log wraps at 79 columns, mid-word
  first.reply({ type: "result", id: first.last().id, pdf: null, exitCode: 3, log: "", texLog: "(./main.tex (./IEEEtran.cls\n! Font OT1/ptm/m/n/10=ptmr7t at 10.0pt not loadable: Metric (TFM) file not foun\nd.\n" });
  await flush();
  await flush();
  const retry = FakeWorker.all.at(-1)!;
  assert.notEqual(retry, first, "the retry runs on a fresh worker");
  assert.ok(first.terminated);
  assert.deepEqual(retry.last().packs, ["all"], "…with every data pack");
  assert.ok(stages.includes("loading-package:all"));
  retry.reply({ type: "result", id: retry.last().id, pdf: PDF, exitCode: 0, log: "", texLog: "" });
  assert.deepEqual((await p)?.pdf, PDF);
  // later compiles in this session keep every pack
  const q = compileProject({ ...REQ, packs: [] });
  await flush();
  assert.deepEqual(FakeWorker.all.at(-1)!.last().packs, ["all"]);
  FakeWorker.all.at(-1)!.reply({ type: "result", id: FakeWorker.all.at(-1)!.last().id, pdf: PDF, exitCode: 0, log: "", texLog: "" });
  await q;
}

// 7. an ordinary error (not a missing file) is not retried
{
  const before = FakeWorker.all.length;
  const p = compileProject(REQ);
  await flush();
  const w = FakeWorker.all.at(-1)!;
  w.reply({ type: "result", id: w.last().id, pdf: null, exitCode: 1, log: "", texLog: "(./main.tex\n! Undefined control sequence.\nl.4 \\foo" });
  const r = await p;
  assert.equal(r?.pdf, null);
  assert.equal(FakeWorker.all.length, before, "no new worker");
}

mock.timers.reset();
console.log("texRunner.selfcheck: OK");
