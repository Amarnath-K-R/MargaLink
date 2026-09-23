// Runnable check for reviewOrchestrator.ts — planning, concurrency, retry
// policy, failure isolation, resume and usage counting, against a stubbed
// fetch. Run directly:  node src/lib/reviewOrchestrator.selfcheck.ts
import assert from "node:assert/strict";
import { ReviewSynthesisError, planChunks, runReview, type ReviewState } from "./reviewOrchestrator.ts";
import { NO_EDITS, buildOutline, chunkSections, splitIntoSections } from "./reviewSections.ts";
import { FREE_REVIEWS_PER_DEVICE, ReviewCapacityError, reviewsRemaining } from "./review.ts";
import { parsePassRequest } from "./reviewPasses.ts";
import type { ExtractRequest, ReviewProgress, SynthesizeRequest, SynthesizeResponse } from "./reviewTypes.ts";

class MemoryStorage {
  private store = new Map<string, string>();
  getItem(k: string) {
    return this.store.has(k) ? this.store.get(k)! : null;
  }
  setItem(k: string, v: string) {
    this.store.set(k, v);
  }
  clear() {
    this.store.clear();
  }
}
const storage = new MemoryStorage();
(globalThis as unknown as { localStorage: MemoryStorage }).localStorage = storage;

const para = (n: number, seed: string) => Array.from({ length: n }, (_, i) => `${seed} sentence ${i} reports ${10 + i} patients.`).join(" ");
const REFS = Array.from({ length: 12 }, (_, i) => `[${i + 1}] Author ${i}. Title ${i}. Journal, 20${10 + i}.`).join("\n");
// Every section ≥ MIN_SECTION_CHARS so nothing merges away.
const PAPER = `Title\n\nAbstract\n\n${para(12, "A")}\n\n1. Introduction\n\n${para(12, "I")}\n\n2. Methods\n\n${para(12, "M")}\n\n3. Results\n\n${para(12, "R")}\n\n4. Discussion\n\n${para(12, "D")}\n\n5. References\n\n${REFS}\n`;

type Req = ExtractRequest | SynthesizeRequest;
type Handler = (req: Req, attempt: number, signal: AbortSignal | null | undefined) => Response | Promise<Response>;
const calls: Req[] = [];
let inFlight = 0;
let maxInFlight = 0;
const attempts = new Map<string, number>();
function stub(handler: Handler) {
  calls.length = 0;
  inFlight = 0;
  maxInFlight = 0;
  attempts.clear();
  (globalThis as unknown as { fetch: typeof fetch }).fetch = (async (_url: string, init?: RequestInit) => {
    const req = JSON.parse(init!.body as string) as Req;
    const key = req.pass === "extract" ? req.chunk.id : "synth";
    const attempt = (attempts.get(key) ?? 0) + 1;
    attempts.set(key, attempt);
    calls.push(req);
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    try {
      await new Promise((r) => setTimeout(r, 5));
      return await handler(req, attempt, init?.signal);
    } finally {
      inFlight--;
    }
  }) as typeof fetch;
}
const json = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status, headers: { "Content-Type": "application/json" } });
const text = (s: string, status: number) => new Response(s, { status });
const firstSentence = (t: string) => (t.split("\n").map((l) => l.trim()).find((l) => l.length >= 12) ?? t.trim()).split(". ")[0];
const okExtract = (req: ExtractRequest) =>
  json({
    claims: [{ quote: firstSentence(req.chunk.text), measure: `patients ${req.chunk.id}`, values: [{ value: 10, unit: null }] }],
    statisticalReporting: [{ description: `no CI in ${req.chunk.id}`, severity: "minor", quote: firstSentence(req.chunk.text) }],
    notes: [],
  });
