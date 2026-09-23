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
import { parsePassRequest, passCallConfig, validateSynthesisOutput } from "../../src/lib/reviewPasses.ts";
import { groundExtractOutput } from "../../src/lib/reviewGrounding.ts";
import { TruncatedOutputError, UpstreamError, callAnthropicTool } from "../../src/lib/anthropicStream.ts";

type Env = { ANTHROPIC_API_KEY: string; REVIEWS_KV: KVNamespace };

const MODEL = "claude-sonnet-5";
// Counts passes, not reviews: a typical review is 4-8 passes, a 400k-char
// thorough one ~27, so 1,500 ≈ 200-300 reviews/day. Honest clients average
// ~$0.03/pass (measured); a tampered client sending maximal thorough
// synthesis bodies could reach ~$0.5/pass, so the true worst case is several
// hundred dollars a day — a per-IP rate-limit rule in the Cloudflare
// dashboard is the next guard if this is ever abused. Incremented BEFORE the
// upstream call — with client-side retries, counting only successes would
// let failures spend money uncounted.
const DAILY_PASS_CAP = 1500;
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

  const kvKey = `review-pass-count:${new Date().toISOString().slice(0, 10)}`;
  const usedToday = parseInt((await env.REVIEWS_KV.get(kvKey)) ?? "0", 10);
  if (usedToday >= DAILY_PASS_CAP) return new Response("Pilot is fully booked for today", { status: 429 });
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
    return new Response(`Upstream review request failed (${status}): ${message}`, { status: 502 });
  }
  if (toolInput === undefined) {
    return new Response(`Review model did not return structured output (stop_reason: ${stopReason ?? "unknown"})`, { status: 502 });
  }

  try {
    const result =
      req.pass === "extract" ? groundExtractOutput(toolInput, req.chunk.text, req.claimsCap) : validateSynthesisOutput(toolInput, req);
    return new Response(JSON.stringify(result), { headers: { "Content-Type": "application/json" } });
  } catch (err) {
    console.error(`review ${req.pass} malformed output: ${err instanceof Error ? err.stack : String(err)}`);
    return new Response("Review response was malformed — try again in a moment.", { status: 502 });
  }
};
