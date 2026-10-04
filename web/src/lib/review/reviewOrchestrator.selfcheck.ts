// Runnable check for reviewOrchestrator.ts: plans the whole paper as context
// and the depth's sections for review, pays once with ids and lengths only,
// sends the same paper with every pass, warms the cache with one pass before
// the rest (at most 4 at a time), runs the checklist only at thorough and
// never first, gives the editor every finding by id, retries and resumes only
// what didn't come back, and assembles the report. fetch is stubbed.
//   node src/lib/review/reviewOrchestrator.selfcheck.ts
import assert from "node:assert/strict";
import { ReviewEditorError, planReview, quoteReview, runReview, type ReviewState } from "./reviewOrchestrator.ts";
import { splitIntoSections } from "./reviewSections.ts";
import { reviewPrice } from "../accounts/coins.ts";
import { billedChars } from "./reviewLimits.ts";
import type { EditorRequest, PassRequest } from "./reviewTypes.ts";

const para = (w: string) => Array.from({ length: 12 }, (_, i) => `${w} sentence ${i} reports a value of ${i} in this study.`).join(" ");
const TEXT = ["A study of sleep after surgery", "", "Abstract", para("Abstract"), "Introduction", para("Intro"), "Methods", para("Methods"), "Results", para("Results"), "Discussion", para("Discussion"), "References", para("Ref")].join("\n");

type Call = { pass: string; target?: string; body: PassRequest; inFlightAtArrival: number };
let calls: Call[] = [];
let starts: { chunks: { id: string; chars: number; review: boolean }[] }[] = [];
let inFlight = 0;
let maxInFlight = 0;
let failTarget: string | null = null;
let editorFails = 0;
const sentence = (t: string) => t.split(". ")[0].split("\n").at(-1)!;
globalThis.fetch = (async (url: string, init: RequestInit) => {
  const body = JSON.parse(init.body as string);
  if (url.endsWith("/start")) {
    starts.push(body);
    return Response.json({ ticket: "t1", coins: 6, balance: 94 });
  }
  calls.push({ pass: body.pass, target: body.target, body, inFlightAtArrival: inFlight });
  inFlight++;
  maxInFlight = Math.max(maxInFlight, inFlight);
  await new Promise((r) => setTimeout(r, 5));
  inFlight--;
  if (body.pass === "section") {
    if (body.target === failTarget) return new Response("busy", { status: 502 });
    const t = body.paper.find((c: { id: string }) => c.id === body.target);
    const q = { text: sentence(t.text), chunk: t.id };
    return Response.json({
      verdict: `About ${t.title}.`,
      findings: [{ title: `Problem in ${t.title}`, severity: "major", category: "reporting", quotes: [q], why: "Why.", suggestion: "Do this.", question: false, missing: false }],
      keyNumbers: [{ measure: "n", quote: q }],
    });
  }
  if (body.pass === "checklist") return Response.json({ guideline: "STROBE", why: "Observational.", items: [] });
  if (editorFails > 0) {
    editorFails--;
    return new Response("busy", { status: 502 });
  }
  const [a, b] = (body as EditorRequest).findings.map((f) => f.id);
  return Response.json({ overview: "Overview.", strengths: ["Clear."], journalFit: { assessment: "good", explanation: "Fits." }, fixFirst: [a, b], duplicates: [{ keep: a, drop: [b] }], verdicts: [], acrossPaper: [] });
}) as typeof fetch;

const opts = { text: TEXT, journalId: "j", journalName: "Journal", tier: "standard" as const, endpoint: "http://x/api/review", retryDelaysMs: [0, 0] };
const reset = () => {
  calls = [];
  starts = [];
  maxInFlight = 0;
};

// --- planning: the whole paper (never references) as context; the depth's sections reviewed; priced on all of it
const sections = splitIntoSections(TEXT);
const plan = planReview(sections, [], "standard");
assert.ok(plan.chunks.every((c) => c.kind !== "references"));
assert.deepEqual(plan.review.map((c) => c.kind), ["other", "abstract", "introduction", "methods", "results", "discussion"]);
assert.deepEqual(planReview(sections, [], "quick").review.map((c) => c.kind), ["abstract", "results", "discussion"]);
assert.equal(planReview(sections, [], "quick").chunks.length, plan.chunks.length, "every depth sends the whole paper");
assert.equal(quoteReview({ text: TEXT, tier: "quick" }).coins, reviewPrice("quick", plan.chunks.reduce((n, c) => n + billedChars(c.text.length), 0)));
const lone = planReview(splitIntoSections("no headings at all ".repeat(40)), [], "quick");
assert.equal(lone.review.length, 1, "a paper with no headings is still reviewed, as one section");

