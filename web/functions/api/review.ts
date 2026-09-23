/// <reference types="@cloudflare/workers-types" />
// Cloudflare Pages Function — the project's first-ever server-side code.
// Every other feature in this app runs entirely in the browser; this one
// exists only because an LLM review needs a place to hold the Anthropic API
// key that the browser must never see. See CLAUDE.md's privacy rules — this
// endpoint is a disclosed, opt-in exception, not a quiet expansion of what
// leaves the device.
//
// What this handler defends against (real failure modes found against a
// real manuscript, and why grounding/arithmetic-checking/extended-thinking
// are here) is documented in full in ../../../docs/ARCHITECTURE.md under
// "The AI review: what it defends against, and why" — read that before
// changing the prompt, the grounding check, or the tier config below.
import { findJournalRules } from "../../src/lib/journalRules.ts";
import { REVIEW_TIERS, type ReviewTier, type ReviewResult } from "../../src/lib/reviewTypes.ts";
import { TIER_CONFIG, buildPrompt } from "../../src/lib/reviewPrompt.ts";
import { REVIEW_TOOL } from "../../src/lib/reviewTool.ts";
import { filterGrounded } from "../../src/lib/reviewGrounding.ts";

type Env = {
  ANTHROPIC_API_KEY: string;
  REVIEWS_KV: KVNamespace;
};

const DAILY_CAP = 200;
const MODEL = "claude-sonnet-5";

// Was 40,000 — confirmed too small against a real paper: a 71-case study
// with several results tables ran past it, silently truncating mid-Results
// and dropping Discussion/Limitations/Conclusion entirely (the model
// itself flagged the cutoff as an "other observation," which is how this
// was caught). Sonnet 5's context window has enormous headroom relative to
// even a very long paper, so this only needs to guard against someone
// pasting something absurd, not a real manuscript.
const MAX_TEXT_CHARS = 150_000;

class UpstreamError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// A non-streaming request with extended thinking + high effort/max_tokens
// (the "thorough" tier especially) can run long enough that Anthropic's own
// Cloudflare-fronted edge times out waiting on their origin — surfaced to us
// as a 524 from the fetch() itself, well before the model was actually
// done. Streaming avoids this: bytes flow continuously so no idle-connection
// timeout ever trips. The client still just gets one plain JSON response —
// this function accumulates the stream internally and only returns once the
// full tool call is assembled.
async function callAnthropicStreaming(
  apiKey: string,
  requestBody: Record<string, unknown>
): Promise<{ toolInput: unknown; stopReason: string | undefined }> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({ ...requestBody, stream: true }),
  });

  if (!res.ok || !res.body) {
    const errBody = await res.text().catch(() => "");
    console.error(`Anthropic API error ${res.status}: ${errBody}`);
    throw new UpstreamError(res.status, errBody);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let toolInputJson = "";
  let sawToolUse = false;
  let stopReason: string | undefined;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop() ?? ""; // keep any incomplete trailing event for the next chunk

    for (const evt of events) {
      const dataLine = evt.split("\n").find((l) => l.startsWith("data: "));
      if (!dataLine) continue;
      // A real network stream can occasionally hand us a malformed or
      // straddled chunk — skip that one event rather than letting a
      // JSON.parse throw crash the whole request (seen once in testing as
      // an opaque Cloudflare 500, with no application-level error message).
      let parsed: { type?: string; content_block?: { type?: string }; delta?: { type?: string; partial_json?: string; stop_reason?: string }; error?: unknown };
      try {
        parsed = JSON.parse(dataLine.slice(6));
      } catch {
        continue;
      }

      if (parsed.type === "error") {
        throw new UpstreamError(502, JSON.stringify(parsed.error));
      }
      if (parsed.type === "content_block_start" && parsed.content_block?.type === "tool_use") {
        sawToolUse = true;
      }
      if (parsed.type === "content_block_delta" && parsed.delta?.type === "input_json_delta") {
        toolInputJson += parsed.delta.partial_json;
      }
      if (parsed.type === "message_delta" && parsed.delta?.stop_reason) {
        stopReason = parsed.delta.stop_reason;
      }
    }
  }

  if (!sawToolUse || !toolInputJson) return { toolInput: undefined, stopReason };
  return { toolInput: JSON.parse(toolInputJson), stopReason };
}