const okSynth = (req: SynthesizeRequest): SynthesizeResponse => ({
  journalFit: { assessment: "possible", explanation: "plausible" },
  inconsistencies: req.ledger.length >= 2 ? [{ description: "n differs", claimIds: [req.ledger[0].id, req.ledger[1].id] }] : [],
  summary: [{ text: "fix n", severity: "major", refs: req.ledger.slice(0, 1).map((e) => e.id) }],
  otherObservations: ["ok"],
});
const happy: Handler = (req) => (req.pass === "extract" ? okExtract(req) : json(okSynth(req)));
const extracts = () => calls.filter((c): c is ExtractRequest => c.pass === "extract");
const synthCall = () => calls.find((c): c is SynthesizeRequest => c.pass === "synthesize")!;
const base = { text: PAPER, journalId: "j", tier: "standard" as const, endpoint: "/mock", retryDelaysMs: [1, 2] };

// 1. happy path: bodies, ids, citations, usage, progress
{
  storage.clear();
  stub(happy);
  const progress: ReviewProgress[] = [];
  const { result, state } = await runReview({ ...base, onProgress: (p) => progress.push(p) });
  const synth = synthCall();
  assert.equal(extracts().length, 6, "front matter, abstract, intro, methods, results, discussion — never references");
  assert.ok(extracts().every((e) => Object.keys(e).sort().join() === "chunk,claimsCap,pass,tier" && PAPER.includes(e.chunk.text)), "extract bodies carry exactly pass/tier/claimsCap/chunk");
  assert.equal(calls[calls.length - 1].pass, "synthesize", "synthesis is last");
  const docOrder = state.chunks.filter((c) => c.id in state.extracted).map((c) => c.id);
  assert.deepEqual(synth.ledger.map((e) => e.id), docOrder.map((id) => `${id}-c0`), "ledger ids are chunkId-cN in document order");
  assert.deepEqual(synth.statsFindings.map((s) => s.id), docOrder.map((id) => `${id}-st0`));
  assert.equal(synth.abstractText, state.chunks.find((c) => c.kind === "abstract")!.text, "the abstract section is the abstract");
  assert.equal(result.inconsistencies[0].citations[0].quote, synth.ledger[0].quote, "citations resolve to ledger quotes");
  assert.equal(result.summary[0].citations.length, 1);
  assert.equal(result.statisticalReporting.length, 6);
  assert.equal(result.coverage.reviewed.length, 6);
  assert.equal(result.coverage.failed.length, 0);
  assert.deepEqual(result.coverage.skipped.map((s) => s.title), ["5. References"]);
  assert.equal(reviewsRemaining(), FREE_REVIEWS_PER_DEVICE - 1, "one device use per review");
  assert.equal(progress.length, 7, "one event per extract pass + one for synthesis");
  assert.ok(progress.every((p, i) => i === 0 || p.done >= progress[i - 1].done), "progress is monotonic");
  assert.equal(progress[6].phase, "synthesize");
  assert.equal(progress[0].partial.journalFit, null, "partials have no journalFit yet");
}
// 2. concurrency never exceeds 3
{
  storage.clear();
  stub(happy);
  await runReview({ ...base, text: `${PAPER}\n\nAppendix\n\n${para(12, "X")}\n\nSupplementary Material\n\n${para(12, "Y")}`, tier: "thorough" });
  assert.ok(maxInFlight <= 3 && calls.length >= 8, `max in flight ${maxInFlight}, calls ${calls.length}`);
}
// 3. one chunk fails after retries → coverage.failed, synthesis still runs, usage counted
{
  storage.clear();
  stub((req, attempt) => (req.pass === "extract" && req.chunk.id === "s2" ? text("boom", 502) : happy(req, attempt, null)));
  const { result } = await runReview(base);
  assert.equal(attempts.get("s2"), 3, "1 try + 2 retries");
  assert.deepEqual(result.coverage.failed.map((f) => f.id), ["s2"]);
  assert.match(result.coverage.failed[0].reason, /502/);
  assert.ok(!synthCall().ledger.some((e) => e.id.startsWith("s2-")), "a failed chunk contributes nothing to the ledger");
  assert.equal(reviewsRemaining(), FREE_REVIEWS_PER_DEVICE - 1);
}
// 4. 429 aborts everything, nothing counted
{
  storage.clear();
  stub((req, attempt) => (req.pass === "extract" && req.chunk.id === "s2" ? text("Pilot is fully booked for today", 429) : happy(req, attempt, null)));
  await assert.rejects(runReview(base), ReviewCapacityError);
  assert.ok(calls.length <= 4, `abort stopped the queue (${calls.length} calls)`);
  assert.equal(reviewsRemaining(), FREE_REVIEWS_PER_DEVICE);
}
// 5. timeouts retry, then fail with a reason
{
  storage.clear();
  stub((req, attempt, signal) =>
    req.pass === "extract" && req.chunk.id === "s3"
      ? new Promise<Response>((_, rej) => signal?.addEventListener("abort", () => rej(signal.reason)))
      : happy(req, attempt, null)
  );
  // Node unrefs AbortSignal.timeout's timer; hold the loop open so the
  // process doesn't exit while the stubbed request waits (a page stays alive).
  const keepAlive = setInterval(() => {}, 50);
  const { result } = await runReview({ ...base, timeoutMs: { extract: 20, synthesize: 1000 } });
  clearInterval(keepAlive);
  assert.equal(attempts.get("s3"), 3);
  assert.match(result.coverage.failed[0].reason, /timed out/i);
}
// 6. resume re-runs only failed chunks + synthesis
{
  storage.clear();
  stub((req, attempt) => (req.pass === "extract" && req.chunk.id === "s2" ? text("boom", 502) : happy(req, attempt, null)));
  const first = await runReview(base);
  stub(happy);
  const second = await runReview(base, first.state);
  assert.deepEqual(calls.map((c) => (c.pass === "extract" ? c.chunk.id : "synth")), ["s2", "synth"]);
  assert.equal(second.result.coverage.failed.length, 0);
  assert.equal(reviewsRemaining(), FREE_REVIEWS_PER_DEVICE - 1, "a resume never counts a second use");
}
// 7. synthesis failure keeps the partial; resume issues exactly one synth call
{
  storage.clear();
  stub((req, attempt) => (req.pass === "synthesize" ? text("boom", 502) : happy(req, attempt, null)));
  const err = await runReview(base).catch((e: unknown) => e);
  assert.ok(err instanceof ReviewSynthesisError);
  assert.equal(attempts.get("synth"), 2, "synthesis retries once");
  assert.ok(err.partial.statisticalReporting.length > 0 && err.partial.journalFit === null);
  assert.equal(reviewsRemaining(), FREE_REVIEWS_PER_DEVICE, "no use counted without a synthesis");
  stub(happy);
  await runReview(base, err.state);
  assert.deepEqual(calls.map((c) => c.pass), ["synthesize"]);
  assert.equal(reviewsRemaining(), FREE_REVIEWS_PER_DEVICE - 1, "the resume that completes the review counts it, once");
}
// 8. quick tier extracts only abstract/results/discussion
{
  storage.clear();
  stub(happy);
  const { result } = await runReview({ ...base, tier: "quick" });
  assert.deepEqual(extracts().map((e) => e.chunk.kind).sort(), ["abstract", "discussion", "results"]);
  assert.equal(extracts()[0].claimsCap, 20);
  assert.equal(result.coverage.skipped.length, 4, "front matter, intro, methods, references skipped");
}
// 9. caller abort mid-run → AbortError, nothing counted
{
  storage.clear();
  const ac = new AbortController();
  stub((req, attempt) => {
    if (req.pass === "extract" && req.chunk.id === "s2") ac.abort();
    return happy(req, attempt, null);
  });
  await assert.rejects(runReview({ ...base, signal: ac.signal }), (e: unknown) => (e as Error).name === "AbortError");
  assert.ok(!calls.some((c) => c.pass === "synthesize"), "no synthesis after an abort");
  assert.equal(reviewsRemaining(), FREE_REVIEWS_PER_DEVICE);
}
// 10. no headings → fixed chunks, abstractText null
{
  storage.clear();
  stub(happy);
  const { state } = await runReview({ ...base, text: para(900, "Flat") }); // ≈ 36k chars, no headings, no newlines
  assert.equal(synthCall().abstractText, null);
  assert.ok(state.chunks.length >= 2 && state.chunks.every((c) => c.title.startsWith("Paper (part")));
}
// 11. abstract-only submission → exactly one extract pass, a valid result
{
  storage.clear();
  stub(happy);
  const { result } = await runReview({ ...base, text: `Abstract\n\n${para(4, "Only")}` });
  assert.equal(extracts().length, 1);
  assert.equal(result.coverage.reviewed.length, 1);
  assert.ok(result.journalFit !== null);
}
// 12. 422 retries once with a halved cap, then fails as "too dense"
{
  storage.clear();
  stub((req, attempt) => (req.pass === "extract" && req.chunk.id === "s4" ? text("truncated", 422) : happy(req, attempt, null)));
  const { result } = await runReview(base);
  assert.deepEqual(extracts().filter((e) => e.chunk.id === "s4").map((e) => e.claimsCap), [30, 15]);
  assert.match(result.coverage.failed[0].reason, /too dense/);
}
// 13. planChunks is pure and honours the tier table
{
  const chunks = chunkSections(splitIntoSections(PAPER));
  assert.equal(planChunks(chunks, "thorough").skipped.length, 1);
  assert.equal(planChunks(chunks, "quick").run.length, 3);
}
// 14. no free reviews left → ReviewLimitError before any request
{
  storage.clear();
  storage.setItem("margalink-review-uses", String(FREE_REVIEWS_PER_DEVICE));
  stub(happy);
  await assert.rejects(runReview(base), /free pilot reviews/);
  assert.equal(calls.length, 0);
}
// 15. a 400 (contract bug) aborts the whole run with the server's text
{
  storage.clear();
  stub((req, attempt) => (req.pass === "extract" && req.chunk.id === "s1" ? text("chunk kind is not a known section kind", 400) : happy(req, attempt, null)));
  await assert.rejects(runReview(base), /chunk kind is not a known section kind/);
  assert.ok(!calls.some((c) => c.pass === "synthesize"));
}

