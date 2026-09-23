// Client-side orchestration of a review: plan chunks from the prepared text,
// run one bounded extract pass per chunk (a small worker pool), build the
// claims ledger, run one synthesize pass, assemble the ReviewResult. Every
// pass is an independent request to the stateless Function, so any pass can
// fail, be retried, or be resumed alone, and partial results render on the way.
// Callers MUST have consent before calling runReview() (ReviewConsent.tsx).
// `fetch` is resolved at call time, never captured at import — NetworkTrace's
// window.fetch patch must see every request.
import { FREE_REVIEWS_PER_DEVICE, ReviewCapacityError, ReviewLimitError, recordReviewUsed, reviewsRemaining } from "./review.ts";
import { TIER_PLAN } from "./reviewPrompt.ts";
import { MAX_ABSTRACT_CHARS, MAX_LEDGER, MAX_NOTES, MAX_PAPER_SECTIONS, MAX_STATS_FINDINGS } from "./reviewPasses.ts";
import { buildPaperMap, chunkSections, splitIntoSections } from "./reviewSections.ts";
import type {
  Chunk,
  Citation,
  ExtractRequest,
  HeadingHint,
  ExtractResponse,
  PaperMap,
  Section,
  ReviewProgress,
  ReviewResult,
  ReviewTier,
  SynthesizeRequest,
  SynthesizeResponse,
} from "./reviewTypes.ts";

export type RunReviewOptions = {
  text: string; // output of prepareForReview()
  hints?: HeadingHint[]; // the document's own headings (extract.ts), when it has them
  // The user-confirmed outline (reviewSections.ts buildOutline). Excluded
  // sections are never sent — not as a chunk, not in the paper map.
  outline?: { sections: Section[]; excluded: Section[] };
  journalId: string;
  tier: ReviewTier;
  endpoint?: string;
  onProgress?: (p: ReviewProgress) => void;
  // Called once with the run's state before any request: lets a caller that
  // cancels mid-run resume later without re-sending finished sections.
  onState?: (state: ReviewState) => void;
  signal?: AbortSignal;
  concurrency?: number;
  timeoutMs?: { extract: number; synthesize: number };
  retryDelaysMs?: number[];
};
export type ReviewState = {
  chunks: Chunk[];
  paperMap: PaperMap;
  abstractText: string | null;
  extracted: Record<string, ExtractResponse>;
  failed: Record<string, string>;
  excluded: { id: string; title: string }[];
  counted: boolean; // set the first time synthesis succeeds — a device use is recorded exactly once per review
};
export type ReviewRun = { result: ReviewResult; state: ReviewState };
export class ReviewSynthesisError extends Error {
  partial: ReviewResult;
  state: ReviewState;
  constructor(message: string, partial: ReviewResult, state: ReviewState) {
    super(message);
    this.partial = partial;
    this.state = state;
  }
}

class FatalPassError extends Error {}
const abortError = (signal: AbortSignal) =>
  signal.reason instanceof Error ? signal.reason : new DOMException("Review cancelled", "AbortError");
// A retry delay that ends immediately on cancel, so a cancelled run settles now, not seconds later.
const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal.aborted) return reject(abortError(signal));
    const onAbort = () => {
      clearTimeout(t);
      reject(abortError(signal));
    };
    const t = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal.addEventListener("abort", onAbort, { once: true });
  });

export function planChunks(chunks: Chunk[], tier: ReviewTier): { run: Chunk[]; skipped: Chunk[] } {
  const kinds = TIER_PLAN[tier].kinds;
  const run = chunks.filter((c) => kinds.includes(c.kind));
  // No section the tier asks for was recognized (e.g. a PDF with no detectable
  // headings, which is all "other" — quick skips "other"): review every
  // non-reference chunk rather than nothing.
  if (run.length === 0) return { run: chunks.filter((c) => c.kind !== "references"), skipped: chunks.filter((c) => c.kind === "references") };
  return { run, skipped: chunks.filter((c) => !kinds.includes(c.kind)) };
}

function planState(text: string, hints: HeadingHint[], outline?: RunReviewOptions["outline"]): ReviewState {
  const sections = outline?.sections ?? splitIntoSections(text, hints);
  return {
    chunks: chunkSections(sections, hints),
    paperMap: buildPaperMap(sections),
    abstractText: sections.find((s) => s.kind === "abstract")?.text ?? null,
    extracted: {},
    failed: {},
    excluded: (outline?.excluded ?? []).map((s) => ({ id: s.id, title: s.title })),
    counted: false,
  };
}

