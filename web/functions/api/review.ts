/// <reference types="@cloudflare/workers-types" />
// Cloudflare Pages Function: one of the project's three AI Functions. Every
// other feature runs entirely in the browser; this one exists only because an
// LLM review needs a place to hold the Anthropic API key that the browser must
// never see. See CLAUDE.md's privacy rules: this endpoint is a disclosed,
// opt-in exception, not a quiet expansion of what leaves the device.
//
// The review is client-orchestrated: the browser sends one section pass per
// reviewed section, the checklist pass at thorough, then one editor pass, each
// carrying the paper; this handler serves each pass statelessly and never
// holds paper text between requests. Why it's built this way, and what each
// gate below defends against, is in ../../../docs/ARCHITECTURE.md under
// "The AI review": read that before changing a prompt, a cap, or the grounding.
import { findJournalRules } from "../../src/lib/journals/journalRules.ts";
import { CHECKLIST_ID, editorOutsideDelivered, parsePassRequest, passCallConfig, sentChars, upstreamBody, validateEditorOutput } from "../../src/lib/review/reviewPasses.ts";
import { groundChecklistOutput, groundSectionOutput } from "../../src/lib/review/reviewGrounding.ts";
import { DAILY, reserveUse } from "../../src/lib/accounts/dailyCaps.ts";
import { TruncatedOutputError, UpstreamError, callAnthropicTool } from "../../src/lib/ai/anthropicStream.ts";
import { getSession, type AccountEnv } from "../../src/lib/accounts/auth.ts";
import { claimReviewPass, deliveredChunks, markDelivered, markSynthesized } from "../../src/lib/accounts/ledger.ts";
import { usageSink } from "../../src/lib/telemetry/apiEvents.ts";

type Env = AccountEnv & { ANTHROPIC_API_KEY: string };

// Pinned, and not one of Anthropic's "Covered Models" (Mythos class), which have their own
// retention rules: moving to one means changing the privacy notice first.
const MODEL = "claude-sonnet-5";
// Every pass carries the paper (≤400k characters) and the editor its findings too;
// a non-Latin paper's UTF-8 can triple its size. Anything larger can't be a legitimate pass.
const MAX_BODY_BYTES = 3_000_000;
// Below the client's own timeouts (180 s for a section or the checklist, 300 s for the
// editor), so the client sees our 504 rather than aborting while this call may still finish.
const UPSTREAM_TIMEOUT_MS = { section: 170_000, checklist: 170_000, editor: 290_000 } as const;

export const onRequestPost: PagesFunction<Env> = async ({ request, env, data }) => {
  if (Number(request.headers.get("content-length") ?? "0") > MAX_BODY_BYTES) return new Response("Request body too large", { status: 413 });
  // Signed in before the body is even read, and the read itself capped.
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

  // Every pass names the journal (or none), so the shared prefix Anthropic caches is the same for all of them.
  const rules = req.journalId === null ? undefined : findJournalRules(req.journalId);
  if (req.journalId !== null && !rules) return new Response("No pilot rules for this journal", { status: 404 });
  const ticket = request.headers.get("x-review-ticket") ?? "";
  // The editor is shown only what this ticket's paid passes returned.
  const delivered = req.pass === "editor" ? await deliveredChunks(env.DB, ticket) : null;
  const outside = req.pass === "editor" ? editorOutsideDelivered(req, delivered!) : null;
  if (outside) return new Response(outside, { status: 400 });

  // Today's capacity first (dailyCaps.ts), so a pass refused for it spends none of the ticket.
  const held = await reserveUse(env.DB, "reviewPass", session.userId, Date.now());
  if (!held.ok && held.full === "user") return new Response(`This account has reached today's limit of ${DAILY.reviewPass.user} review passes. It resets at midnight UTC.`, { status: 429 });
  if (!held.ok) return new Response("Reviews are fully booked for today. Try again tomorrow.", { status: 429 });
  const part =
    req.pass === "section"
      ? { chunkId: req.target, chars: req.paper.find((c) => c.id === req.target)!.text.length }
      : req.pass === "checklist"
        ? { chunkId: CHECKLIST_ID, chars: 0 }
        : {};
  const refused = await claimReviewPass(env.DB, ticket, session.userId, { pass: req.pass, tier: req.tier, paperChars: sentChars(req), ...part }, Date.now());
  if (refused) {
    await held.release();
    return new Response(refused.message, { status: refused.status });
  }

  const cfg = passCallConfig(req, rules);
  let toolInput: unknown;
  let stopReason: string | undefined;
  try {
    ({ toolInput, stopReason } = await callAnthropicTool(env.ANTHROPIC_API_KEY, upstreamBody(req, cfg, MODEL, rules), {
      toolName: cfg.toolName,
      timeoutMs: UPSTREAM_TIMEOUT_MS[req.pass],
      onUsage: usageSink(data, MODEL),
    }));
  } catch (err) {
    if (err instanceof TruncatedOutputError) return new Response("Review model output was truncated for this part", { status: 422 });
    if (err instanceof Error && err.name === "TimeoutError") return new Response("Upstream review request timed out", { status: 504 });
    const status = err instanceof UpstreamError ? err.status : 502;
    // The name and status only: a message can quote the model's output, which quotes the paper.
    console.error(`review ${req.pass} upstream failure ${status}: ${err instanceof Error ? err.name : "unknown"}`);
    return new Response("Claude didn't answer this time. It's retried automatically.", { status: 502 });
  }
  // No tool call, or the wrong tool (all three are offered): a malformed answer, retried by the browser.
  if (toolInput === undefined) return new Response(`Review model did not return structured output (stop_reason: ${stopReason ?? "unknown"})`, { status: 502 });

  try {
    const result =
      req.pass === "section" ? groundSectionOutput(toolInput, req) : req.pass === "checklist" ? groundChecklistOutput(toolInput, req) : validateEditorOutput(toolInput, req);
    if (req.pass === "editor") await markSynthesized(env.DB, ticket, delivered!.size);
    else await markDelivered(env.DB, ticket, req.pass === "section" ? req.target : CHECKLIST_ID);
    return new Response(JSON.stringify(result), { headers: { "Content-Type": "application/json" } });
  } catch (err) {
    console.error(`review ${req.pass} malformed output: ${err instanceof Error ? err.name : "unknown"}`);
    return new Response("Claude's answer couldn't be read. It's retried automatically.", { status: 502 });
  }
};
