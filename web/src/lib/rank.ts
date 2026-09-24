// The journal ranker, pure: the browser (match.ts) and the accuracy harness
// (scripts/eval_match.ts) run this exact code, so the published accuracy is
// the accuracy of what users get. No DOM, no fetch.
//
// Four signals per candidate journal, weighted and calibrated by the build's
// manifest (ranking), never by constants here:
//   emb   — the paper's cosine to the journal's closest centre (1-4 per journal)
//   topic — overlap between the paper's estimated OpenAlex topics and the
//           journal's recent-paper topic profile
//   ref   — how often the paper's own reference list cites the journal
//   prior — a small activity prior (output volume, published recently)
import type { RankingConfig } from "./manifest.ts";
import type { JournalMeta } from "./match.ts";

export type TopicEstimate = { id: string; name: string; subfield: string; share: number };
export type Signals = { emb: number; topic: number; ref: number; prior: number };
export type Why = {
  topics: { id: string; name: string; paperShare: number; journalShare: number }[];
  cited: number;
  centre: { cos: number; label: string };
};
export type Band = "strong" | "possible" | "weak" | "unfitted";
export type RankedJournal = JournalMeta & { index: number; fit: number | null; band: Band; fused: number; signals: Signals; why: Why };

export type RankInput = {
  queryInt8: Int8Array;
  dim: number;
  centres: Int8Array; // index.bin
  meta: JournalMeta[];
  candidates: number[]; // journal rows passing the filters
  paperTopics: TopicEstimate[];
  topicSubfield: Map<string, string>; // topic id → subfield
  cited: Map<string, number>; // journal id → times the paper cites it (empty when unknown)
  k: number;
  year: number; // the current year, for the activity prior (passed in: the harness must be reproducible)
};

// How many journals, by embedding alone, get the full scoring. Cited journals
// outside it are added, so a journal the paper cites often can still surface.
export const EMB_POOL = 200;
const Q = 127 * 127;

export function centreSpan(m: JournalMeta, row: number): [number, number] {
  return m.centres ?? [row, 1];
}

export function bestCentre(q: Int8Array, centres: Int8Array, dim: number, start: number, count: number): { dot: number; cos: number; centre: number } {
  let best = -Infinity;
  let at = start;
  for (let c = start; c < start + count; c++) {
    let dot = 0;
    const base = c * dim;
    for (let d = 0; d < dim; d++) dot += centres[base + d] * q[d];
    if (dot > best) {
      best = dot;
      at = c;
    }
  }
  return { dot: best, cos: best / Q, centre: at };
}

// Σ paperShare × journalShare over shared topics; a paper topic the journal
// lacks still earns half credit for the journal's share of the same subfield.
export function topicScore(
  paperTopics: TopicEstimate[],
  journalTopics: [string, number][],
  topicSubfield: Map<string, string>,
): { score: number; shared: Why["topics"] } {
  const jt = new Map(journalTopics);
  const bySubfield = new Map<string, number>();
  for (const [id, share] of journalTopics) {
    const sf = topicSubfield.get(id);
    if (sf) bySubfield.set(sf, (bySubfield.get(sf) ?? 0) + share);
  }
  let score = 0;
  const shared: Why["topics"] = [];
  for (const p of paperTopics) {
    const exact = jt.get(p.id);
    if (exact !== undefined) {
      score += p.share * exact;
      shared.push({ id: p.id, name: p.name, paperShare: p.share, journalShare: exact });
    } else {
      score += 0.5 * p.share * (bySubfield.get(p.subfield) ?? 0);
    }
  }
  shared.sort((a, b) => b.paperShare * b.journalShare - a.paperShare * a.journalShare);
  return { score, shared: shared.slice(0, 3) };
}

export function refScore(cited: number, maxCited: number): number {
  return maxCited > 0 ? Math.log1p(cited) / Math.log1p(maxCited) : 0;
}

