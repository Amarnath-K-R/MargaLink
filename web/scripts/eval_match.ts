// The matching accuracy harness. Runs the browser's own ranker (src/lib/rank.ts,
// src/lib/topics.ts) over papers held out of the index by the pipeline, and
// reports how often each paper's real journal comes back — for a ladder of
// configurations, so every signal's contribution is visible. With --fit it
// fits the fusion weights on one half of the papers and the fit scale on the
// other, and with --write-manifest it publishes both, with the accuracy, into
// web/public/index/manifest.json.
//
// Needs a built index and pipeline/data/heldout.* (pipeline/build_index.py).
//   node scripts/eval_match.ts [--sample 5000] [--seed 1] [--refs] [--fit] [--write-manifest]
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { DEFAULT_RANKING, validateRanking, type RankingConfig } from "../src/lib/manifest.ts";
import type { JournalMeta } from "../src/lib/match.ts";
import { calibrate, candidatePool, fusedOrder, type PoolEntry, type RankInput } from "../src/lib/rank.ts";
import { topicShares, type TopicTable } from "../src/lib/topics.ts";

const INDEX = new URL("../public/index/", import.meta.url).pathname;
const DATA = new URL("../../pipeline/data/", import.meta.url).pathname;
const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const opt = (name: string, dflt: number) => (args.includes(name) ? Number(args[args.indexOf(name) + 1]) : dflt);
const SAMPLE = opt("--sample", 5000);
const SEED = opt("--seed", 1);
const YEAR = new Date().getFullYear();

const int8 = (path: string) => {
  const b = readFileSync(path);
  return new Int8Array(b.buffer, b.byteOffset, b.length);
};
const json = <T>(path: string): T => JSON.parse(readFileSync(path, "utf8")) as T;