// --- a run
const run = await runReview(opts);
assert.equal(starts.length, 1);
assert.ok(starts[0].chunks.every((c) => Object.keys(c).join() === "id,chars,review"), "ids, lengths and which are reviewed; never text");
assert.deepEqual(starts[0].chunks.filter((c) => c.review).map((c) => c.id), plan.review.map((c) => c.id));
assert.equal(calls.filter((c) => c.pass === "section").length, plan.review.length);
assert.ok(calls.every((c) => JSON.stringify(c.body.paper) === JSON.stringify(calls[0].body.paper)), "the same paper every time: one cache entry");
assert.equal(calls[1].inFlightAtArrival, 0, "the first pass ran alone, writing the cache");
assert.ok(maxInFlight <= 4);
assert.equal(calls.filter((c) => c.pass === "checklist").length, 0, "no checklist below thorough");
const ed = calls.at(-1)!;
assert.equal(ed.pass, "editor");
assert.deepEqual((ed.body as EditorRequest).findings.map((f) => f.id), plan.review.map((c) => `${c.id}-f0`));
assert.deepEqual((ed.body as EditorRequest).keyNumbers.map((k) => k.id), plan.review.map((c) => `${c.id}-k0`));
const shown = [...run.result.sections.flatMap((s) => s.findings), ...run.result.acrossPaper].map((f) => f.id);
assert.equal(shown.length, plan.review.length - 1, "the duplicate is gone");
assert.equal(new Set(shown).size, shown.length);
assert.equal(run.result.fixFirst.length, 1, "a priority naming the dropped duplicate isn't shown");

// --- thorough: one checklist pass, never the first
reset();
const t = await runReview({ ...opts, tier: "thorough" });
assert.equal(calls.filter((c) => c.pass === "checklist").length, 1);
assert.equal(calls[0].pass, "section");
assert.equal(t.result.checklist?.guideline, "STROBE");

// --- a section that keeps failing: three tries, recorded; the rest and the editor go on
reset();
failTarget = plan.review[2].id;
const partial = await runReview(opts);
assert.equal(calls.filter((c) => c.target === failTarget).length, 3);
assert.deepEqual(partial.result.coverage.failed.map((f) => f.id), [failTarget]);
// resumed: that section only, then the editor again, on the same ticket
failTarget = null;
reset();
const healed = await runReview(opts, partial.state);
assert.equal(starts.length, 0, "not paid again");
assert.deepEqual(calls.map((c) => c.pass), ["section", "editor"]);
assert.equal(healed.result.coverage.failed.length, 0);
reset();
await runReview(opts, healed.state);
assert.equal(calls.length, 0, "nothing new came back: nothing is sent");

// --- the editor failing twice: the sections are kept; a resume finishes the report
reset();
editorFails = 2;
let kept: ReviewState | null = null;
await assert.rejects(runReview(opts), (e) => {
  assert.ok(e instanceof ReviewEditorError);
  assert.ok(e.partial.sections.every((s) => s.status === "done") && e.partial.overview === null);
  kept = e.state;
  return true;
});
reset();
const finished = await runReview(opts, kept!);
assert.deepEqual(calls.map((c) => c.pass), ["editor"]);
assert.ok(finished.result.overview);

// --- cancelled after the first section: resumable, not paid again
reset();
const ac = new AbortController();
let st: ReviewState | null = null;
await assert.rejects(runReview({ ...opts, signal: ac.signal, onState: (s) => (st = s), onProgress: (p) => void (p.done > 0 && ac.abort()) }), (e) => e instanceof Error && e.name === "AbortError");
assert.equal(Object.keys(st!.sections).length, 1, "the first section came back before the cancel");
reset();
const resumed = await runReview(opts, st!);
assert.equal(starts.length, 0);
assert.equal(calls.filter((c) => c.pass === "section").length, plan.review.length - 1, "only the rest");
assert.equal(resumed.result.coverage.reviewed.length, plan.review.length);

console.log("reviewOrchestrator.selfcheck: OK");
