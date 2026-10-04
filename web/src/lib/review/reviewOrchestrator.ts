// Client-side orchestration of a review: plan the paper (every included
// chunk, never references) and the sections this depth reviews; pay for it
// (POST /api/review/start: ids, lengths and which are reviewed, never text),
// answered with a ticket; run one section pass per reviewed section, each
// carrying the whole paper (the first alone, so Anthropic caches the paper
// once; the rest 4 at a time; at thorough, the checklist pass among them);
// then one editor pass over every finding by id; then assemble the report
// (reviewReport.ts). Every pass is an independent request to the stateless
// Function: any can fail, be retried or be resumed alone, on the same ticket.
// Callers MUST have consent before calling runReview() (ReviewConsent.tsx).
// `fetch` is resolved at call time, so NetworkTrace's patch sees every request.
import { ReviewCapacityError } from "./review.ts";
import { NotEnoughCoinsError, SignInRequiredError, reviewPrice } from "../accounts/coins.ts";
import { TIER_PLAN } from "./reviewPrompt.ts";
import { MAX_EDITOR_FINDINGS, billedChars } from "./reviewLimits.ts";
import { chunkSections, splitIntoSections } from "./reviewSections.ts";
import { assembleReport, findingId } from "./reviewReport.ts";
import type {
  ChecklistRequest,
  ChecklistResponse,
  Chunk,
  EditorFinding,
  EditorRequest,
  EditorResponse,
  HeadingHint,
  PaperChunk,
  PassRequest,
  ReviewProgress,
  ReviewReport,
  ReviewContext,
  ReviewTier,
  Section,
  SectionRequest,
  SectionResponse,
} from "./reviewTypes.ts";

export type RunReviewOptions = {
  text: string; // output of prepareForReview()
  hints?: HeadingHint[];
  // The user-confirmed outline. Excluded sections are never sent.
  outline?: { sections: Section[]; excluded: Section[] };
  journalId: string | null; // null: no target journal
  journalName: string | null;
  // The authors' own notes for the review (instructions, or their journal's guidelines), sent with
  // every pass and priced like the paper. At most MAX_GUIDANCE_CHARS once trimmed.
  guidance?: string;
  tier: ReviewTier;
  endpoint?: string;
  onProgress?: (p: ReviewProgress) => void;
  // Called once with the run's state before any request, so a cancelled run can be resumed.
  onState?: (state: ReviewState) => void;
  signal?: AbortSignal;
  onCharged?: (balance: number) => void; // the balance after the review was paid for
  concurrency?: number;
  timeoutMs?: { section: number; editor: number };
  retryDelaysMs?: number[];
};
export type ReviewState = {
  chunks: Chunk[]; // the paper: every included chunk, in order
  review: string[]; // the ids this depth reviews
  skipped: { id: string; title: string }[];
  excluded: { id: string; title: string }[];
  sections: Record<string, SectionResponse>;
  failed: Record<string, string>;
  checklist: ChecklistResponse | null;
  checklistFailed: string | null;
  ticket: string | null; // a resume reuses it, so a review is paid for once
  // The last report the editor put together, and how many parts it covered:
  // a resume shows it while it runs, and asks again only once more have come back.
  editor: EditorResponse | null;
  editorCovers: number;
  createdAt: string;
};
export type ReviewRun = { result: ReviewReport; state: ReviewState };
export class ReviewEditorError extends Error {
  partial: ReviewReport;
  state: ReviewState;
  constructor(message: string, partial: ReviewReport, state: ReviewState) {
    super(message);
    this.partial = partial;
    this.state = state;
  }
}

class FatalPassError extends Error {}
// The review's ticket can't be used any more (expired, or its passes spent):
// Resume can't help; what didn't run is refunded automatically.
export class ReviewEndedError extends Error {}
const abortError = (signal: AbortSignal) => (signal.reason instanceof Error ? signal.reason : new DOMException("Review cancelled", "AbortError"));
// A retry delay that ends immediately on cancel.
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

/** The paper every pass carries (never references) and the sections this depth reviews (all of them, if it recognises none). */
export function planReview(sections: Section[], hints: HeadingHint[], tier: ReviewTier): { chunks: Chunk[]; review: Chunk[]; skipped: Chunk[] } {
  const all = chunkSections(sections, hints, { subsections: TIER_PLAN[tier].subsections });
  const chunks = all.filter((c) => c.kind !== "references");
  const kinds = TIER_PLAN[tier].kinds;
  const picked = chunks.filter((c) => kinds.includes(c.kind));
  const review = picked.length > 0 ? picked : chunks;
  return { chunks, review, skipped: all.filter((c) => !review.includes(c)) };
}

