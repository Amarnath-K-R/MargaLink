/// <reference types="@cloudflare/workers-types" />
// Cloudflare Pages Function — the project's second server-side file (the
// first is api/review.ts). Exists only to hold the Anthropic API key the
// browser must never see. See CLAUDE.md's privacy rules — this is a
// disclosed, opt-in exception, not a quiet expansion of what leaves the
// device.
//
// What arrives (built only by src/lib/figureSchema.ts): column names and
// types, the row count, the user's request, the current figure description
// with typed text blanked and group references as "#n", and — only if the
// user opted in — the labels of small categorical columns. Never a cell
// value. What goes back: a FigureSpec (or a customize() hook) that the
// browser renders locally against the real data. Nothing from the request
// is stored; each request costs 1 M coin (signed in), refunded if the
// answer isn't usable.
// See docs/ARCHITECTURE.md, "The figure generator", before changing this.
import { checkLabels, checkSpecAgainstColumns, validateFigureSpec } from "../../src/lib/figureSpec.ts";
import { isValidFigurePayload } from "../../src/lib/figureSchema.ts";
import { HOOK_SYSTEM_PROMPT, HOOK_TOOL, SPEC_SYSTEM_PROMPT, SPEC_TOOL, buildFigurePrompt, isCodeSafeToRun } from "../../src/lib/figurePrompt.ts";
import { TruncatedOutputError, UpstreamError, callAnthropicTool } from "../../src/lib/anthropicStream.ts";
import { getSession, randomToken, type AccountEnv } from "../../src/lib/auth.ts";
import { FIGURE_PRICE } from "../../src/lib/coins.ts";
import { balance, credit, debit } from "../../src/lib/ledger.ts";
import type { FigurePayload } from "../../src/lib/figureSchema.ts";

type Env = AccountEnv & { ANTHROPIC_API_KEY: string; FIGURES_KV: KVNamespace };

const DAILY_CAP = 200;
const MODEL = "claude-sonnet-5";
// Columns + a scrubbed spec + ≤ 12×30 labels + a 1,000-char request: tens of
// KB at most. A body that can't fit that can't be a legitimate request — a
// privacy control as much as a DoS guard.
const MAX_BODY_BYTES = 200_000;
const UPSTREAM_TIMEOUT_MS = 60_000;

const text = (body: string, status: number) => new Response(body, { status });

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (Number(request.headers.get("content-length") ?? "0") > MAX_BODY_BYTES) return text("Request body too large", 413);

  // content-length can be absent (chunked); the read itself is capped too.
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return text("Request body too large", 413);
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return text("Invalid JSON body", 400);
  }
  if (!isValidFigurePayload(body)) return text("Expected { columns, rowCount, request, spec, levels, mode }", 400);
  // A current spec that doesn't fit the data isn't refused — fixing it is
  // exactly what Claude is for — it's passed on with the problem named.
  const problem = body.spec ? checkSpecAgainstColumns(body.columns, body.spec) : null;
  if (!body.request.trim()) return text("Describe the figure you want first.", 400);

  const now = Date.now();
  const s = await getSession(env.DB, request, now);
  if (!s) return text("Sign in to ask Claude.", 401);
  // Global daily cap, checked before charging and counted before the
  // upstream call (a failed call still costs). Same benign check-then-put
  // race as api/review.ts.
  const kvKey = `figure-count:${new Date(now).toISOString().slice(0, 10)}`;
  const used = parseInt((await env.FIGURES_KV.get(kvKey)) ?? "0", 10);
  if (used >= DAILY_CAP) return text("Ask Claude is fully booked for today. Try again tomorrow; nothing was charged.", 429);
  const ref = randomToken(12);
  if (!(await debit(env.DB, s.userId, FIGURE_PRICE, "figure", ref, now))) return Response.json({ coins: FIGURE_PRICE, balance: await balance(env.DB, s.userId) }, { status: 402 });
  // From here the coin comes back unless an answer goes out, whatever happens
  // (the Worker itself being stopped midway is the one case this can't cover).
  let answer: unknown = null;
  try {
    try {
      await env.FIGURES_KV.put(kvKey, String(used + 1), { expirationTtl: 60 * 60 * 24 * 2 });
    } catch {
      // an under-count, not a failure (as in api/review.ts)
    }
    const res = await askClaude(body, problem, env.ANTHROPIC_API_KEY);
    if (res.status !== 200) return res;
    answer = await res.json();
    return Response.json({ ...(answer as object), balance: await balance(env.DB, s.userId) });
  } catch (err) {
    console.error(`figure request failed: ${err instanceof Error ? err.message : String(err)}`);
    return text("The figure request failed. Try again in a moment.", 502);
  } finally {
    if (answer === null) await credit(env.DB, s.userId, FIGURE_PRICE, "figure_refund", ref, Date.now());
  }
};

// The upstream call and every output gate; any non-200 is refunded above.
async function askClaude(body: FigurePayload, problem: string | null, apiKey: string): Promise<Response> {
  const hook = body.mode === "hook";
  const tool = hook ? HOOK_TOOL : SPEC_TOOL;
  let toolInput: unknown;
  let stopReason: string | undefined;
  try {
    ({ toolInput, stopReason } = await callAnthropicTool(
      apiKey,
      {
        model: MODEL,
        max_tokens: hook ? 2000 : 4000,
        thinking: { type: "adaptive" },
        output_config: { effort: "low" },
        system: hook ? HOOK_SYSTEM_PROMPT : SPEC_SYSTEM_PROMPT,
        tools: [tool],
        // No tool_choice — incompatible with thinking; the prompt's closing line carries it.
        messages: [{ role: "user", content: buildFigurePrompt(body, problem) }],
      },
      { toolName: tool.name, timeoutMs: UPSTREAM_TIMEOUT_MS },
    ));
  } catch (err) {
    if (err instanceof TruncatedOutputError) return text("The figure description came back cut short. Try asking for fewer panels.", 422);
    if (err instanceof Error && err.name === "TimeoutError") return text("Upstream figure request timed out", 504);
    const status = err instanceof UpstreamError ? err.status : 502;
    const message = err instanceof Error ? err.message : String(err);
    console.error(`figure upstream failure ${status}: ${message}`);
    return text(`Upstream figure request failed (${status})`, 502);
  }
  if (!toolInput || typeof toolInput !== "object") return text(`Figure model did not return structured output (stop_reason: ${stopReason ?? "unknown"})`, 502);
  const out = toolInput as Record<string, unknown>;
  const summary = typeof out.summary === "string" ? out.summary.slice(0, 300) : "";

  // Output gates: nothing is returned that the browser shouldn't render.
  if (hook) {
    const code = typeof out.code === "string" ? out.code : "";
    if (!code.includes("def customize(")) return text("Claude's tweak didn't define customize(fig, axes, df).", 422);
    const unsafe = isCodeSafeToRun(code);
    if (unsafe) return text(unsafe, 422);
    return Response.json({ hook: code, summary });
  }
  const spec = validateFigureSpec(out.spec);
  if (typeof spec === "string") return text(`Claude's figure description wasn't valid: ${spec}`, 422);
  const unfit = checkSpecAgainstColumns(body.columns, spec) ?? checkLabels(spec, body.levels);
  if (unfit) return text(`Claude's figure description didn't fit your data: ${unfit}`, 422);
  return Response.json({ spec, summary });
}
