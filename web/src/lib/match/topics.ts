// A paper's OpenAlex topics, estimated in the browser: its vector against
// the ~4,500 topic vectors (each topic's name, description and keywords,
// embedded by the pipeline with the same model). Only public files are
// fetched; the paper's vector never leaves the tab.
import type { TopicEstimate } from "./rank.ts";

export type TopicRow = { id: string; name: string; subfield: string; field: string; domain: string };
export type TopicTable = { int8: Int8Array; dim: number; rows: TopicRow[] };

const Q = 127 * 127;

// The top `topicTop` topics by cosine, with shares from a softmax over those
// cosines (a low temperature makes a clear leader take most of the weight).
export function topicShares(queryInt8: Int8Array, table: TopicTable, cfg: { topicTop: number; topicTemperature: number }): TopicEstimate[] {
  const { int8, dim, rows } = table;
  const cos = rows.map((_, r) => {
    let dot = 0;
    const base = r * dim;
    for (let d = 0; d < dim; d++) dot += int8[base + d] * queryInt8[d];
    return { r, c: dot / Q };
  });
  cos.sort((a, b) => b.c - a.c || a.r - b.r);
  const top = cos.slice(0, cfg.topicTop);
  if (top.length === 0) return [];
  const max = top[0].c;
  const w = top.map((t) => Math.exp((t.c - max) / cfg.topicTemperature));
  const total = w.reduce((a, b) => a + b, 0);
  return top.map((t, i) => ({ id: rows[t.r].id, name: rows[t.r].name, subfield: rows[t.r].subfield, share: w[i] / total }));
}

let cache: Promise<TopicTable> | null = null;

// An older build has no topic files: an empty table, and the topic signal is simply off.
export function loadTopics(dim: number): Promise<TopicTable> {
  if (!cache) {
    cache = (async () => {
      const [bin, json] = await Promise.all([fetch("/index/topics.bin"), fetch("/index/topics.json")]);
      if (!bin.ok || !json.ok) return { int8: new Int8Array(0), dim, rows: [] };
      return { int8: new Int8Array(await bin.arrayBuffer()), dim, rows: (await json.json()) as TopicRow[] };
    })();
    cache.catch(() => (cache = null));
  }
  return cache;
}

let namesCache: Promise<Record<string, string>> | null = null;

// Topic id → name only (topics.json, no vectors) — for journal details.
export function loadTopicNames(): Promise<Record<string, string>> {
  namesCache ??= fetch("/index/topics.json")
    .then((r) => (r.ok ? (r.json() as Promise<TopicRow[]>) : []))
    .then((rows) => Object.fromEntries(rows.map((t) => [t.id, t.name])))
    .catch(() => ({}));
  return namesCache;
}
