// Journal matching: everything below runs against data already sitting in the
// browser (the index fetched once and cached). The only network calls this
// file makes are for public, non-personal static assets - never the paper.
import { loadManifest } from "./manifest.ts";

export type JournalMeta = {
  id: string;
  display_name: string;
  field: string | null;
  is_in_doaj: boolean | null;
  apc_usd: number | null;
  country_code: string | null;
};

export type MatchResult = JournalMeta & { score: number };

export type JournalFilters = {
  field?: string;
  openAccessOnly?: boolean;
  maxFeeUsd?: number;
};

export function quantizeInt8(unitVec: Float32Array): Int8Array {
  const out = new Int8Array(unitVec.length);
  for (let i = 0; i < unitVec.length; i++) {
    const v = Math.round(unitVec[i] * 127);
    out[i] = v > 127 ? 127 : v < -127 ? -127 : v;
  }
  return out;
}

/** Rank a set of candidate journal indices against one query vector, both int8. */
export function topK(
  queryInt8: Int8Array,
  indexInt8: Int8Array,
  dim: number,
  candidateIndices: number[],
  k: number
): { index: number; score: number }[] {
  const scored = candidateIndices.map((j) => {
    let dot = 0;
    const base = j * dim;
    for (let d = 0; d < dim; d++) dot += indexInt8[base + d] * queryInt8[d];
    return { index: j, score: dot };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, k);
}

export function passesFilters(m: JournalMeta, f: JournalFilters): boolean {
  if (f.field && m.field !== f.field) return false;
  if (f.openAccessOnly && !m.is_in_doaj) return false;
  if (f.maxFeeUsd !== undefined && (m.apc_usd == null || m.apc_usd > f.maxFeeUsd)) return false;
  return true;
}

let indexCache: { int8: Int8Array; meta: JournalMeta[]; dim: number } | null = null;

async function loadIndex() {
  if (indexCache) return indexCache;
  const manifest = await loadManifest();
  const [binRes, metaRes] = await Promise.all([
    fetch("/index/index.bin"),
    fetch("/index/meta.json"),
  ]);
  if (!binRes.ok || !metaRes.ok) throw new Error("failed to load journal index");
  const buf = new Int8Array(await binRes.arrayBuffer());
  const meta = (await metaRes.json()) as JournalMeta[];
  indexCache = { int8: buf, meta, dim: manifest.dim };
  return indexCache;
}

/** Distinct fields present in the index, sorted — for populating a filter dropdown. */
export async function getAvailableFields(): Promise<string[]> {
  const { meta } = await loadIndex();
  const fields = new Set<string>();
  for (const m of meta) if (m.field) fields.add(m.field);
  return Array.from(fields).sort();
}

export async function matchJournals(
  queryEmbedding: Float32Array,
  k = 10,
  filters: JournalFilters = {}
): Promise<MatchResult[]> {
  const { int8, meta, dim } = await loadIndex();
  const queryInt8 = quantizeInt8(queryEmbedding);
  const candidateIndices = meta
    .map((_, i) => i)
    .filter((i) => passesFilters(meta[i], filters));
  const ranked = topK(queryInt8, int8, dim, candidateIndices, k);
  return ranked.map(({ index, score }) => ({ ...meta[index], score }));
}
