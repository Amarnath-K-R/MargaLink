// Live check for the review (the spec's gate): the real Functions and the
// real Claude, each paper at each depth, run the way the browser runs it
// (reviewOrchestrator.ts, with fetch routed to the handlers). For a person to
// read before merging: each report as Markdown, and per run the cost, time,
// passes, cache reads, findings by severity, near-duplicate titles (there
// must be none) and findings set aside, against the cost ceilings.
// Spends real money (about $1-3 a paper for all three depths). Papers come
// from a folder you name (PDF, Word or plain text) and go only to Anthropic;
// nothing is written into the repo. Reads ANTHROPIC_API_KEY from the
// environment or web/.dev.vars, and never prints it.
//   node scripts/eval/review_live.ts ~/review-papers [--tiers quick,standard,thorough] [--journal <id>|none] [--notes <file>] > review-live.md
import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { onRequestPost as start } from "../../functions/api/review/start.ts";
import { onRequestPost as review } from "../../functions/api/review.ts";
import { testD1 } from "../../src/lib/accounts/testD1.ts";
import { createSession, signInUser } from "../../src/lib/accounts/auth.ts";
import { credit } from "../../src/lib/accounts/ledger.ts";
import { aiCost } from "../../src/lib/admin/stats.ts";
import { reviewPrice } from "../../src/lib/accounts/coins.ts";
import { extractFromFile } from "../../src/lib/paper/extract.ts";
import { prepareForReview } from "../../src/lib/review/review.ts";
import { runReview } from "../../src/lib/review/reviewOrchestrator.ts";
import { reportMarkdown } from "../../src/lib/review/reviewReport.ts";
import { JOURNAL_RULES } from "../../src/lib/journals/journalRules.ts";
import type { HeadingHint, ReviewReport, ReviewTier } from "../../src/lib/review/reviewTypes.ts";

// pdf.js in Node: its worker, loaded up front, runs in this thread.
(globalThis as { pdfjsWorker?: unknown }).pdfjsWorker = await import("pdfjs-dist/build/pdf.worker.min.mjs");
// mammoth in Node opens only { path } or { buffer }; the site hands it { arrayBuffer }, which only its browser build reads.
const unzip = createRequire(import.meta.url)("mammoth/lib/unzip.js") as { openZip: (o: { arrayBuffer?: ArrayBuffer }) => unknown };
const openZip = unzip.openZip;
unzip.openZip = (o) => openZip(o.arrayBuffer ? { buffer: Buffer.from(o.arrayBuffer) } as never : o);

const args = process.argv.slice(2);
const folder = args.find((a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--"));
if (!folder) throw new Error("Name a folder of papers: node scripts/eval/review_live.ts <folder>");
const opt = (name: string) => args[args.indexOf(`--${name}`) + 1];
const tiers = (args.includes("--tiers") ? opt("tiers").split(",") : ["quick", "standard", "thorough"]) as ReviewTier[];
const noJournal = opt("journal") === "none" && args.includes("--journal");
const rules = noJournal ? null : args.includes("--journal") ? JOURNAL_RULES.find((j) => j.journalId === opt("journal")) : JOURNAL_RULES[0];
if (rules === undefined) throw new Error("Unknown --journal; use one of the pilot journals' ids, or none");
// The authors' notes for the review, sent with every pass like the paper.
const guidance = args.includes("--notes") ? readFileSync(opt("notes"), "utf8").trim() : "";

const key = process.env.ANTHROPIC_API_KEY ?? readFileSync(new URL("../../.dev.vars", import.meta.url), "utf8").match(/^ANTHROPIC_API_KEY\s*=\s*"?([^"\n]+)"?/m)?.[1];
if (!key) throw new Error("Set ANTHROPIC_API_KEY or put it in web/.dev.vars");
const env = { DB: testD1(), ANTHROPIC_API_KEY: key };
const user = await signInUser(env.DB, { email: "live@x.org" }, Date.now());
await credit(env.DB, user.id, 10_000, "admin", "live", Date.now());
const cookie = `__Host-ml_session=${await createSession(env.DB, user.id, Date.now())}`;

// fetch: the review's own requests go to the handlers; Anthropic's go out.
type Pass = { pass: string; ms: number; status: number; ai?: { model: string; input: number; output: number; cacheRead?: number } };
let passes: Pass[] = [];
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input);
  if (!url.startsWith("http://eval/")) return realFetch(input, init);
  const request = new Request(url, { method: "POST", body: init?.body, headers: { ...(init?.headers as Record<string, string>), cookie } });
  const data: Record<string, unknown> = {};
  const t0 = performance.now();
  const handler = (url.endsWith("/start") ? start : review) as unknown as (c: { request: Request; env: typeof env; data: Record<string, unknown> }) => Promise<Response>;
  const res = await handler({ request, env, data });
  if (url.endsWith("/api/review")) passes.push({ pass: JSON.parse(init!.body as string).pass, ms: performance.now() - t0, status: res.status, ai: data.ai as Pass["ai"] });
  return res;
}) as typeof fetch;