// Builds the wire ledger and an id → citation map in document order. Ids are
// deterministic (chunkId-cN) so a retried pass regenerates identical ids.
function buildLedger(state: ReviewState) {
  const ledger: SynthesizeRequest["ledger"] = [];
  const statsFindings: SynthesizeRequest["statsFindings"] = [];
  const notes: SynthesizeRequest["notes"] = [];
  const cite = new Map<string, Citation>();
  const stats: ReviewResult["statisticalReporting"] = [];
  const extractedCount = Object.keys(state.extracted).length;
  // A ledger past MAX_LEDGER (≈25 dense chunks) keeps each chunk's first N claims.
  const perChunk = extractedCount > 0 ? Math.floor(MAX_LEDGER / extractedCount) : 0;
  const total = Object.values(state.extracted).reduce((n, ex) => n + ex.claims.length, 0);
  for (const chunk of state.chunks) {
    const ex = state.extracted[chunk.id];
    if (!ex) continue;
    const section = chunk.title;
    ex.claims.forEach((c, i) => {
      if (total > MAX_LEDGER && i >= perChunk) return;
      const id = `${chunk.id}-c${i}`;
      ledger.push({ id, section, quote: c.quote, measure: c.measure, values: c.values });
      cite.set(id, { quote: c.quote, section });
    });
    ex.statisticalReporting.forEach((s, i) => {
      const id = `${chunk.id}-st${i}`;
      // Every finding is shown to the user; only the first MAX_STATS_FINDINGS go to synthesis.
      if (statsFindings.length < MAX_STATS_FINDINGS) statsFindings.push({ id, section, description: s.description, severity: s.severity });
      cite.set(id, { quote: s.quote, section });
      stats.push({ description: s.description, severity: s.severity, citations: [{ quote: s.quote, section }] });
    });
    ex.notes.forEach((n, i) => {
      const id = `${chunk.id}-n${i}`;
      if (notes.length < MAX_NOTES) notes.push({ id, section, description: n.description });
      if (n.quote) cite.set(id, { quote: n.quote, section });
    });
  }
  return { ledger, statsFindings, notes, cite, stats };
}

function assemble(state: ReviewState, run: Chunk[], skipped: Chunk[], synth: SynthesizeResponse | null): ReviewResult {
  const { cite, stats } = buildLedger(state);
  const resolve = (ids: string[]) => ids.map((id) => cite.get(id)).filter((c): c is Citation => !!c);
  return {
    journalFit: synth?.journalFit ?? null,
    summary: synth?.summary.map((s) => ({ text: s.text, severity: s.severity, citations: resolve(s.refs) })) ?? [],
    inconsistencies: synth?.inconsistencies.map((f) => ({ description: f.description, citations: resolve(f.claimIds) })) ?? [],
    statisticalReporting: stats,
    otherObservations: synth?.otherObservations ?? [],
    coverage: {
      reviewed: state.chunks.filter((c) => c.id in state.extracted).map((c) => ({ id: c.id, title: c.title })),
      failed: state.chunks.filter((c) => c.id in state.failed).map((c) => ({ id: c.id, title: c.title, reason: state.failed[c.id] })),
      pending: run.filter((c) => !(c.id in state.extracted) && !(c.id in state.failed)).map((c) => ({ id: c.id, title: c.title })),
      skipped: [
        ...skipped.map((c) => ({ id: c.id, title: c.title })),
        ...state.excluded.map((s) => ({ id: s.id, title: `${s.title} (excluded by you)` })),
      ],
    },
  };
}

type Attempt = { ok: true; data: unknown } | { ok: false; reason: string; retryable: boolean };

// One POST. Throws for outcomes that end the whole review (caller abort,
// 429 capacity, a 4xx contract error every pass would hit); returns a
// failure for outcomes worth retrying or recording against one chunk.
async function attempt(endpoint: string, body: Req, timeoutMs: number, outer: AbortSignal): Promise<Attempt> {
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.any([outer, AbortSignal.timeout(timeoutMs)]),
    });
    // Parsed here so a malformed 200 is a retryable failure for this pass, not a crash of the whole run.
    if (res.ok) return { ok: true, data: await res.json() };
    const detail = await res.text().catch(() => "");
    if (res.status === 429) throw new ReviewCapacityError("This pilot is fully booked for today — try again tomorrow.");
    if (res.status === 400 || res.status === 404 || res.status === 413) throw new FatalPassError(`Review request rejected (${res.status}): ${detail}`);
    // 422 = the model's output was truncated; not worth a same-size retry.
    return { ok: false, reason: `server error ${res.status}${detail ? `: ${detail}` : ""}`, retryable: res.status !== 422 };
  } catch (err) {
    if (outer.aborted) throw abortError(outer);
    if (err instanceof ReviewCapacityError || err instanceof FatalPassError) throw err;
    if (err instanceof Error && err.name === "TimeoutError") return { ok: false, reason: "timed out", retryable: true };
    return { ok: false, reason: err instanceof Error ? err.message : String(err), retryable: true };
  }
}
type Req = ExtractRequest | SynthesizeRequest;

