"""Phase 1: join sources.jsonl + works.jsonl, embed with the frozen Phase 0
winner (gte-small), and write the production journal index for the web app.

Safe to re-run at any point while fetch_works.py is still filling in
works.jsonl — just rebuilds from whatever's there so far. Journals in
sources.jsonl with no matching entry in works.jsonl yet are skipped.

Usage: uv run build_index.py
Writes: web/public/index/{manifest.json, index.bin, meta.json}
"""

import json
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from sentence_transformers import SentenceTransformer

DATA_DIR = Path(__file__).parent / "data"
OUT_DIR = Path(__file__).parent.parent / "web" / "public" / "index"

PY_MODEL_NAME = "thenlper/gte-small"  # Phase 0 bake-off winner — frozen
BROWSER_MODEL_ID = "Xenova/gte-small"  # same weights, ONNX export
BUILD_SIZE = 100


def load_sources() -> dict[str, dict]:
    sources = {}
    with (DATA_DIR / "sources.jsonl").open() as f:
        for line in f:
            j = json.loads(line)
            sources[j["id"]] = j
    return sources


def load_works() -> dict[str, list[dict]]:
    works = {}
    with (DATA_DIR / "works.jsonl").open() as f:
        for line in f:
            j = json.loads(line)
            works[j["id"]] = j["papers"]
    return works


def top_field(topics: list[dict]) -> str | None:
    if not topics:
        return None
    return topics[0].get("field", {}).get("display_name")


def normalize(vecs: np.ndarray) -> np.ndarray:
    norms = np.linalg.norm(vecs, axis=-1, keepdims=True)
    return vecs / np.clip(norms, 1e-9, None)


def quantize_int8(unit_vecs: np.ndarray) -> np.ndarray:
    return np.clip(np.round(unit_vecs * 127), -127, 127).astype(np.int8)


def main() -> None:
    sources = load_sources()
    works = load_works()
    joined_ids = [sid for sid in sources if sid in works]
    print(f"{len(sources)} sources, {len(works)} with papers fetched, {len(joined_ids)} joined")
    if len(joined_ids) < 10:
        print("too few journals joined yet — let fetch_works.py run longer")
        return

    model = SentenceTransformer(PY_MODEL_NAME)
    dim = model.get_embedding_dimension()
    centroids = np.zeros((len(joined_ids), dim), dtype=np.float32)
    meta = []

    all_texts, boundaries = [], []
    for sid in joined_ids:
        papers = works[sid][:BUILD_SIZE]
        boundaries.append(len(papers))
        all_texts.extend(f"{p['title']}\n\n{p['abstract']}" for p in papers)

    print(f"embedding {len(all_texts)} papers...")
    all_vecs = normalize(model.encode(all_texts, batch_size=64, show_progress_bar=True))

    i = 0
    for row, (sid, n) in enumerate(zip(joined_ids, boundaries)):
        centroids[row] = normalize(all_vecs[i : i + n].mean(axis=0, keepdims=True))[0]
        i += n
        s = sources[sid]
        meta.append(
            {
                "id": sid,
                "display_name": s["display_name"],
                "issn_l": s.get("issn_l"),
                "field": top_field(s.get("topics", [])),
                "is_in_doaj": s.get("is_in_doaj", False),
                "apc_usd": s.get("apc_usd"),
                "country_code": s.get("country_code"),
            }
        )

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    quantize_int8(centroids).tofile(OUT_DIR / "index.bin")
    (OUT_DIR / "meta.json").write_text(json.dumps(meta))
    manifest = {
        "model_id": BROWSER_MODEL_ID,
        "dim": dim,
        "journal_count": len(joined_ids),
        "built_at": datetime.now(timezone.utc).isoformat(),
        "note": f"Production index (partial while fetch_works.py runs): {len(joined_ids)}/{len(sources)} journals",
    }
    (OUT_DIR / "manifest.json").write_text(json.dumps(manifest))
    print(f"wrote {len(joined_ids)} journals, dim={dim} to {OUT_DIR}")


def _self_check() -> None:
    assert top_field([{"field": {"display_name": "Biology"}}]) == "Biology"
    assert top_field([]) is None
    assert top_field([{}]) is None
    print("build_index self-check: OK")


if __name__ == "__main__":
    import sys

    if len(sys.argv) > 1 and sys.argv[1] == "--self-check":
        _self_check()
    else:
        main()
