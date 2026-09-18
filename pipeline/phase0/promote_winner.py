"""Promote the bake-off winner into the web app's demo index.

Reuses the centroids bakeoff.py already computed (no re-embedding) — just
reproduces the same journal ordering (same seed, same input file, so the
shuffle is identical) to pair each centroid row with its journal id/name.

Usage: uv run phase0/promote_winner.py
Requires: pipeline/data/phase0_winner.npz (from bakeoff.py)
Writes: web/public/index/{manifest.json, index.bin, meta.json}
"""

import json
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

from bakeoff import BUILD_SIZE, WINNER_PATH, load_journals

OUT_DIR = Path(__file__).parent.parent.parent / "web" / "public" / "index"
SOURCES_PATH = Path(__file__).parent.parent / "data" / "sources.jsonl"

# Python model id (sentence-transformers) -> browser model id (transformers.js ONNX export)
BROWSER_MODEL_ID = {
    "sentence-transformers/all-MiniLM-L6-v2": "Xenova/all-MiniLM-L6-v2",
    "BAAI/bge-small-en-v1.5": "Xenova/bge-small-en-v1.5",
    "thenlper/gte-small": "Xenova/gte-small",
}


def quantize_int8(unit_vecs: np.ndarray) -> np.ndarray:
    return np.clip(np.round(unit_vecs * 127), -127, 127).astype(np.int8)


def top_field(topics: list[dict]) -> str | None:
    if not topics:
        return None
    return topics[0].get("field", {}).get("display_name")


def load_sources_by_id() -> dict[str, dict]:
    """Real OpenAlex metadata for journals also present in the ~20k Phase 1
    source list — not every demo journal will be in there (different filter
    passes), so lookups fall back to null fields, not fake data."""
    if not SOURCES_PATH.exists():
        return {}
    sources = {}
    with SOURCES_PATH.open() as f:
        for line in f:
            j = json.loads(line)
            sources[j["id"]] = j
    return sources


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

    sources = load_sources_by_id()
    matched = sum(1 for j in order if j["id"] in sources)
    print(f"real metadata available for {matched}/{len(order)} journals (from sources.jsonl)")

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    quantize_int8(centroids).tofile(OUT_DIR / "index.bin")
    meta = []
    for j in order:
        s = sources.get(j["id"])
        meta.append(
            {
                "id": j["id"],
                "display_name": j["display_name"],
                "field": top_field(s.get("topics", [])) if s else None,
                "is_in_doaj": s.get("is_in_doaj") if s else None,
                "apc_usd": s.get("apc_usd") if s else None,
                "country_code": s.get("country_code") if s else None,
            }
        )
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