// Runs a review, or — given `resume` (from a previous run's state or a
// ReviewSynthesisError, or onState after a cancel) — re-runs only the chunks
// not yet extracted plus synthesis. A review counts one device use, once.
export async function runReview(opts: RunReviewOptions, resume?: ReviewState): Promise<ReviewRun> {
  const endpoint = opts.endpoint ?? "/api/review";
  const concurrency = opts.concurrency ?? 3;
  const timeoutMs = opts.timeoutMs ?? { extract: 120_000, synthesize: 300_000 };
  const delays = opts.retryDelaysMs ?? [1000, 3000];
  if (!resume && reviewsRemaining() <= 0) {
    throw new ReviewLimitError(`You've used all ${FREE_REVIEWS_PER_DEVICE} free pilot reviews on this device.`);
  }

  const state = resume ?? planState(opts.text, opts.hints ?? [], opts.outline);
  opts.onState?.(state);
  const { run, skipped } = planChunks(state.chunks, opts.tier);
  const queue = run.filter((c) => !(c.id in state.extracted));
  for (const c of queue) delete state.failed[c.id];
  let done = run.length - queue.length;

  // One controller for the whole run: the caller's abort, or a fatal outcome
  // in any worker, stops every in-flight pass and the queue at once.
  const controller = new AbortController();
  const onOuterAbort = () => controller.abort(opts.signal?.reason);
  if (opts.signal?.aborted) onOuterAbort();
  opts.signal?.addEventListener("abort", onOuterAbort, { once: true });
  const emit = (phase: ReviewProgress["phase"], current: string | null) =>
    opts.onProgress?.({ phase, done, total: run.length, current, partial: assemble(state, run, skipped, null) });

  const runExtract = async (chunk: Chunk) => {
    const fullCap = TIER_PLAN[opts.tier].claimsCap;
    let cap = fullCap;
    let reason = "";
    for (let i = 0; i <= delays.length; i++) {
      const body: ExtractRequest = {
        pass: "extract",
        tier: opts.tier,
        claimsCap: cap,
        chunk: { id: chunk.id, title: chunk.title, kind: chunk.kind, part: chunk.part, parts: chunk.parts, text: chunk.text },
      };
      const a = await attempt(endpoint, body, timeoutMs.extract, controller.signal);
      if (a.ok) {
        state.extracted[chunk.id] = a.data as ExtractResponse;
        return;
      }
      reason = a.reason;
      if (!a.retryable) {
        // Truncated output: one retry asking for half as many claims, then give up.
        if (cap === fullCap) {
          cap = Math.max(1, Math.floor(cap / 2));
          continue;
        }
        reason = "section too dense for one pass";
        break;
      }
      if (i < delays.length) await sleep(delays[i], controller.signal);
    }
    state.failed[chunk.id] = reason;
  };

  const worker = async () => {
    for (let chunk = queue.shift(); chunk && !controller.signal.aborted; chunk = queue.shift()) {
      try {
        await runExtract(chunk);
      } catch (err) {
        controller.abort();
        throw err;
      }
      done++;
      emit("extract", queue[0]?.title ?? null);
    }
  };

  try {
    const settled = await Promise.allSettled(Array.from({ length: Math.min(concurrency, queue.length) }, worker));
    // A sibling's AbortError is a consequence, not the cause — surface the cause.
    const failure = settled.find(
      (s): s is PromiseRejectedResult => s.status === "rejected" && !(s.reason instanceof Error && s.reason.name === "AbortError")
    );
    if (failure) throw failure.reason;
    if (controller.signal.aborted) throw abortError(opts.signal ?? controller.signal);

    const { ledger, statsFindings, notes } = buildLedger(state);
    emit("synthesize", `Cross-checking ${ledger.length} claims`);
    // Clamped to the server's caps (reviewPasses.ts) so a very long paper
    // can't turn the final, most expensive step into a 400.
    const synthBody: SynthesizeRequest = {
      pass: "synthesize",
      journalId: opts.journalId,
      tier: opts.tier,
      paperMap: { ...state.paperMap, sections: state.paperMap.sections.slice(0, MAX_PAPER_SECTIONS) },
      abstractText: state.abstractText?.slice(0, MAX_ABSTRACT_CHARS) ?? null,
      ledger,
      statsFindings,
      notes,
    };
    let synth: SynthesizeResponse | null = null;
    let reason = "";
    try {
      for (let i = 0; i < 2 && !synth; i++) {
        const a = await attempt(endpoint, synthBody, timeoutMs.synthesize, controller.signal);
        if (a.ok) {
          synth = a.data as SynthesizeResponse;
          break;
        }
        reason = a.reason;
        if (!a.retryable) break;
        if (i === 0) await sleep(delays[0] ?? 0, controller.signal);
      }
    } catch (err) {
      // Every extract pass is already paid for: any synthesis-phase failure
      // except a cancel keeps the state so the user can retry just this step.
      if (err instanceof Error && err.name === "AbortError") throw err;
      reason = err instanceof Error ? err.message : String(err);
    }
    if (!synth) throw new ReviewSynthesisError(`The cross-check didn't finish (${reason}).`, assemble(state, run, skipped, null), state);
    if (!state.counted) {
      recordReviewUsed();
      state.counted = true;
    }
    return { result: assemble(state, run, skipped, synth), state };
  } finally {
    opts.signal?.removeEventListener("abort", onOuterAbort);
  }
}
