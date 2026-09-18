// Journal matching: everything below runs against data already sitting in the
// browser (the index fetched once and cached). The only network calls this
// file makes are for public, non-personal static assets - never the paper.
import { loadManifest } from "./manifest.ts";

export type JournalMeta = { id: string; display_name: string };

export type MatchResult = JournalMeta & { score: number };

export function quantizeInt8(unitVec: Float32Array): Int8Array {
  const out = new Int8Array(unitVec.length);
  for (let i = 0; i < unitVec.length; i++) {
    const v = Math.round(unitVec[i] * 127);
    out[i] = v > 127 ? 127 : v < -127 ? -127 : v;
  }
  return out;
}

/** Rank every journal centroid against one query vector, both int8. */
export function topK(
  queryInt8: Int8Array,
  indexInt8: Int8Array,
  dim: number,
  journalCount: number,
  k: number
): { index: number; score: number }[] {
  const scores = new Int32Array(journalCount);
  for (let j = 0; j < journalCount; j++) {
    let dot = 0;
    const base = j * dim;
    for (let d = 0; d < dim; d++) dot += indexInt8[base + d] * queryInt8[d];
    scores[j] = dot;
  }
  const order = Array.from({ length: journalCount }, (_, i) => i);
  order.sort((a, b) => scores[b] - scores[a]);
  return order.slice(0, k).map((index) => ({ index, score: scores[index] }));
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

export async function matchJournals(
  queryEmbedding: Float32Array,
  k = 10
): Promise<MatchResult[]> {
  const { int8, meta, dim } = await loadIndex();
  const queryInt8 = quantizeInt8(queryEmbedding);
  const journalCount = meta.length;
  const ranked = topK(queryInt8, int8, dim, journalCount, k);
  return ranked.map(({ index, score }) => ({ ...meta[index], score }));
}