// --- Fixes from the whole-branch review ---
// R1. a very long paper: every chunk maxes out notes and stats, and the synthesis body still passes the server's gates
{
  storage.clear();
  const busy: Handler = (req, attempt) =>
    req.pass === "extract"
      ? json({
          claims: [{ quote: firstSentence(req.chunk.text), measure: "m", values: [{ value: 1, unit: null }] }],
          statisticalReporting: Array.from({ length: 20 }, (_, i) => ({ description: `s${i}`, severity: "minor", quote: firstSentence(req.chunk.text) })),
          notes: Array.from({ length: 5 }, (_, i) => ({ description: `n${i}`, quote: null })),
        })
      : happy(req, attempt, null);
  stub(busy);
  await runReview({ ...base, text: para(10_000, "Long") }); // ≈ 390k chars → ~25 chunks → 125 notes, 500 stats before clamping
  const body = synthCall();
  assert.ok(extracts().length >= 20, `${extracts().length} chunks`);
  assert.equal(typeof parsePassRequest(JSON.parse(JSON.stringify(body))), "object", String(parsePassRequest(JSON.parse(JSON.stringify(body)))));
}
// R1b. a 400 on synthesis keeps the state (retryable), not a dead end
{
  storage.clear();
  stub((req, attempt) => (req.pass === "synthesize" ? text("notes must be an array of at most 100 entries", 400) : happy(req, attempt, null)));
  const err = await runReview(base).catch((e: unknown) => e);
  assert.ok(err instanceof ReviewSynthesisError, String(err));
  assert.match((err as Error).message, /at most 100/);
  assert.equal(Object.keys((err as ReviewSynthesisError).state.extracted).length, 6, "every paid extract pass is kept");
}
// R2. quick tier on a paper with no recognizable headings still reviews it
{
  storage.clear();
  stub(happy);
  const { result } = await runReview({ ...base, tier: "quick", text: para(900, "Flat") });
  assert.ok(extracts().length >= 2, "headless text is reviewed on quick too");
  assert.ok(result.coverage.reviewed.length >= 2);
}
// R5. cancel mid-run: coverage names what wasn't reached, and onState lets it resume
{
  storage.clear();
  const ac = new AbortController();
  const seen: { state: ReviewState | null; partial: ReviewProgress["partial"] | null } = { state: null, partial: null };
  stub((req, attempt) => {
    if (req.pass === "extract" && req.chunk.id === "s2") ac.abort();
    return happy(req, attempt, null);
  });
  await runReview({ ...base, signal: ac.signal, concurrency: 1, onState: (st) => (seen.state = st), onProgress: (p) => (seen.partial = p.partial) }).catch(() => {});
  const saved = seen.state;
  assert.ok(saved, "onState delivered the state");
  assert.ok(seen.partial === null || seen.partial.coverage.pending.length > 0, "a cancelled partial reports pending sections");
  const finishedBefore = new Set(Object.keys(saved.extracted));
  assert.ok(finishedBefore.size < 6, "the cancel stopped the run early");
  stub(happy);
  const resumed = await runReview(base, saved);
  assert.ok(extracts().every((e) => !finishedBefore.has(e.chunk.id)), "the resume never re-sends a finished section");
  assert.equal(extracts().length, 6 - finishedBefore.size, "and sends every unfinished one");
  assert.equal(resumed.result.coverage.reviewed.length, 6);
  assert.equal(resumed.result.coverage.pending.length, 0);
  assert.equal(reviewsRemaining(), FREE_REVIEWS_PER_DEVICE - 1, "the resumed review counts one use");
}
// R6. a cancel during a retry delay settles immediately, not after the delay
{
  storage.clear();
  const ac = new AbortController();
  stub((req, attempt) => {
    if (req.pass === "extract" && req.chunk.id === "s1") {
      setTimeout(() => ac.abort(), 20);
      return text("boom", 502);
    }
    return happy(req, attempt, null);
  });
  const t0 = Date.now();
  await runReview({ ...base, signal: ac.signal, retryDelaysMs: [5000, 5000] }).catch(() => {});
  assert.ok(Date.now() - t0 < 1000, `settled in ${Date.now() - t0} ms`);
}
// R9. a 200 with a non-JSON body fails just that pass (retried), not the whole run
{
  storage.clear();
  stub((req, attempt) =>
    req.pass === "extract" && req.chunk.id === "s3" && attempt === 1 ? new Response("<html>oops</html>", { status: 200 }) : happy(req, attempt, null)
  );
  const { result } = await runReview(base);
  assert.equal(attempts.get("s3"), 2, "retried once, then succeeded");
  assert.equal(result.coverage.failed.length, 0);
}

