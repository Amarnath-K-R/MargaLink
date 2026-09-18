// Runs the embedding model in the browser (WASM/WebGPU via transformers.js).
// The model itself is public and downloads like any static asset — only the
// text typed or extracted from the user's paper is fed to it, and that never
// leaves this tab. See match.ts: only the resulting numbers get used locally.
import { loadManifest } from "./manifest.ts";

type FeatureExtractionPipeline = (
  text: string,
  options: { pooling: "mean"; normalize: true }
) => Promise<{ data: Float32Array }>;

let pipelinePromise: Promise<FeatureExtractionPipeline> | null = null;

async function getPipeline(): Promise<FeatureExtractionPipeline> {
  if (!pipelinePromise) {
    pipelinePromise = (async () => {
      const { pipeline } = await import("@huggingface/transformers");
      const manifest = await loadManifest();
      return (await pipeline(
        "feature-extraction",
        manifest.model_id
      )) as unknown as FeatureExtractionPipeline;
    })();
  }
  return pipelinePromise;
}

export async function embed(text: string): Promise<Float32Array> {
  const extractor = await getPipeline();
  const output = await extractor(text, { pooling: "mean", normalize: true });
  return output.data;
}
