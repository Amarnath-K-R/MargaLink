/// <reference types="@cloudflare/workers-types" />
// Cloudflare Pages Function — the project's second server-side file (the
// first is api/review.ts). Exists only because generating figure code
// needs a place to hold the Anthropic API key that the browser must never
// see. See CLAUDE.md's privacy rules — this is a disclosed, opt-in
// exception, not a quiet expansion of what leaves the device.
//
// What actually leaves the device here (column names/types, the chosen
// chart type, and an optional style note — never a cell value), and why
// that's enough for real matplotlib output without the real data ever
// leaving the browser, is documented in full in
// ../../../docs/ARCHITECTURE.md under "The figure generator: what leaves
// the device, and what doesn't" — read that before changing the prompt,
// the payload validation, or the cap below.
import { isValidFigurePayload, validateSpec } from "../../src/lib/figureSchema.ts";
import { SYSTEM_PROMPT, buildFigurePrompt, extractPythonCode } from "../../src/lib/figurePrompt.ts";

type Env = {
  ANTHROPIC_API_KEY: string;
  FIGURES_KV: KVNamespace;
};

const DAILY_CAP = 200;
const MODEL = "claude-sonnet-5";

// A legitimate schema payload is a few hundred bytes to a few KB (column
// names/types, a chart type, role names, a note capped at
// figureSchema.ts's NOTE_MAX_CHARS). This is itself a privacy control, not
// just a DoS guard: a body that can't fit a schema can't be a spreadsheet.
const MAX_BODY_BYTES = 100_000;

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > MAX_BODY_BYTES) {
    return new Response("Request body too large", { status: 413 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response("Invalid JSON body", { status: 400 });
  }
  if (!isValidFigurePayload(body)) {
    return new Response("Expected { columns, rowCount, chartType, roles, note }", { status: 400 });
  }
  const specError = validateSpec(body.columns, { chartType: body.chartType, roles: body.roles, note: body.note });
  if (specError) {
    return new Response(specError, { status: 400 });
  }

  // Global daily cap — same check-then-put pattern and benign-race
  // acceptance as api/review.ts's REVIEWS_KV cap; not billing-critical,
  // just a pilot-scale guard.
  const today = new Date().toISOString().slice(0, 10);
  const kvKey = `figure-count:${today}`;
  const usedToday = parseInt((await env.FIGURES_KV.get(kvKey)) ?? "0", 10);
  if (usedToday >= DAILY_CAP) {
    return new Response("Pilot is fully booked for today", { status: 429 });
  }

  // No streaming (unlike review.ts): this is a short, low-effort request
  // with no extended thinking, so it doesn't run long enough to hit
  // Anthropic's edge timeout the way a "thorough" review can. No tool
  // call either: asking for raw Python and stripping fences defensively
  // (extractPythonCode) is less surface than a JSON tool schema for one
  // string field.
  let replyText: string;
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 2000,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: buildFigurePrompt(body) }],
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return new Response(`Upstream figure request failed (${res.status}): ${detail}`, { status: 502 });
    }
    const data = (await res.json()) as {
      content?: { type?: string; text?: string }[];
      stop_reason?: string;
    };
    if (data.stop_reason === "max_tokens") {
      return new Response("Upstream figure request failed (max_tokens): the model's reply was truncated", {
        status: 502,
      });
    }
    replyText = data.content?.find((block) => block.type === "text")?.text ?? "";
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(`Upstream figure request failed: ${message}`, { status: 502 });
  }

  const code = extractPythonCode(replyText);
  if (!code) {
    return new Response("Figure model did not return runnable code", { status: 502 });
  }

  await env.FIGURES_KV.put(kvKey, String(usedToday + 1), { expirationTtl: 60 * 60 * 24 * 2 });
  return new Response(JSON.stringify({ code }), { headers: { "Content-Type": "application/json" } });
};