export function priorScore(m: JournalMeta, year: number): number {
  const volume = Math.min(1, Math.max(0, Math.log10((m.works_count ?? 0) + 1) / 5));
  const recent = m.last_publication_year != null && m.last_publication_year >= year - 2 ? 1 : 0;
  return 0.5 * volume + 0.5 * recent;
}

export function fuse(s: Signals, w: RankingConfig["weights"]): number {
  return w.emb * s.emb + w.topic * s.topic + w.ref * s.ref + w.prior * s.prior;
}

// Piecewise-linear, clamped to the first/last probability.
export function calibrate(x: number, cal: RankingConfig["calibration"]): number {
  const { edges, probs } = cal;
  if (x <= edges[0]) return probs[0];
  for (let i = 1; i < edges.length; i++) {
    if (x <= edges[i]) {
      const t = (x - edges[i - 1]) / (edges[i] - edges[i - 1]);
      return probs[i - 1] + t * (probs[i] - probs[i - 1]);
    }
  }
  return probs[probs.length - 1];
}

export function band(fit: number | null, cfg: RankingConfig): Band {
  if (fit === null) return "unfitted";
  return fit >= cfg.bands.strong ? "strong" : fit >= cfg.bands.possible ? "possible" : "weak";
}

// Everything about a candidate that doesn't depend on the weights — computed
// once per paper, so the harness can try many weightings cheaply on the
// same code path the browser runs.
export type PoolEntry = { j: number; cos: number; centre: number; signals: Signals; shared: Why["topics"]; cited: number };

export function candidatePool(input: RankInput): PoolEntry[] {
  const { queryInt8, dim, centres, meta, candidates, cited } = input;
  const scored = candidates.map((j) => {
    const [start, count] = centreSpan(meta[j], j);
    return { j, ...bestCentre(queryInt8, centres, dim, start, count) };
  });
  // Ties break by row so the order is exactly reproducible (the drift check).
  scored.sort((a, b) => b.dot - a.dot || a.j - b.j);
  const pool = scored.slice(0, EMB_POOL);
  const inPool = new Set(pool.map((s) => s.j));
  const idOf = new Map(candidates.map((j) => [meta[j].id, j]));
  for (const id of cited.keys()) {
    const j = idOf.get(id);
    if (j !== undefined && !inPool.has(j)) pool.push(scored.find((s) => s.j === j)!);
  }
  const maxCited = Math.max(0, ...cited.values());
  return pool.map(({ j, cos, centre }) => {
    const m = meta[j];
    const t = input.paperTopics.length ? topicScore(input.paperTopics, m.topics ?? [], input.topicSubfield) : { score: 0, shared: [] };
    const n = cited.get(m.id) ?? 0;
    return { j, cos, centre, cited: n, shared: t.shared, signals: { emb: cos, topic: t.score, ref: refScore(n, maxCited), prior: priorScore(m, input.year) } };
  });
}

// The ranking itself: fused score descending, row ascending on ties.
export function fusedOrder(pool: PoolEntry[], weights: RankingConfig["weights"]): { entry: PoolEntry; fused: number }[] {
  return pool.map((entry) => ({ entry, fused: fuse(entry.signals, weights) })).sort((a, b) => b.fused - a.fused || a.entry.j - b.entry.j);
}

export function scorePool(pool: PoolEntry[], meta: JournalMeta[], cfg: RankingConfig, k: number): RankedJournal[] {
  return fusedOrder(pool, cfg.weights)
    .slice(0, k)
    .map(({ entry, fused }) => {
      const m = meta[entry.j];
      const fit = cfg.fitted ? calibrate(fused, cfg.calibration) : null;
      const [start] = centreSpan(m, entry.j);
      return {
        ...m,
        index: entry.j,
        fit,
        band: band(fit, cfg),
        fused,
        signals: entry.signals,
        why: { topics: entry.shared, cited: entry.cited, centre: { cos: entry.cos, label: m.centre_topics?.[entry.centre - start] ?? "" } },
      };
    });
}

export function rankJournals(input: RankInput, cfg: RankingConfig): RankedJournal[] {
  return scorePool(candidatePool(input), input.meta, cfg, input.k);
}
