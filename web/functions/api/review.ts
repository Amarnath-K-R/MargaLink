/// <reference types="@cloudflare/workers-types" />
// Cloudflare Pages Function — one of the project's two AI Functions. Every
// other feature runs entirely in the browser; this one exists only
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
import { findJournalRules } from "../../src/lib/journals/journalRules.ts";
import { parsePassRequest, passCallConfig, synthesisOutsideDelivered, validateSynthesisOutput } from "../../src/lib/review/reviewPasses.ts";
import { DAILY, reserveUse } from "../../src/lib/accounts/dailyCaps.ts";
import { groundExtractOutput } from "../../src/lib/review/reviewGrounding.ts";
import { TruncatedOutputError, UpstreamError, callAnthropicTool } from "../../src/lib/ai/anthropicStream.ts";
import { getSession, type AccountEnv } from "../../src/lib/accounts/auth.ts";
import { claimReviewPass, deliveredChunks, markDelivered, markSynthesized } from "../../src/lib/accounts/ledger.ts";
import { usageSink } from "../../src/lib/telemetry/apiEvents.ts";

type Env = AccountEnv & { ANTHROPIC_API_KEY: string };

// Pinned, and not one of Anthropic's "Covered Models" (Mythos class), which have their own
// retention rules: moving to one means changing the privacy notice first.
const MODEL = "claude-sonnet-5";
// Every pass is paid for: it must carry the ticket review/start.ts issued
// (X-Review-Ticket), which binds the tier, the sections and their lengths,
// and a pass budget. The daily limits (dailyCaps.ts: the service's and each
// account's) still bound the spend: honest clients average ~$0.03/pass
// (measured), a tampered one sending maximal thorough synthesis bodies up to
// ~$0.5/pass, within what its ticket allows. Reserved BEFORE the upstream
// call, so failures and retries can't spend money uncounted.
// A synthesize body carries up to 1,000 ledger entries (~500 KB); an extract
// body one ≤24k-char chunk. Anything larger can't be a legitimate pass.
const MAX_BODY_BYTES = 1_000_000;
// Below the client's own timeouts (120 s for a section, 300 s for the
// cross-check), so the client sees our 504 rather than aborting and retrying
// while this call may still finish and be recorded.
const UPSTREAM_TIMEOUT_MS = { extract: 110_000, synthesize: 290_000 } as const;

export const onRequestPost: PagesFunction<Env> = async ({ request, env, data }) => {
  if (Number(request.headers.get("content-length") ?? "0") > MAX_BODY_BYTES) {
    return new Response("Request body too large", { status: 413 });
  }
  // Signed in before the body is even read, and the read itself capped
  // (content-length can be absent), so strangers can't make us parse megabytes.
  const session = await getSession(env.DB, request, Date.now());
  if (!session) return new Response("Sign in to get a review.", { status: 401 });
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return new Response("Request body too large", { status: 413 });

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return new Response("Invalid JSON body", { status: 400 });
  }
  const req = parsePassRequest(body);
  if (typeof req === "string") return new Response(req, { status: 400 });

  const rules = req.pass === "synthesize" ? findJournalRules(req.journalId) : undefined;
  if (req.pass === "synthesize" && !rules) return new Response("No pilot rules for this journal", { status: 404 });
  const ticket = request.headers.get("x-review-ticket") ?? "";
  // A cross-check cites only what this ticket's paid passes returned.
  const delivered = req.pass === "synthesize" ? await deliveredChunks(env.DB, ticket) : null;
  const outside = req.pass === "synthesize" ? synthesisOutsideDelivered(req, delivered!) : null;
  if (outside) return new Response(outside, { status: 400 });

  // Today's capacity is reserved first (dailyCaps.ts), so a pass refused for it
  // spends none of the ticket; a pass the ticket refuses hands it back.
  const held = await reserveUse(env.DB, "reviewPass", session.userId, Date.now());
  if (!held.ok && held.full === "user") return new Response(`This account has reached today's limit of ${DAILY.reviewPass.user} review passes. It resets at midnight UTC.`, { status: 429 });
  if (!held.ok) return new Response("Reviews are fully booked for today. Try again tomorrow.", { status: 429 });
  const refused = await claimReviewPass(
    env.DB,
    ticket,
    session.userId,
    req.pass === "extract" ? { pass: "extract", tier: req.tier, chunkId: req.chunk.id, chars: req.chunk.text.length } : { pass: "synthesize", tier: req.tier },
    Date.now(),
  );
  if (refused) {
    await held.release();
    return new Response(refused.message, { status: refused.status });
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
      { toolName: tool.name, timeoutMs: UPSTREAM_TIMEOUT_MS[req.pass], onUsage: usageSink(data, MODEL) }
    ));
  } catch (err) {
    if (err instanceof TruncatedOutputError) return new Response("Review model output was truncated for this section", { status: 422 });
    if (err instanceof Error && err.name === "TimeoutError") return new Response("Upstream review request timed out", { status: 504 });
    const status = err instanceof UpstreamError ? err.status : 502;
    // The name and status only: a message can quote the model's output, which quotes the paper.
    console.error(`review ${req.pass} upstream failure ${status}: ${err instanceof Error ? err.name : "unknown"}`);
    // The upstream's own error text stays in the log; the reader gets a plain sentence.
    return new Response("Claude didn't answer this time. It's retried automatically.", { status: 502 });
  }
  if (toolInput === undefined) {
    return new Response(`Review model did not return structured output (stop_reason: ${stopReason ?? "unknown"})`, { status: 502 });
  }

  try {
    const result =
      req.pass === "extract" ? groundExtractOutput(toolInput, req.chunk.text, req.claimsCap) : validateSynthesisOutput(toolInput, req);
    if (req.pass === "synthesize") await markSynthesized(env.DB, ticket, delivered!.size);
    else await markDelivered(env.DB, ticket, req.chunk.id);
    return new Response(JSON.stringify(result), { headers: { "Content-Type": "application/json" } });
  } catch (err) {
    console.error(`review ${req.pass} malformed output: ${err instanceof Error ? err.name : "unknown"}`);
    return new Response("Claude's answer couldn't be read. It's retried automatically.", { status: 502 });
  }
};
