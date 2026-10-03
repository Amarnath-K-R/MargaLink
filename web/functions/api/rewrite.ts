/// <reference types="@cloudflare/workers-types" />
// Cloudflare Pages Function: Rewrite in /write, the third disclosed,
// opt-in exception under CLAUDE.md's rule 3 (after review.ts and
// figure.ts), holding the Anthropic API key the browser must never see.
//
// What arrives: the passage the person selected (citations, footnote marks,
// maths and other objects already replaced by numbered placeholders in the
// browser), the tool, a tone for Change tone, the format and the paper's
// English variant, and the price shown on the button. What goes back: the
// rewritten passage, checked against the passage (src/lib/writing/rewrite.ts)
// before it's charged for or returned. Nothing is stored; the coins come
// back whenever no answer goes out (a pending charge covers a request the
// browser abandoned). Logs carry error names and statuses,
// never the passage or the answer.
import { checkRewrite, parseRewriteRequest, type RewriteRequest, type Rewritten } from "../../src/lib/writing/rewrite.ts";
import { REWRITE_SYSTEM_PROMPT, REWRITE_TOOL, buildRewritePrompt, rewriteMaxTokens } from "../../src/lib/writing/rewritePrompt.ts";
import { TruncatedOutputError, UpstreamError, callAnthropicTool } from "../../src/lib/ai/anthropicStream.ts";
import { getSession, randomToken, text, type AccountEnv } from "../../src/lib/accounts/auth.ts";
import { balance, holdCharge, refundCharge, settleCharge } from "../../src/lib/accounts/ledger.ts";
import { DAILY, reserveUse } from "../../src/lib/accounts/dailyCaps.ts";
import { usageSink } from "../../src/lib/telemetry/apiEvents.ts";

type Env = AccountEnv & { ANTHROPIC_API_KEY: string };
// Pinned, and named in the privacy notice: a change of model is a change to the notice first.
const MODEL = "claude-sonnet-5";
// 20,000 characters of passage as JSON, with room to spare: anything bigger isn't a real request.
const MAX_BODY_BYTES = 100_000;
// A rewrite of 1,500 words took 27 s (Expand of the same, 35 s) in the live check: room for the largest.
const UPSTREAM_TIMEOUT_MS = 90_000;
// A charge still pending this long after it was taken was never answered (two tries, with time to spare): the sweep refunds it.
const PENDING_MS = 5 * 60 * 1000;

export const onRequestPost: PagesFunction<Env> = async ({ request, env, data }) => {
  if (Number(request.headers.get("content-length") ?? "0") > MAX_BODY_BYTES) return text("Request body too large", 413);
  // Signed in before the body is read, so strangers can't make us parse it.
  const now = Date.now();
  const s = await getSession(env.DB, request, now);
  if (!s) return text("Sign in to use Rewrite.", 401);
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return text("Request body too large", 413);
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return text("Invalid JSON body", 400);
  }
  // The request's rules and its price, before anything is reserved or charged.
  const req = parseRewriteRequest(body);
  if (typeof req === "string") return text(req, 400);

  const held = await reserveUse(env.DB, "rewrite", s.userId, now);
  if (!held.ok && held.full === "user") return text(`This account has reached today's limit of ${DAILY.rewrite.user} rewrites. It resets at midnight UTC; nothing was charged.`, 429);
  if (!held.ok) return text("Rewrite is fully booked for today. Try again tomorrow; nothing was charged.", 429);
  const ref = randomToken(12);
  if (!(await holdCharge(env.DB, s.userId, req.coins, "rewrite", "rewrite_refund", ref, now, PENDING_MS))) {
    await held.release();
    return Response.json({ coins: req.coins, balance: await balance(env.DB, s.userId) }, { status: 402 });
  }
  // From here the coins come back unless an answer goes out: at once when the request fails, and from
  // the pending charge (sweepCharges) if it never finishes, the browser having gone away mid-call.
  let answered = false;
  try {
    const out = await askClaude(req, env.ANTHROPIC_API_KEY, usageSink(data, MODEL));
    if (out instanceof Response) return out;
    const res = Response.json({ ...out, coins: req.coins, balance: await balance(env.DB, s.userId) });
    answered = true;
    return res;
  } catch (err) {
    console.error(`rewrite failed: ${err instanceof Error ? err.name : "unknown"}`);
    return text(`The rewrite failed. ${refunded(req)} Try again in a moment.`, 502);
  } finally {
    if (answered) await settleCharge(env.DB, ref);
    else await refundCharge(env.DB, ref, Date.now());
  }
};

const refunded = (req: RewriteRequest) => (req.coins === 1 ? "Your coin was refunded." : "Your coins were refunded.");

// Claude, and the answer's check; one more try when an answer breaks a rule
// (in the same paid request), none when Claude is unavailable or cut short.
async function askClaude(req: RewriteRequest, apiKey: string, onUsage: (u: { input: number; output: number }) => void): Promise<Rewritten | Response> {
  let problem: string | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    let toolInput: unknown;
    try {
      ({ toolInput } = await callAnthropicTool(
        apiKey,
        {
          model: MODEL,
          max_tokens: rewriteMaxTokens(req),
          thinking: { type: "disabled" }, // a forced tool call can't think first
          output_config: { effort: "low" },
          system: REWRITE_SYSTEM_PROMPT,
          tools: [REWRITE_TOOL],
          tool_choice: { type: "tool", name: REWRITE_TOOL.name },
          messages: [{ role: "user", content: buildRewritePrompt(req, problem) }],
        },
        { toolName: REWRITE_TOOL.name, timeoutMs: UPSTREAM_TIMEOUT_MS, onUsage },
      ));
    } catch (err) {
      if (err instanceof TruncatedOutputError) return text(`The rewrite came back cut short. ${refunded(req)} Try a shorter selection.`, 422);
      if (err instanceof SyntaxError) {
        problem = "The tool input wasn't valid JSON.";
        continue;
      }
      if (err instanceof Error && err.name === "TimeoutError") return text(`Claude took too long to answer. ${refunded(req)} Try again in a moment.`, 504);
      // The name and status only: a message can quote the model's output, which quotes the paper.
      console.error(`rewrite upstream failure ${err instanceof UpstreamError ? err.status : 502}: ${err instanceof Error ? err.name : "unknown"}`);
      return text(`Claude couldn't be reached. ${refunded(req)} Try again in a moment.`, 502);
    }
    const out = toolInput && typeof toolInput === "object" ? checkRewrite(req, toolInput as { text: unknown; notes: unknown }) : "Answer through the submit_rewrite tool, with text and notes.";
    if (typeof out !== "string") return out;
    problem = out;
    console.error(`rewrite answer refused, try ${attempt + 1}`); // never the problem: it can quote the answer
  }
  return text(`Claude's rewrite didn't keep your citations, numbers or paragraphs as they were, so it wasn't used. ${refunded(req)}`, 422);
}