// The ceiling: Claude may take 60% of a review's price at the cheapest coin ($0.09), so $0.22, $0.32 and $0.54 for the first 50,000 characters.
const ceilingFor = (tier: ReviewTier, chars: number) => 0.6 * 0.09 * reviewPrice(tier, chars);
// Where the cost goes: output (thinking included) is most of it.
const outputs = (ps: Pass[]) => {
  const out = (kind: string) => ps.filter((p) => p.pass === kind && p.ai).map((p) => p.ai!.output);
  const sec = out("section");
  const avg = sec.length ? Math.round(sec.reduce((a, b) => a + b, 0) / sec.length) : 0;
  return `${avg.toLocaleString("en")}/${Math.max(0, ...sec).toLocaleString("en")}, ${out("checklist").join("+") || "-"}, ${out("editor").join("+") || "-"}`;
};
const words = (s: string) => new Set(s.toLowerCase().match(/[a-z0-9]+/g) ?? []);
const similar = (a: string, b: string) => {
  const x = words(a);
  const y = words(b);
  const both = [...x].filter((w) => y.has(w)).length;
  return both / Math.max(1, new Set([...x, ...y]).size);
};
const nearDuplicates = (r: ReviewReport) => {
  const titles = [...r.sections.flatMap((s) => s.findings), ...r.acrossPaper].map((f) => f.title);
  const pairs: string[] = [];
  for (let i = 0; i < titles.length; i++) for (let j = i + 1; j < titles.length; j++) if (similar(titles[i], titles[j]) >= 0.6) pairs.push(`"${titles[i]}" ~ "${titles[j]}"`);
  return pairs;
};

const files = readdirSync(folder).filter((f) => /\.(pdf|docx|txt)$/i.test(f)).sort();
if (files.length === 0) throw new Error(`No .pdf, .docx or .txt papers in ${folder}`);
console.log(`# Review live check, ${new Date().toISOString().slice(0, 10)}, against ${rules ? rules.journalName : "no journal"}${guidance ? `, with ${guidance.length.toLocaleString("en")} characters of notes` : ""}\n`);
const summary: string[] = [
  "| Paper | Depth | Chars | Passes | Time | Cost | Ceiling | Cache read | Output tokens: sections avg/max, checklist, editor | Major/minor/sugg. | Set aside | Near-duplicates |",
  "|---|---|---|---|---|---|---|---|---|---|---|---|",
];
const reports: string[] = [];
for (const name of files) {
  const path = join(folder, name);
  const read: { fullText: string; headings?: HeadingHint[] } = /\.(pdf|docx)$/i.test(name)
    ? await extractFromFile(new File([readFileSync(path)], name), { headings: true })
    : { fullText: readFileSync(path, "utf8"), headings: [] };
  const text = prepareForReview(read.fullText);
  for (const tier of tiers) {
    passes = [];
    const t0 = performance.now();
    let report: ReviewReport;
    try {
      report = (await runReview({ text, hints: read.headings ?? [], journalId: rules?.journalId ?? null, journalName: rules?.journalName ?? null, guidance, tier, endpoint: "http://eval/api/review" })).result;
    } catch (err) {
      summary.push(`| ${name} | ${tier} | | ${passes.length} | | | | | ${outputs(passes)} | | | FAILED: ${err instanceof Error ? err.message : String(err)} |`);
      continue;
    }
    const secs = (performance.now() - t0) / 1000;
    const cost = passes.reduce((n, p) => n + (p.ai ? (aiCost(p.ai.model, p.ai.input, p.ai.output) ?? 0) : 0), 0);
    const cacheRead = passes.reduce((n, p) => n + (p.ai?.cacheRead ?? 0), 0);
    const all = [...report.sections.flatMap((s) => s.findings), ...report.acrossPaper];
    const by = (s: string) => all.filter((f) => f.severity === s).length;
    const ceiling = ceilingFor(tier, text.length + guidance.length);
    const dups = nearDuplicates(report);
    summary.push(
      `| ${name} | ${tier} | ${text.length.toLocaleString("en")} | ${passes.length} (${passes.filter((p) => p.status !== 200).length} failed) | ${secs.toFixed(0)} s | $${cost.toFixed(3)} | $${ceiling.toFixed(2)}${cost > ceiling ? " **OVER**" : ""} | ${cacheRead.toLocaleString("en")} | ${outputs(passes)} | ${by("major")}/${by("minor")}/${by("suggestion")} | ${report.coverage.setAside} | ${dups.length ? dups.join("; ") : "none"} |`,
    );
    reports.push(`\n---\n\n<!-- ${name}, ${tier} -->\n\n${reportMarkdown(report)}`);
  }
}
console.log(summary.join("\n"));
console.log(reports.join("\n"));
