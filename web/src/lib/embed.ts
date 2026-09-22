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
      const { pipeline, env } = await import("@huggingface/transformers");
      // Without this, onnxruntime-web's default wasmPaths resolves relative
      // to the module itself — Next's bundler statically detects that and
      // copies the runtime's WASM files (one is 25.6MB) into the static
      // export, which is over Cloudflare Pages' 25MB per-file limit. Point
      // at the exact matching version on jsdelivr instead — a public, no-
      // personal-data fetch, same trust category as the model weights
      // below, which already come from Hugging Face's CDN.
      // ponytail: version is hand-pinned, not read from the installed
      // package — if @huggingface/transformers is ever upgraded, check
      // node_modules/onnxruntime-web/package.json's version and update this
      // to match, or the JS glue and the WASM binary could drift apart.
      env.backends.onnx.wasm!.wasmPaths =
        "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.31.0-dev.20260914-8d85527a0/dist/";
      const manifest = await loadManifest();
      return (await pipeline(
        "feature-extraction",
        manifest.model_id
      )) as unknown as FeatureExtractionPipeline;
    })();
    // A Promise is truthy whether it resolves or rejects — without this, a
    // transient failure (e.g. the model download drops) permanently wedges
    // every future upload in the tab behind the same stale rejection, since
    // `if (!pipelinePromise)` would never be true again. Clear it on
    // rejection so the next call retries from scratch.
    pipelinePromise.catch(() => {
      pipelinePromise = null;
    });
  }
  return pipelinePromise;
}

export async function embed(text: string): Promise<Float32Array> {
  const extractor = await getPipeline();
  const output = await extractor(text, { pooling: "mean", normalize: true });
  return output.data;
}