function planState(opts: RunReviewOptions): ReviewState {
  const sections = opts.outline?.sections ?? splitIntoSections(opts.text, opts.hints ?? []);
  const { chunks, review, skipped } = planReview(sections, opts.hints ?? [], opts.tier);
  return {
    chunks,
    review: review.map((c) => c.id),
    skipped: skipped.map((c) => ({ id: c.id, title: c.title })),
    excluded: (opts.outline?.excluded ?? []).map((s) => ({ id: s.id, title: s.title })),
    sections: {},
    failed: {},
    checklist: null,
    checklistFailed: null,
    ticket: null,
    editor: null,
    editorCovers: 0,
    createdAt: new Date().toISOString(),
  };
}

/** The authors' notes exactly as every pass sends them. */
export const guidanceOf = (opts: Pick<RunReviewOptions, "guidance">) => (opts.guidance ?? "").trim();

/** What a review would cost, from exactly what it would send (the whole paper and the authors' notes, at every depth). */
export function quoteReview(opts: Pick<RunReviewOptions, "text" | "hints" | "outline" | "tier" | "guidance">): { coins: number; chars: number; sections: number } {
  const sections = opts.outline?.sections ?? splitIntoSections(opts.text, opts.hints ?? []);
  const { chunks, review } = planReview(sections, opts.hints ?? [], opts.tier);
  const notes = guidanceOf(opts).length;
  return {
    coins: reviewPrice(opts.tier, chunks.reduce((n, c) => n + billedChars(c.text.length), 0) + notes),
    chars: chunks.reduce((n, c) => n + c.text.length, 0) + notes,
    sections: review.length,
  };
}

/** Every finding and key number that came back, by id, for the editor: past its cap, majors first (document order within each severity); and the checklist's items. */
export function editorInputs(state: ReviewState): Pick<EditorRequest, "findings" | "keyNumbers" | "checklist"> {
  const findings: EditorFinding[] = [];
  const keyNumbers: EditorRequest["keyNumbers"] = [];
  for (const id of state.review) {
    const got = state.sections[id];
    if (!got) continue;
    got.findings.forEach((f, i) => findings.push({ id: findingId(id, i), title: f.title, severity: f.severity, why: f.why, quotes: f.quotes.map((q) => q.text) }));
    got.keyNumbers.forEach((k, i) => keyNumbers.push({ id: `${id}-k${i}`, measure: k.measure, quote: k.quote.text }));
  }
  const rank = { major: 0, minor: 1, suggestion: 2 } as const;
  const capped = findings.length <= MAX_EDITOR_FINDINGS ? findings : [...findings].sort((a, b) => rank[a.severity] - rank[b.severity]).slice(0, MAX_EDITOR_FINDINGS);
  // The checklist's items by position (c0, c1, …), as the report lists them.
  const checklist = (state.checklist?.items ?? []).map((it, i) => ({ id: `c${i}`, item: it.item }));
  return { findings: capped, keyNumbers, checklist };
}

const reportOf = (state: ReviewState, opts: RunReviewOptions) =>
  assembleReport({
    chunks: state.chunks,
    review: state.review,
    skipped: state.skipped,
    excluded: state.excluded,
    sections: state.sections,
    failed: state.failed,
    checklist: state.checklist,
    checklistFailed: state.checklistFailed,
    editor: state.editor,
    tier: opts.tier,
    journalName: opts.journalName,
    createdAt: state.createdAt,
  });

// `exhausted`: the server has no more tries for this part (409); don't retry it.
type Attempt = { ok: true; data: unknown } | { ok: false; reason: string; retryable: boolean; exhausted?: boolean };