// A small seeded PRNG (mulberry32) — the sample and the A/B split must be reproducible.
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffle<T>(xs: T[], seed: number): T[] {
  const r = rng(seed);
  const out = [...xs];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

type Heldout = { model_id: string; dim: number; papers: { work: string | null; j: number; topics: string[]; year: number | null }[] };
const manifest = json<Record<string, unknown> & { model_id: string; dim: number }>(`${INDEX}manifest.json`);
const meta = json<JournalMeta[]>(`${INDEX}meta.json`);
const centres = int8(`${INDEX}index.bin`);
const dim = manifest.dim;
const topics: TopicTable = existsSync(`${INDEX}topics.json`)
  ? { int8: int8(`${INDEX}topics.bin`), dim, rows: json(`${INDEX}topics.json`) }
  : { int8: new Int8Array(0), dim, rows: [] };
const topicSubfield = new Map(topics.rows.map((t) => [t.id, t.subfield]));
const heldout = json<Heldout>(`${DATA}heldout.json`);
const hvecs = int8(`${DATA}heldout.bin`);
if (heldout.model_id !== manifest.model_id) throw new Error(`held-out set is from ${heldout.model_id}, index from ${manifest.model_id}`);
const refs: Record<string, Record<string, number>> = flag("--refs") && existsSync(`${DATA}heldout_refs.json`) ? json(`${DATA}heldout_refs.json`) : {};
const query = (i: number) => hvecs.subarray(i * dim, (i + 1) * dim);
const all = meta.map((_, j) => j);
const topicCfg = { topicTop: DEFAULT_RANKING.topicTop, topicTemperature: DEFAULT_RANKING.topicTemperature };

function input(i: number, over: Partial<RankInput> = {}): RankInput {
  const w = heldout.papers[i].work;
  const cited = new Map(Object.entries(w && refs[w] ? refs[w] : {}));
  return {
    queryInt8: query(i),
    dim,
    centres,
    meta,
    candidates: all,
    paperTopics: topics.rows.length ? topicShares(query(i), topics, topicCfg) : [],
    topicSubfield,
    cited,
    k: 10,
    year: YEAR,
    ...over,
  };
}

// --- drift guard: this ranker reproduces the pipeline's own integer ranking ---
{
  const drift = json<{ i: number; top10: number[] }[]>(`${DATA}drift_sample.json`);
  for (const d of drift) {
    const got = fusedOrder(candidatePool(input(d.i, { paperTopics: [], cited: new Map() })), DEFAULT_RANKING.weights)
      .slice(0, 10)
      .map((x) => x.entry.j);
    if (JSON.stringify(got) !== JSON.stringify(d.top10)) {
      console.error(`DRIFT: held-out paper ${d.i}: pipeline ${JSON.stringify(d.top10)} vs rank.ts ${JSON.stringify(got)}`);
      process.exit(1);
    }
  }
  console.log(`drift guard: ${drift.length}/${drift.length} papers ranked identically by the pipeline and rank.ts`);
}

// --- the sample, its pools (weight-independent), and a "today" baseline pool ---
const sample = shuffle(heldout.papers.map((_, i) => i), SEED).slice(0, SAMPLE);
// The v1 baseline: one averaged vector per journal (pipeline/data/mean_centroids.bin).
const means = existsSync(`${DATA}mean_centroids.bin`) ? int8(`${DATA}mean_centroids.bin`) : null;
const oneVectorMeta = meta.map((m, j) => ({ ...m, centres: [j, 1] as [number, number] }));
const t0 = Date.now();
const pools = new Map<number, PoolEntry[]>();
const todayPools = new Map<number, PoolEntry[]>();
for (const i of sample) {
  pools.set(i, candidatePool(input(i)));
  if (means) todayPools.set(i, candidatePool(input(i, { meta: oneVectorMeta, centres: means, paperTopics: [], cited: new Map() })));
}
console.log(`scored ${sample.length} held-out papers against ${meta.length} journals (${centres.length / dim} centres) in ${((Date.now() - t0) / 1000).toFixed(0)} s`);

type Metrics = { n: number; top1: number; top5: number; top10: number; mrr: number; field1: number };
function evaluate(ids: number[], w: RankingConfig["weights"], which = pools): Metrics {
  const m: Metrics = { n: ids.length, top1: 0, top5: 0, top10: 0, mrr: 0, field1: 0 };
  for (const i of ids) {
    const truth = heldout.papers[i].j;
    const order = fusedOrder(which.get(i)!, w);
    const rank = order.findIndex((x) => x.entry.j === truth);
    if (rank === 0) m.top1++;
    if (rank >= 0 && rank < 5) m.top5++;
    if (rank >= 0 && rank < 10) m.top10++;
    if (rank >= 0) m.mrr += 1 / (rank + 1);
    if (order[0] && meta[order[0].entry.j].field === meta[truth].field) m.field1++;
  }
  const n = Math.max(1, ids.length);
  return { n: ids.length, top1: m.top1 / n, top5: m.top5 / n, top10: m.top10 / n, mrr: m.mrr / n, field1: m.field1 / n };
}
const pct = (x: number) => `${(100 * x).toFixed(1)}%`.padStart(7);
const row = (label: string, m: Metrics) =>
  console.log(`${label.padEnd(24)} n=${String(m.n).padStart(5)}  top1${pct(m.top1)}  top5${pct(m.top5)}  top10${pct(m.top10)}  MRR ${m.mrr.toFixed(3)}  field@1${pct(m.field1)}`);

const W = (topic: number, ref: number, prior: number) => ({ emb: 1, topic, ref, prior });
console.log("\nladder (each step adds one thing):");
if (means) row("v1 (mean vector, emb)", evaluate(sample, W(0, 0, 0), todayPools));
row("+ multi-centre", evaluate(sample, W(0, 0, 0)));
if (topics.rows.length) for (const t of [0.01, 0.03, 0.1]) row(`+ topic (w=${t})`, evaluate(sample, W(t, 0, 0)));
const withRefs = sample.filter((i) => heldout.papers[i].work && refs[heldout.papers[i].work!]);
if (withRefs.length) {
  row("refs sample, no ref", evaluate(withRefs, W(0, 0, 0)));
  for (const r of [0.01, 0.03, 0.1]) row(`refs sample, + ref (w=${r})`, evaluate(withRefs, W(0, r, 0)));
}

// Topic estimate quality, where held-out papers carry their real OpenAlex topics.
{
  const tagged = sample.filter((i) => heldout.papers[i].topics.length);
  if (tagged.length && topics.rows.length) {
    let t1 = 0;
    let t3 = 0;
    for (const i of tagged) {
      const est = topicShares(query(i), topics, topicCfg).map((t) => t.id);
      const real = new Set(heldout.papers[i].topics);
      if (real.has(est[0])) t1++;
      if (est.slice(0, 3).some((t) => real.has(t))) t3++;
    }
    console.log(`\ntopic estimate: top-1 in the paper's real topics ${pct(t1 / tagged.length)}, any of top-3 ${pct(t3 / tagged.length)} (n=${tagged.length})`);
  }
}

if (!flag("--fit")) process.exit(0);

// --- fitting: weights on half A, the fit scale and the published accuracy on half B ---
// Grids are small numbers on purpose: similarities between a paper and good vs
// poor journals differ by only a few hundredths, so a large weight on any other
// signal swamps the embedding entirely.
const half = Math.floor(sample.length / 2);
const A = sample.slice(0, half);
const B = sample.slice(half);
const better = (a: Metrics, b: Metrics) => a.top10 > b.top10 || (a.top10 === b.top10 && a.mrr > b.mrr);
let best = { w: W(0, 0, 0), m: evaluate(A, W(0, 0, 0)) };
for (const topic of topics.rows.length ? [0, 0.003, 0.01, 0.02, 0.03, 0.05, 0.1] : [0]) {
  for (const prior of [0, 0.001, 0.003, 0.01]) {
    const m = evaluate(A, W(topic, 0, prior));
    if (better(m, best.m)) best = { w: W(topic, 0, prior), m };
  }
}
// The reference weight is fitted on the papers whose references were resolved.
const refsA = A.filter((i) => withRefs.includes(i));
if (refsA.length) {
  let bestRef = { ref: 0, m: evaluate(refsA, best.w) };
  for (const ref of [0.003, 0.01, 0.02, 0.03, 0.05, 0.1]) {
    const m = evaluate(refsA, { ...best.w, ref });
    if (better(m, bestRef.m)) bestRef = { ref, m };
  }
  best.w = { ...best.w, ref: bestRef.ref };
} else {
  // No resolved references to fit on: a conservative weight — about the gap
  // between a good and a middling journal's similarity — so citations count
  // without overriding the text.
  best.w = { ...best.w, ref: 0.02 };
}
console.log(`\nfitted weights: ${JSON.stringify(best.w)}`);

// Fit scale: the share of real paper→journal pairings (half B) whose fused
// score is at or below a given score — "as close as N% of real pairings".
const trueScores = B.map((i) => {
  const truth = heldout.papers[i].j;
  const hit = fusedOrder(pools.get(i)!, best.w).find((x) => x.entry.j === truth);
  return hit ? hit.fused : -Infinity;
}).filter((x) => x > -Infinity).sort((a, b) => a - b);
const edges: number[] = [];
const probs: number[] = [];
for (let q = 0; q <= 20; q++) {
  const x = trueScores[Math.min(trueScores.length - 1, Math.floor((q / 20) * (trueScores.length - 1)))];
  if (edges.length === 0 || x > edges[edges.length - 1]) {
    edges.push(x);
    probs.push(q / 20);
  }
}
const fitB = evaluate(B, best.w);
const byField: Record<string, { n: number; top10: number }> = {};
for (const i of B) {
  const f = meta[heldout.papers[i].j].field ?? "Unknown";
  byField[f] ??= { n: 0, top10: 0 };
  byField[f].n++;
  if (fusedOrder(pools.get(i)!, best.w).slice(0, 10).some((x) => x.entry.j === heldout.papers[i].j)) byField[f].top10++;
}
for (const f of Object.keys(byField)) byField[f].top10 = byField[f].n ? byField[f].top10 / byField[f].n : 0;
row("\nfitted, on held-out half B", fitB);
console.log("\nper field (half B, top-10):");
for (const [f, v] of Object.entries(byField).sort((a, b) => b[1].n - a[1].n)) console.log(`  ${f.padEnd(48)} n=${String(v.n).padStart(4)} ${pct(v.top10)}`);

const ranking: RankingConfig = {
  ...DEFAULT_RANKING,
  weights: best.w,
  calibration: { edges, probs },
  bands: { strong: 0.5, possible: 0.15 },
  fitted: true,
  accuracy: { n: fitB.n, top1: fitB.top1, top5: fitB.top5, top10: fitB.top10, field1: fitB.field1, byField },
};
if (validateRanking(ranking) !== ranking) throw new Error("the fitted ranking doesn't validate — refusing to write it");
console.log(`\nfit scale: median real pairing scores ${edges[Math.floor(edges.length / 2)]?.toFixed(3)}; e.g. the top result of paper 0 shows fit ${(100 * calibrate(fusedOrder(pools.get(sample[0])!, best.w)[0].fused, ranking.calibration)).toFixed(0)}`);
if (flag("--write-manifest")) {
  writeFileSync(`${INDEX}manifest.json`, JSON.stringify({ ...manifest, ranking }));
  console.log(`wrote ranking into ${INDEX}manifest.json`);
}
