// Live check for Rewrite (B8 in the spec): the real Function, the real
// Claude, every tool on a LaTeX passage and a Word passage, each answer put
// back the way the editors put it back. For a person to read before merging:
// the rewrites, Clarity's notes, tokens, cost and time per call.
// Spends real money (about $0.20 a run). Reads ANTHROPIC_API_KEY from the
// environment or web/.dev.vars, and never prints it.
//   node scripts/eval/rewrite_live.ts > rewrite-live.md
//   node scripts/eval/rewrite_live.ts --long   # time Paraphrase and Expand on a passage near the 2,000-word limit
import { readFileSync } from "node:fs";
import { schema } from "@stll/folio-core/prosemirror/schema";
import { EditorState } from "prosemirror-state";
import { onRequestPost } from "../../functions/api/rewrite.ts";
import { testD1 } from "../../src/lib/accounts/testD1.ts";
import { createSession, signInUser } from "../../src/lib/accounts/auth.ts";
import { credit } from "../../src/lib/accounts/ledger.ts";
import { rewritePrice } from "../../src/lib/accounts/coins.ts";
import { aiCost } from "../../src/lib/admin/stats.ts";
import { checkRewrite, rewriteWords, TOOLS, type RewriteRequest } from "../../src/lib/writing/rewrite.ts";
import { fromPassage, toPassage, type Passage } from "../../src/lib/writing/latexText.ts";
import { applyDocRewrite, docPassage, type WordPassage } from "../../src/lib/writing/docText.ts";

const key =
  process.env.ANTHROPIC_API_KEY ??
  readFileSync(new URL("../../.dev.vars", import.meta.url), "utf8").match(/^ANTHROPIC_API_KEY\s*=\s*"?([^"\n]+)"?/m)?.[1];
if (!key) throw new Error("Set ANTHROPIC_API_KEY or put it in web/.dev.vars");

const env = { DB: testD1(), ANTHROPIC_API_KEY: key };
const user = await signInUser(env.DB, { email: "live@x.org" }, Date.now());
await credit(env.DB, user.id, 500, "admin", "live", Date.now());
const cookie = `__Host-ml_session=${await createSession(env.DB, user.id, Date.now())}`;

// --- the passages
const tex = String.raw`Sleep after cardiac surgery is often short and broken~\cite{smith2019,lee2021}, and \emph{poor sleep} in the first
week has been linked to slower recovery (see Section~\ref{sec:methods}). In our cohort of $n = 412$ adults, wrist
actigraphy showed a mean total sleep time of 5.2 hours on the first night. % check this number
Patients who slept less than five hours were readmitted more often within 30 days, as shown in Table~\ref{tab:readmit}.

This suggests that sleep could be a modifiable target, although the observational design does not allow causal claims.`;
const latex = toPassage(tex, 0, tex.length) as Passage;
if (typeof latex === "string") throw new Error(latex);

const t = (s: string, marks: ReturnType<typeof schema.mark>[] = []) => schema.text(s, marks);
const N = schema.nodes;
const citation = (text: string) => N.field.create({ fieldType: "UNKNOWN", fieldKind: "complex", instruction: " ADDIN ZOTERO_ITEM CSL_CITATION ", displayText: text });
const word = () =>
  N.doc.create(null, [
    N.paragraph.create(null, [
      t("Sleep after cardiac surgery is often short and broken "), citation("(Smith, 2019; Lee, 2021)"), t(", and poor sleep in the first week has been linked to slower recovery"),
      t("1", [schema.marks.footnoteRef.create({ id: "1", noteType: "footnote" })]), t(". In our cohort of 412 adults, wrist actigraphy showed a mean total sleep time of "),
      N.math.create({ display: false, ommlXml: "<m:oMath/>", plainText: "5.2 h" }), t(" on the first night."),
    ]),
    N.paragraph.create(null, [t("Patients who slept less than five hours were readmitted more often within 30 days "), citation("(Table 2)"), t(". This suggests that "), t("sleep could be a modifiable target", [schema.marks.bold.create()]), t(", although the observational design does not allow causal claims.")]),
  ]);
const wordDoc = word();
const docx = docPassage(wordDoc, 0, wordDoc.content.size) as WordPassage;
if (typeof docx === "string") throw new Error(docx);

// Each answer Claude gives, read off the stream here (the Function never logs it), so a refused
// try can be shown with the rule it broke.
const realFetch = globalThis.fetch;
let tries: unknown[] = [];
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const res = await realFetch(input, init);
  const [mine, theirs] = res.body!.tee();
  void new Response(mine).text().then((sse) => {
    const json = [...sse.matchAll(/"partial_json":("(?:[^"\\]|\\.)*")/g)].map((m) => JSON.parse(m[1]) as string).join("");
    try {
      tries.push(JSON.parse(json));
    } catch {
      tries.push(json);
    }
  });
  return new Response(theirs, { status: res.status, headers: res.headers });
}) as typeof fetch;

