// Describes the shipped journal index. Journal vectors and paper vectors must
// come from the exact same model — model_id and query_prefix say which, and
// the pipeline writes both (pipeline/embedding.py is their one source).
export type RankingConfig = {
  version: 2;
  weights: { emb: number; topic: number; ref: number; prior: number };
  topicTop: number; // topics kept in a paper's estimate
  topicTemperature: number; // softmax temperature over topic cosines
  calibration: { edges: number[]; probs: number[] }; // fused score → P(true journal), piecewise linear
  bands: { strong: number; possible: number }; // on P
  fitted: boolean; // false until web/scripts/eval_match.ts fits this build
  accuracy: {
    n: number;
    top1: number;
    top5: number;
    top10: number;
    field1: number;
    byField: Record<string, { n: number; top10: number }>;
  } | null;
};

// Used until a build is fitted (and for anything malformed): the embedding
// alone, no percentages shown.
export const DEFAULT_RANKING: RankingConfig = {
  version: 2,
  weights: { emb: 1, topic: 0, ref: 0, prior: 0 },
  topicTop: 10,
  topicTemperature: 0.05,
  calibration: { edges: [0, 1], probs: [0, 1] },
  bands: { strong: 0.6, possible: 0.25 },
  fitted: false,
  accuracy: null,
};

export type IndexManifest = {
  model_id: string; // HF model id, loaded by @huggingface/transformers
  dim: number;
  query_prefix: string; // e5-style models need "query: "; "" for the rest
  journal_count: number;
  centre_count?: number;
  topic_count?: number;
  built_at: string;
  ranking: RankingConfig;
};

const num = (v: unknown, min = 0, max = Infinity): v is number => typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

// The manifest is a public static file, but a stale cache or an interim build
// can hand the page anything: never throw, fall back to the unfitted default.
export function validateRanking(v: unknown): RankingConfig {
  if (!obj(v) || v.version !== 2) return DEFAULT_RANKING;
  const w = v.weights;
  if (!obj(w) || !["emb", "topic", "ref", "prior"].every((k) => num(w[k]))) return DEFAULT_RANKING;
  if (!num(v.topicTop, 1, 50) || !Number.isInteger(v.topicTop) || !num(v.topicTemperature) || v.topicTemperature === 0) return DEFAULT_RANKING;
  const c = v.calibration;
  if (!obj(c) || !Array.isArray(c.edges) || !Array.isArray(c.probs) || c.edges.length < 2 || c.edges.length !== c.probs.length) return DEFAULT_RANKING;
  const edges = c.edges as unknown[];
  const probs = c.probs as unknown[];
  if (!edges.every((e, i) => num(e, -Infinity) && (i === 0 || (e as number) > (edges[i - 1] as number)))) return DEFAULT_RANKING;
  if (!probs.every((p, i) => num(p, 0, 1) && (i === 0 || (p as number) >= (probs[i - 1] as number)))) return DEFAULT_RANKING;
  const b = v.bands;
  if (!obj(b) || !num(b.strong, 0, 1) || !num(b.possible, 0, 1) || b.possible > b.strong) return DEFAULT_RANKING;
  if (typeof v.fitted !== "boolean") return DEFAULT_RANKING;
  const a = v.accuracy;
  if (a !== null && !(obj(a) && ["n", "top1", "top5", "top10", "field1"].every((k) => num(a[k])) && obj(a.byField))) return DEFAULT_RANKING;
  return v as unknown as RankingConfig;
}

let cached: IndexManifest | null = null;

export async function loadManifest(): Promise<IndexManifest> {
  if (cached) return cached;
  const res = await fetch("/index/manifest.json");
  if (!res.ok) throw new Error(`manifest.json fetch failed: ${res.status}`);
  const raw = (await res.json()) as Record<string, unknown>;
  cached = {
    ...(raw as unknown as IndexManifest),
    query_prefix: typeof raw.query_prefix === "string" ? raw.query_prefix : "",
    ranking: validateRanking(raw.ranking),
  };
  return cached;
}
