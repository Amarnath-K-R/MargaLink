// Describes the shipped journal index. Frozen once Phase 0 picks a model —
// journal vectors and paper vectors must come from the exact same model.
export type IndexManifest = {
  model_id: string; // HF model id, loaded by @huggingface/transformers
  dim: number;
  journal_count: number;
  built_at: string;
};

let cached: IndexManifest | null = null;

export async function loadManifest(): Promise<IndexManifest> {
  if (cached) return cached;
  const res = await fetch("/index/manifest.json");
  if (!res.ok) throw new Error(`manifest.json fetch failed: ${res.status}`);
  cached = (await res.json()) as IndexManifest;
  return cached;
}