// --- the longest passage allowed: how long Claude takes, against the Function's timeout
if (process.argv.includes("--long")) {
  const { callAnthropicTool } = await import("../../src/lib/ai/anthropicStream.ts");
  const { REWRITE_SYSTEM_PROMPT, REWRITE_TOOL, buildRewritePrompt, rewriteMaxTokens } = await import("../../src/lib/writing/rewritePrompt.ts");
  const long = toPassage(Array.from({ length: 19 }, () => tex).join("\n\n"), 0, 19 * (tex.length + 2) - 2) as Passage;
  for (const tool of ["paraphrase", "expand"] as const) {
    const req = { tool, tone: null, format: "latex" as const, dialect: "gb" as const, passage: long.passage, coins: rewritePrice(rewriteWords(long.passage)) };
    const started = Date.now();
    let usage = { input: 0, output: 0 };
    const { stopReason } = await callAnthropicTool(
      key,
      { model: "claude-sonnet-5", max_tokens: rewriteMaxTokens(req), thinking: { type: "disabled" }, output_config: { effort: "low" }, system: REWRITE_SYSTEM_PROMPT, tools: [REWRITE_TOOL], tool_choice: { type: "tool", name: REWRITE_TOOL.name }, messages: [{ role: "user", content: buildRewritePrompt(req) }] },
      { toolName: REWRITE_TOOL.name, timeoutMs: 300_000, onUsage: (u) => (usage = u) },
    ).catch((err: Error) => ({ stopReason: err.name }));
    console.log(`${tool}: ${rewriteWords(long.passage)} words, ${req.coins} coins, max_tokens ${rewriteMaxTokens(req)}, ${((Date.now() - started) / 1000).toFixed(1)} s, ${usage.input} in / ${usage.output} out, ${stopReason}, $${(aiCost("claude-sonnet-5", usage.input, usage.output) ?? 0).toFixed(4)}`);
  }
  process.exit(0);
}

// --- each tool, each format
const call = async (req: Omit<RewriteRequest, "coins">) => {
  const data: Record<string, unknown> = {};
  const body = { ...req, coins: rewritePrice(rewriteWords(req.passage)) };
  const started = Date.now();
  const handler = onRequestPost as unknown as (ctx: { request: Request; env: typeof env; data: Record<string, unknown> }) => Promise<Response>;
  const res = await handler({ request: new Request("http://x/api/rewrite", { method: "POST", body: JSON.stringify(body), headers: { cookie } }), env, data });
  return { status: res.status, body: await res.text(), ms: Date.now() - started, ai: data.ai as { model: string; input: number; output: number } | undefined, coins: body.coins };
};

const out: string[] = ["# Rewrite live check", "", `Run ${new Date().toISOString()}.`, ""];
let total = 0;
let slowest = 0;
for (const format of ["latex", "text"] as const) {
  const passage = format === "latex" ? latex.passage : docx.passage;
  out.push(`## ${format === "latex" ? "LaTeX" : "Word"}`, "", "Passage:", "", "```", passage, "```", "");
  for (const tool of TOOLS) {
    const tone = tool === "tone" ? (format === "latex" ? "confident" : "plain") : null;
    tries = [];
    const r = await call({ tool, tone, format, dialect: "gb", passage });
    await new Promise((done) => setTimeout(done, 50));
    const cost = r.ai ? (aiCost(r.ai.model, r.ai.input, r.ai.output) ?? 0) : 0;
    total += cost;
    slowest = Math.max(slowest, r.ms);
    out.push(`### ${tool}${tone ? ` (${tone})` : ""}: ${r.status}, ${r.coins} coin(s), ${(r.ms / 1000).toFixed(1)} s, ${r.ai ? `${r.ai.input} in / ${r.ai.output} out` : "no call"}, $${cost.toFixed(4)}`, "");
    const req = { tool, tone, format, dialect: "gb", passage, coins: r.coins } as RewriteRequest;
    for (const [i, answer] of tries.entries()) {
      const verdict = typeof answer === "object" && answer ? checkRewrite(req, answer as { text: unknown; notes: unknown }) : "not JSON";
      if (typeof verdict === "string") out.push(`Try ${i + 1} refused: ${verdict}`, "", "```", String((answer as { text?: unknown })?.text ?? answer), "```", "");
    }
    if (r.status !== 200) {
      out.push(`> ${r.body}`, "");
      continue;
    }
    const answer = JSON.parse(r.body) as { text: string; notes: string[] };
    if (format === "latex") out.push("```latex", fromPassage(answer.text, latex.parts), "```", "");
    else {
      const view = { state: EditorState.create({ schema, doc: word() }), dispatch(tr: Parameters<EditorState["apply"]>[0]) { view.state = view.state.apply(tr); } };
      const placed = applyDocRewrite(view, docx, answer.text);
      out.push(`Put back in the document: **${placed}**`, "", "```", view.state.doc.textBetween(0, view.state.doc.content.size, "\n\n"), "```", "");
    }
    if (answer.notes.length) out.push("Notes:", "", ...answer.notes.map((n) => `- ${n}`), "");
  }
}
out.push(`Total: $${total.toFixed(4)} over ${TOOLS.length * 2} rewrites; slowest ${(slowest / 1000).toFixed(1)} s.`);
console.log(out.join("\n"));
