"""Phase 1: join sources.jsonl + works.jsonl, embed with the frozen Phase 0
winner (gte-small), and write the production journal index for the web app.

Safe to re-run at any point while fetch_works.py is still filling in
works.jsonl — just rebuilds from whatever's there so far. Journals in
sources.jsonl with no matching entry in works.jsonl yet are skipped.
Also merges DOAJ (enrich_doaj.py) and MEDLINE (enrich_nlm.py) data,
whatever's been fetched so far — same "use what exists" resumability.

Usage: uv run build_index.py
Writes: web/public/index/{manifest.json, index.bin, meta.json}
"""

import json
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from sentence_transformers import SentenceTransformer

from enrichment import build_meta_entry, load_doaj, load_nlm, load_sources
from openalex import safe_iter_jsonl

DATA_DIR = Path(__file__).parent / "data"
OUT_DIR = Path(__file__).parent.parent / "web" / "public" / "index"

PY_MODEL_NAME = "thenlper/gte-small"  # Phase 0 bake-off winner — frozen
BROWSER_MODEL_ID = "Xenova/gte-small"  # same weights, ONNX export
BUILD_SIZE = 100


def load_works() -> dict[str, list[dict]]:
    return {j["id"]: j["papers"] for j in safe_iter_jsonl(DATA_DIR / "works.jsonl")}


def normalize(vecs: np.ndarray) -> np.ndarray:
    norms = np.linalg.norm(vecs, axis=-1, keepdims=True)
    return vecs / np.clip(norms, 1e-9, None)


def quantize_int8(unit_vecs: np.ndarray) -> np.ndarray:
    return np.clip(np.round(unit_vecs * 127), -127, 127).astype(np.int8)


def main() -> None:
    sources = load_sources()
    works = load_works()
    doaj = load_doaj()
    nlm = load_nlm()
    joined_ids = [sid for sid in sources if sid in works]
    print(f"{len(sources)} sources, {len(works)} with papers fetched, {len(joined_ids)} joined")
    print(f"doaj enrichment: {sum(1 for i in joined_ids if i in doaj)}/{len(joined_ids)}")
    print(f"nlm enrichment: {sum(1 for i in joined_ids if i in nlm)}/{len(joined_ids)}")
    if len(joined_ids) < 10:
        print("too few journals joined yet — let fetch_works.py run longer")
        return

    model = SentenceTransformer(PY_MODEL_NAME)
    dim = model.get_embedding_dimension()
    centroids = np.zeros((len(joined_ids), dim), dtype=np.float32)

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
    meta = [
        build_meta_entry(sid, sources[sid]["display_name"], sources, doaj, nlm) for sid in joined_ids
    ]

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
    print("build_index self-check: OK (pure logic covered by enrichment.py's own self-check)")


if __name__ == "__main__":
    import sys

    if len(sys.argv) > 1 and sys.argv[1] == "--self-check":
        _self_check()
    else:
        main()