// One POST. Throws for outcomes that end the whole review (caller abort, 429
// capacity, a 4xx contract error every pass would hit); returns a failure for
// outcomes worth retrying or recording against one part.
async function attempt(endpoint: string, body: PassRequest, ticket: string, timeoutMs: number, outer: AbortSignal): Promise<Attempt> {
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Review-Ticket": ticket },
      body: JSON.stringify(body),
      signal: AbortSignal.any([outer, AbortSignal.timeout(timeoutMs)]),
    });
    // Parsed here so a malformed 200 is a retryable failure for this pass, not a crash of the whole run.
    if (res.ok) return { ok: true, data: await res.json() };
    const detail = await res.text().catch(() => "");
    if (res.status === 429) {
      throw new ReviewCapacityError("Reviews are fully booked for today. Resume within two hours of starting, or the parts that didn't run are refunded automatically.");
    }
    if (res.status === 401) throw new SignInRequiredError();
    // 403: the ticket is expired or used up; the server says which.
    if (res.status === 403) throw new ReviewEndedError(detail || "This review can't continue. Start a new one; what it didn't finish is refunded automatically.");
    if (res.status === 409) return { ok: false, reason: detail || "no tries left for this part; its coins come back", retryable: false, exhausted: true };
    if (res.status === 400 || res.status === 404 || res.status === 413) throw new FatalPassError(`The review couldn't be sent${detail ? `: ${detail}` : "."}`);
    // 422 = the model's output was truncated; not worth a same-size retry.
    if (res.status === 422) return { ok: false, reason: "the answer came back cut short", retryable: false };
    return { ok: false, reason: "Claude didn't answer (busy or unavailable)", retryable: true };
  } catch (err) {
    if (outer.aborted) throw abortError(outer);
    if (err instanceof ReviewCapacityError || err instanceof FatalPassError || err instanceof ReviewEndedError || err instanceof SignInRequiredError) throw err;
    if (err instanceof Error && err.name === "TimeoutError") return { ok: false, reason: "timed out", retryable: true };
    return { ok: false, reason: err instanceof Error ? err.message : String(err), retryable: true };
  }
}