// O1. the user's outline: an excluded section's text is in no request body at all, and coverage says why it was skipped
{
  storage.clear();
  stub(happy);
  const results = splitIntoSections(PAPER).find((x) => x.kind === "results")!;
  const outline = buildOutline(PAPER, [], { ...NO_EDITS, kinds: { [results.charStart]: "excluded" } });
  const bodies: string[] = [];
  const inner = (globalThis as unknown as { fetch: typeof fetch }).fetch;
  (globalThis as unknown as { fetch: typeof fetch }).fetch = ((url: string, init?: RequestInit) => {
    bodies.push(init!.body as string);
    return inner(url, init);
  }) as typeof fetch;
  const { result } = await runReview({ ...base, outline });
  assert.ok(bodies.length > 0 && bodies.every((b) => !b.includes("R sentence 0") && !b.includes("3. Results")), "excluded text and title never leave");
  assert.ok(result.coverage.skipped.some((x) => x.title === "3. Results (excluded by you)"));
  assert.equal(result.coverage.reviewed.length, 5);
}
// O2. a kind override changes what a tier extracts
{
  storage.clear();
  stub(happy);
  const methods = splitIntoSections(PAPER).find((x) => x.kind === "methods")!;
  const outline = buildOutline(PAPER, [], { ...NO_EDITS, kinds: { [methods.charStart]: "results" } });
  await runReview({ ...base, tier: "quick", outline });
  assert.ok(extracts().some((e) => e.chunk.title === "2. Methods"), "quick now reviews the section the user marked as Results");
}

console.log("reviewOrchestrator.selfcheck: OK");
