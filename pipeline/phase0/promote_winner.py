"""Promote the bake-off winner into the web app's demo index.

Reuses the centroids bakeoff.py already computed (no re-embedding) — just
reproduces the same journal ordering (same seed, same input file, so the
shuffle is identical) to pair each centroid row with its journal id/name.

Usage: uv run phase0/promote_winner.py
Requires: pipeline/data/phase0_winner.npz (from bakeoff.py)
Writes: web/public/index/{manifest.json, index.bin, meta.json}
"""

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

from bakeoff import BUILD_SIZE, WINNER_PATH, load_journals

sys.path.insert(0, str(Path(__file__).parent.parent))
from enrichment import build_meta_entry, load_doaj, load_nlm, load_sources  # noqa: E402

OUT_DIR = Path(__file__).parent.parent.parent / "web" / "public" / "index"

# Python model id (sentence-transformers) -> browser model id (transformers.js ONNX export)
BROWSER_MODEL_ID = {
    "sentence-transformers/all-MiniLM-L6-v2": "Xenova/all-MiniLM-L6-v2",
    "BAAI/bge-small-en-v1.5": "Xenova/bge-small-en-v1.5",
    "thenlper/gte-small": "Xenova/gte-small",
}


def quantize_int8(unit_vecs: np.ndarray) -> np.ndarray:
    return np.clip(np.round(unit_vecs * 127), -127, 127).astype(np.int8)


def reproduce_journal_order() -> list[dict]:
    """Same seed + same input file as bakeoff.split_build_heldout => same shuffle."""
    import random

    from bakeoff import SEED

    journals = load_journals()
    rng = random.Random(SEED)
    order = journals[:]
    rng.shuffle(order)
    return order


def main() -> None:
    data = np.load(WINNER_PATH, allow_pickle=True)
    model_name = str(data["model_name"])
    centroids = data["centroids"]

    order = reproduce_journal_order()
    if len(order) != centroids.shape[0]:
        raise RuntimeError(
            f"journal order length {len(order)} != centroids rows {centroids.shape[0]} — "
            "phase0_raw.jsonl must have changed since bakeoff.py ran; re-run bakeoff.py first"
        )

    browser_model_id = BROWSER_MODEL_ID.get(model_name)
    if not browser_model_id:
        raise RuntimeError(f"no browser model id mapping for {model_name}")

    sources, doaj, nlm = load_sources(), load_doaj(), load_nlm()
    matched = sum(1 for j in order if j["id"] in sources)
    print(f"real metadata available for {matched}/{len(order)} journals (from sources.jsonl)")
    print(f"doaj enrichment: {sum(1 for j in order if j['id'] in doaj)}/{len(order)}")
    print(f"nlm enrichment: {sum(1 for j in order if j['id'] in nlm)}/{len(order)}")

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    quantize_int8(centroids).tofile(OUT_DIR / "index.bin")
    meta = [build_meta_entry(j["id"], j["display_name"], sources, doaj, nlm) for j in order]
    (OUT_DIR / "meta.json").write_text(json.dumps(meta))
    manifest = {
        "model_id": browser_model_id,
        "dim": int(centroids.shape[1]),
        "journal_count": len(order),
        "built_at": datetime.now(timezone.utc).isoformat(),
        "note": f"Phase 0 bake-off winner: {model_name}, built from {BUILD_SIZE} papers/journal",
    }
    (OUT_DIR / "manifest.json").write_text(json.dumps(manifest))
    print(f"promoted {model_name} ({browser_model_id}): {len(order)} journals, dim={centroids.shape[1]}")


if __name__ == "__main__":
    main()
