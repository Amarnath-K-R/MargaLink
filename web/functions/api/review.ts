/// <reference types="@cloudflare/workers-types" />
// Cloudflare Pages Function — one of the project's two server-side files.
// Every other feature runs entirely in the browser; this one exists only
// because an LLM review needs a place to hold the Anthropic API key that the
// browser must never see. See CLAUDE.md's privacy rules — this endpoint is a
// disclosed, opt-in exception, not a quiet expansion of what leaves the device.
//
// The review is client-orchestrated: the browser sends one `extract` pass per
// section chunk and one `synthesize` pass over the resulting ledger, and this
// handler serves each pass statelessly — it never holds paper text between
// requests. Why it's built this way, and what each gate below defends
// against, is in ../../../docs/ARCHITECTURE.md under "The AI review" — read
// that before changing a prompt, a cap, or the grounding.
import { findJournalRules } from "../../src/lib/journalRules.ts";
import { DAILY_PASS_CAP, parsePassRequest, passCallConfig, validateSynthesisOutput } from "../../src/lib/reviewPasses.ts";
import { groundExtractOutput } from "../../src/lib/reviewGrounding.ts";
import { TruncatedOutputError, UpstreamError, callAnthropicTool } from "../../src/lib/anthropicStream.ts";
import { getSession, type AccountEnv } from "../../src/lib/auth.ts";
import { claimReviewPass, markDelivered, markSynthesized } from "../../src/lib/ledger.ts";

type Env = AccountEnv & { ANTHROPIC_API_KEY: string; REVIEWS_KV: KVNamespace };

const MODEL = "claude-sonnet-5";
// Every pass is paid for: it must carry the ticket review/start.ts issued
// (X-Review-Ticket), which binds the tier, the sections and their lengths,
// and a pass budget. DAILY_PASS_CAP (reviewPasses.ts) still bounds the whole
// service: honest clients average ~$0.03/pass (measured), a tampered one
// sending maximal thorough synthesis bodies up to ~$0.5/pass, within what
// its ticket allows. Counted BEFORE the upstream call, so failures and
// retries can't spend money uncounted.
// A synthesize body carries up to 1,000 ledger entries (~500 KB); an extract
// body one ≤24k-char chunk. Anything larger can't be a legitimate pass.
const MAX_BODY_BYTES = 1_000_000;
// Below the client's 300 s synthesize timeout, so the client sees our 504
// rather than its own abort.
const UPSTREAM_TIMEOUT_MS = 290_000;

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (Number(request.headers.get("content-length") ?? "0") > MAX_BODY_BYTES) {
    return new Response("Request body too large", { status: 413 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response("Invalid JSON body", { status: 400 });
  }
  const req = parsePassRequest(body);
  if (typeof req === "string") return new Response(req, { status: 400 });

  const rules = req.pass === "synthesize" ? findJournalRules(req.journalId) : undefined;
  if (req.pass === "synthesize" && !rules) return new Response("No pilot rules for this journal", { status: 404 });

  const session = await getSession(env.DB, request, Date.now());
  if (!session) return new Response("Sign in to get a review.", { status: 401 });
  // Capacity first, so a pass refused for it doesn't spend one of the ticket's.
  const kvKey = `review-pass-count:${new Date().toISOString().slice(0, 10)}`;
  const usedToday = parseInt((await env.REVIEWS_KV.get(kvKey)) ?? "0", 10);
  if (usedToday >= DAILY_PASS_CAP) return new Response("Reviews are fully booked for today. Try again tomorrow.", { status: 429 });
  const ticket = request.headers.get("x-review-ticket") ?? "";
  const refused = await claimReviewPass(
    env.DB,
    ticket,
    session.userId,
    req.pass === "extract" ? { pass: "extract", tier: req.tier, chunkId: req.chunk.id, chars: req.chunk.text.length } : { pass: "synthesize", tier: req.tier },
    Date.now(),
  );
  if (refused) return new Response(refused.message, { status: refused.status });

  // KV allows one write per second per key and the client runs 3 passes
  // concurrently — a lost increment under-counts slightly; acceptable for a
  // pilot cap (same check-then-put race the figure endpoint accepts).
  try {
    await env.REVIEWS_KV.put(kvKey, String(usedToday + 1), { expirationTtl: 60 * 60 * 24 * 2 });
  } catch {
    // under-count, not a failure
  }

  const { prompt, tool, maxTokens, effort } = passCallConfig(req, rules);
  let toolInput: unknown;
  let stopReason: string | undefined;
  try {
    ({ toolInput, stopReason } = await callAnthropicTool(
      env.ANTHROPIC_API_KEY,
      {
        model: MODEL,
        max_tokens: maxTokens,
        thinking: { type: "adaptive" },
        output_config: { effort },
        tools: [tool],
        // No tool_choice — incompatible with thinking; the prompt's closing line carries it.
        messages: [{ role: "user", content: prompt }],
      },
      { toolName: tool.name, timeoutMs: UPSTREAM_TIMEOUT_MS }
    ));
  } catch (err) {
    if (err instanceof TruncatedOutputError) return new Response("Review model output was truncated for this section", { status: 422 });
    if (err instanceof Error && err.name === "TimeoutError") return new Response("Upstream review request timed out", { status: 504 });
    const status = err instanceof UpstreamError ? err.status : 502;
    const message = err instanceof Error ? err.message : String(err);
    console.error(`review ${req.pass} upstream failure ${status}: ${message}`);
    // The upstream's own error text stays in the log; the reader gets a plain sentence.
    return new Response("Claude didn't answer this time. It's retried automatically.", { status: 502 });
  }
  if (toolInput === undefined) {
    return new Response(`Review model did not return structured output (stop_reason: ${stopReason ?? "unknown"})`, { status: 502 });
  }

  try {
    const result =
      req.pass === "extract" ? groundExtractOutput(toolInput, req.chunk.text, req.claimsCap) : validateSynthesisOutput(toolInput, req);
    if (req.pass === "synthesize") await markSynthesized(env.DB, ticket);
    else await markDelivered(env.DB, ticket, req.chunk.id);
    return new Response(JSON.stringify(result), { headers: { "Content-Type": "application/json" } });
  } catch (err) {
    console.error(`review ${req.pass} malformed output: ${err instanceof Error ? err.stack : String(err)}`);
    return new Response("Claude's answer couldn't be read. It's retried automatically.", { status: 502 });
  }
};
