"""Interim demo index — NOT the Phase 0 bake-off result.

Builds a small real index from whatever fetch_sample.py has collected so far,
using a single fixed model (no bake-off), so the web app has something real
to match against today. Replaced once bakeoff.py + quantize_check.py finish
and pick the winning model.

Usage: uv run phase0/build_demo_index.py
Writes: web/public/index/{manifest.json, index.bin, meta.json}
"""

import json
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from sentence_transformers import SentenceTransformer

RAW_PATH = Path(__file__).parent.parent / "data" / "phase0_raw.jsonl"
OUT_DIR = Path(__file__).parent.parent.parent / "web" / "public" / "index"
PY_MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"  # what sentence-transformers loads
BROWSER_MODEL_ID = "Xenova/all-MiniLM-L6-v2"  # same weights, ONNX export transformers.js loads
BUILD_SIZE = 100


def normalize(vecs: np.ndarray) -> np.ndarray:
    norms = np.linalg.norm(vecs, axis=-1, keepdims=True)
    return vecs / np.clip(norms, 1e-9, None)


def quantize_int8(unit_vecs: np.ndarray) -> np.ndarray:
    return np.clip(np.round(unit_vecs * 127), -127, 127).astype(np.int8)


def main() -> None:
    journals = []
    with RAW_PATH.open() as f:
        for line in f:
            j = json.loads(line)
            if len(j["papers"]) >= 10:  # interim: low bar, just needs to demo
                journals.append(j)
    print(f"building interim demo index from {len(journals)} journals")

    model = SentenceTransformer(PY_MODEL_NAME)
    centroids = np.zeros((len(journals), model.get_embedding_dimension()), dtype=np.float32)
    for i, j in enumerate(journals):
        texts = [f"{p['title']}\n\n{p['abstract']}" for p in j["papers"][:BUILD_SIZE]]
        vecs = normalize(model.encode(texts, batch_size=64, show_progress_bar=False))
        centroids[i] = normalize(vecs.mean(axis=0, keepdims=True))[0]

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    quantize_int8(centroids).tofile(OUT_DIR / "index.bin")
    meta = [{"id": j["id"], "display_name": j["display_name"]} for j in journals]
    (OUT_DIR / "meta.json").write_text(json.dumps(meta))
    manifest = {
        "model_id": BROWSER_MODEL_ID,
        "dim": int(centroids.shape[1]),
        "journal_count": len(journals),
        "built_at": datetime.now(timezone.utc).isoformat(),
        "note": "INTERIM demo index, not the Phase 0 bake-off winner",
    }
    (OUT_DIR / "manifest.json").write_text(json.dumps(manifest))
    print(f"wrote {len(journals)} journals, dim={centroids.shape[1]} to {OUT_DIR}")


if __name__ == "__main__":
    main()