// Pays for the review. Never aborted mid-flight: a charge the server made must
// reach the state, so a cancel pressed meanwhile takes effect once it has.
async function startReview(endpoint: string, opts: RunReviewOptions, state: ReviewState): Promise<{ ticket: string; balance: number }> {
  const res = await fetch(`${endpoint}/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tier: opts.tier, journalId: opts.journalId, guidanceChars: guidanceOf(opts).length, chunks: state.chunks.map((c) => ({ id: c.id, chars: c.text.length, review: state.review.includes(c.id) })) }),
  });
  if (res.ok) return (await res.json()) as { ticket: string; balance: number };
  if (res.status === 401) throw new SignInRequiredError();
  if (res.status === 402) {
    const { coins, balance } = (await res.json()) as { coins: number; balance: number };
    throw new NotEnoughCoinsError(coins, balance);
  }
  if (res.status === 429) throw new ReviewCapacityError("Reviews are fully booked for today. Try again tomorrow; nothing was charged.");
  const detail = res.status < 500 ? await res.text().catch(() => "") : "";
  throw new Error(`The review couldn't start${detail ? `: ${detail}` : ". Try again in a moment; nothing was charged."}`);
}

// Runs a review, or (given `resume`) only the parts not yet back, then the
// editor, on the same ticket: paid for once.
export async function runReview(opts: RunReviewOptions, resume?: ReviewState): Promise<ReviewRun> {
  const endpoint = opts.endpoint ?? "/api/review";
  const concurrency = opts.concurrency ?? 4;
  const timeoutMs = opts.timeoutMs ?? { section: 180_000, editor: 300_000 };
  const delays = opts.retryDelaysMs ?? [1000, 3000];
  const plan = TIER_PLAN[opts.tier];
  const context: ReviewContext = { journalId: opts.journalId, guidance: guidanceOf(opts) };

  const state = resume ?? planState(opts);
  opts.onState?.(state);
  if (!state.ticket) {
    if (opts.signal?.aborted) throw abortError(opts.signal);
    const paid = await startReview(endpoint, opts, state);
    state.ticket = paid.ticket;
    opts.onCharged?.(paid.balance);
  }
  const ticket = state.ticket;
  const paper: PaperChunk[] = state.chunks.map(({ id, title, kind, text }) => ({ id, title, kind, text }));
  const titleOf = new Map(state.chunks.map((c) => [c.id, c.title]));
  const queue = state.review.filter((id) => !(id in state.sections));
  for (const id of queue) delete state.failed[id];
  const wantChecklist = plan.checklist && !state.checklist;
  if (wantChecklist) state.checklistFailed = null;
  const total = state.review.length + (plan.checklist ? 1 : 0);
  let done = total - queue.length - (wantChecklist ? 1 : 0);

  // One controller for the whole run: the caller's abort, or a fatal outcome
  // in any worker, stops every in-flight pass and the queue at once.
  const controller = new AbortController();
  const onOuterAbort = () => controller.abort(opts.signal?.reason);
  if (opts.signal?.aborted) onOuterAbort();
  opts.signal?.addEventListener("abort", onOuterAbort, { once: true });
  const emit = (phase: ReviewProgress["phase"], current: string | null) => opts.onProgress?.({ phase, done, total, current, partial: reportOf(state, opts) });

  const runPass = async (body: SectionRequest | ChecklistRequest): Promise<{ data: unknown } | { reason: string }> => {
    let reason = "";
    for (let i = 0; i <= delays.length; i++) {
      const a = await attempt(endpoint, body, ticket, timeoutMs.section, controller.signal);
      if (a.ok) return { data: a.data };
      reason = a.reason;
      if (a.exhausted || !a.retryable) break;
      if (i < delays.length) await sleep(delays[i], controller.signal);
    }
    return { reason };
  };
  const jobs: { title: string; run: () => Promise<void> }[] = queue.map((id) => ({
    title: titleOf.get(id) ?? id,
    run: async () => {
      const r = await runPass({ pass: "section", tier: opts.tier, ...context, paper, target: id });
      if ("data" in r) state.sections[id] = r.data as SectionResponse;
      else state.failed[id] = r.reason;
    },
  }));
  // The checklist never goes first: the first pass writes the cache alone.
  if (wantChecklist) {
    jobs.splice(Math.min(1, jobs.length), 0, {
      title: "the reporting checklist",
      run: async () => {
        const r = await runPass({ pass: "checklist", tier: "thorough", ...context, paper });
        if ("data" in r) state.checklist = r.data as ChecklistResponse;
        else state.checklistFailed = r.reason;
      },
    });
  }

  const settle = async (batch: typeof jobs, n: number) => {
    const worker = async () => {
      for (let job = batch.shift(); job && !controller.signal.aborted; job = batch.shift()) {
        try {
          await job.run();
        } catch (err) {
          controller.abort();
          throw err;
        }
        done++;
        emit("sections", batch[0]?.title ?? null);
      }
    };
    const settled = await Promise.allSettled(Array.from({ length: Math.min(n, batch.length) }, worker));
    // A sibling's AbortError is a consequence, not the cause: surface the cause.
    const failure = settled.find((s): s is PromiseRejectedResult => s.status === "rejected" && !(s.reason instanceof Error && s.reason.name === "AbortError"));
    if (failure) throw failure.reason;
    if (controller.signal.aborted) throw abortError(opts.signal ?? controller.signal);
  };

  try {
    emit("sections", jobs[0]?.title ?? null);
    await settle(jobs.splice(0, 1), 1); // writes the paper to Anthropic's cache
    await settle(jobs, concurrency);

    const covered = Object.keys(state.sections).length + (state.checklist ? 1 : 0);
    if (state.editor && covered === state.editorCovers) return { result: reportOf(state, opts), state };
    if (Object.keys(state.sections).length === 0) throw new ReviewEditorError("No section came back, so there's no report to put together yet.", reportOf(state, opts), state);

    const inputs = editorInputs(state);
    emit("editor", `Putting the report together from ${inputs.findings.length} findings`);
    const body: EditorRequest = { pass: "editor", tier: opts.tier, ...context, paper, ...inputs };
    let editor: EditorResponse | null = null;
    let reason = "";
    try {
      for (let i = 0; i < 2 && !editor; i++) {
        const a = await attempt(endpoint, body, ticket, timeoutMs.editor, controller.signal);
        if (a.ok) {
          editor = a.data as EditorResponse;
          break;
        }
        reason = a.reason;
        if (!a.retryable) break;
        if (i === 0) await sleep(delays[0] ?? 0, controller.signal);
      }
    } catch (err) {
      // The sections are paid for and kept: an editor failure keeps the state so a resume runs just this step.
      if (err instanceof Error && err.name === "AbortError") throw err;
      if (err instanceof ReviewEndedError || err instanceof SignInRequiredError) throw err;
      reason = err instanceof Error ? err.message : String(err);
    }
    if (!editor) {
      const message = state.editor
        ? `The report wasn't put together again (${reason}); the earlier one is shown.`
        : `The report wasn't put together (${reason}). The sections are below; Resume finishes it.`;
      throw new ReviewEditorError(message, reportOf(state, opts), state);
    }
    state.editor = editor;
    state.editorCovers = covered;
    return { result: reportOf(state, opts), state };
  } finally {
    opts.signal?.removeEventListener("abort", onOuterAbort);
  }
}