// Well above MAX_TEXT_CHARS (150,000 chars, comfortably under this even at
// worst-case UTF-8 expansion) but far below anything legitimate — rejects
// an oversized body by its declared length before it's ever parsed/buffered.
const MAX_BODY_BYTES = 2_000_000;

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > MAX_BODY_BYTES) {
    return new Response("Request body too large", { status: 413 });
  }

  let body: { text?: unknown; journalId?: unknown; tier?: unknown };
  try {
    body = await request.json();
  } catch {
    return new Response("Invalid JSON body", { status: 400 });
  }
  if (typeof body.text !== "string" || typeof body.journalId !== "string" || !body.text.trim()) {
    return new Response("Expected { text: string, journalId: string }", { status: 400 });
  }
  // Default to "standard" — keeps this backward-compatible with any caller
  // that doesn't send a tier, rather than rejecting the request outright.
  const tier: ReviewTier = REVIEW_TIERS.includes(body.tier as ReviewTier)
    ? (body.tier as ReviewTier)
    : "standard";

  const rules = findJournalRules(body.journalId);
  if (!rules) {
    return new Response("No pilot rules for this journal", { status: 404 });
  }

  // Global daily cap — see the plan's cost-control decision. Check-then-put
  // has a benign race under concurrent requests (could exceed the cap by a
  // handful in flight at once); acceptable for a pilot cap, not a billing-
  // critical guarantee.
  const today = new Date().toISOString().slice(0, 10);
  const kvKey = `review-count:${today}`;
  const usedToday = parseInt((await env.REVIEWS_KV.get(kvKey)) ?? "0", 10);
  if (usedToday >= DAILY_CAP) {
    return new Response("Pilot is fully booked for today", { status: 429 });
  }

  const text = body.text.slice(0, MAX_TEXT_CHARS);
  let toolInput: unknown;
  let stopReason: string | undefined;
  try {
    ({ toolInput, stopReason } = await callAnthropicStreaming(env.ANTHROPIC_API_KEY, {
      model: MODEL,
      max_tokens: TIER_CONFIG[tier].maxTokens,
      thinking: { type: "adaptive" },
      output_config: { effort: TIER_CONFIG[tier].effort },
      tools: [REVIEW_TOOL],
      // No forced tool_choice — incompatible with extended thinking. The
      // prompt's closing instruction ("you must call the submit_review
      // tool") carries that requirement instead.
      messages: [{ role: "user", content: buildPrompt(text, rules, tier) }],
    }));
  } catch (err) {
    const status = err instanceof UpstreamError ? err.status : 502;
    const message = err instanceof Error ? err.message : String(err);
    return new Response(`Upstream review request failed (${status}): ${message}`, { status: 502 });
  }

  if (!toolInput) {
    console.error(`No tool_use in response. stop_reason=${stopReason}`);
    return new Response(
      `Review model did not return structured output (stop_reason: ${stopReason ?? "unknown"})`,
      { status: 502 }
    );
  }

  // A malformed tool call (e.g. a field the schema requires but streaming
  // assembly somehow dropped) would otherwise throw here and surface as
  // Cloudflare's raw error page instead of a message that explains what
  // happened — same principle as the streaming parser's per-event guard.
  try {
    const result = filterGrounded(toolInput as ReviewResult, text);
    await env.REVIEWS_KV.put(kvKey, String(usedToday + 1), { expirationTtl: 60 * 60 * 24 * 2 });
    return new Response(JSON.stringify(result), { headers: { "Content-Type": "application/json" } });
  } catch (err) {
    console.error(`Failed to process review result: ${err instanceof Error ? err.stack : String(err)}`);
    return new Response("Review response was malformed — try again in a moment.", { status: 502 });
  }
};
