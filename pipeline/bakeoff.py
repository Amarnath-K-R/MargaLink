"""Matching v2: which small embedding model matches papers to journals best?
Compares the candidates in embedding.py on a seeded sample of journals, with
the same held-out split build_index.py uses and a plain mean-vector ranker
(the models are compared, not the ranker). Decision rule (design decision 3):
switch from the current model only for >= 5 points of top-10 accuracy.

Usage: uv run bakeoff.py [--journals 3000]   (~30 min per model on MPS)
Output: printed table + data/bakeoff.json
"""

import json
import random
import sys
from pathlib import Path

import numpy as np

import embedding
from build_index import load_works, paper_text, split_papers, works_path

DATA = Path(__file__).parent / "data"
INDEX_PER_JOURNAL = 60  # enough for a mean vector; keeps each model to ~30 min
HELDOUT_PER_JOURNAL = 5


def top_k_hits(centroids: np.ndarray, queries: np.ndarray, truth: np.ndarray, ks=(1, 5, 10)) -> dict[int, float]:
    sims = queries @ centroids.T
    order = np.argsort(-sims, axis=1)
    rank = np.argmax(order == truth[:, None], axis=1)
    return {k: float(np.mean(rank < k)) for k in ks}


def main() -> None:
    n = int(sys.argv[sys.argv.index("--journals") + 1]) if "--journals" in sys.argv else 3000
    works = load_works(works_path())
    ids = sorted(random.Random(7).sample(sorted(works), min(n, len(works))))
    splits = [split_papers(works[j]) for j in ids]
    keep = [i for i, (idx, held) in enumerate(splits) if held and len(idx) >= 10]
    index_texts, bounds, held_texts, truth = [], [], [], []
    for row, i in enumerate(keep):
        idx, held = splits[i]
        idx = idx[:INDEX_PER_JOURNAL]
        bounds.append(len(idx))
        index_texts += [paper_text(p) for p in idx]
        for p in held[:HELDOUT_PER_JOURNAL]:
            held_texts.append(paper_text(p))
            truth.append(row)
    truth_arr = np.array(truth)
    print(f"{len(keep)} journals, {len(index_texts)} index papers, {len(held_texts)} held-out", flush=True)

    results = {}
    for name in embedding.CANDIDATES:
        model = embedding.load_model(name)
        vecs = embedding.embed_texts(model, index_texts, "passage", name=name)
        cents, at = [], 0
        for b in bounds:
            cents.append(embedding.normalize(vecs[at : at + b].mean(axis=0, keepdims=True))[0])
            at += b
        centroids = np.array(cents)
        queries = embedding.embed_texts(model, held_texts, "query", name=name)
        # int8, as shipped
        hits = top_k_hits(embedding.quantize_int8(centroids).astype(np.float32), embedding.quantize_int8(queries).astype(np.float32), truth_arr)
        results[name] = {"dim": int(vecs.shape[1]), **{f"top{k}": v for k, v in hits.items()}}
        print(f"{name:32} dim={vecs.shape[1]}  top1={hits[1]:.3f}  top5={hits[5]:.3f}  top10={hits[10]:.3f}", flush=True)

    current = results[embedding.MODEL_NAME]["top10"]
    best = max(results, key=lambda m: results[m]["top10"])
    verdict = best if best != embedding.MODEL_NAME and results[best]["top10"] - current >= 0.05 else embedding.MODEL_NAME
    (DATA / "bakeoff.json").write_text(json.dumps({"journals": len(keep), "heldout": len(held_texts), "results": results, "choice": verdict}, indent=2))
    print(f"choice (switch only for >= 5 points top-10): {verdict}", flush=True)


def _self_check() -> None:
    cents = np.eye(3, dtype=np.float32)
    queries = np.array([[1, 0, 0], [0, 0.9, 0.1], [0.6, 0.5, 0]], dtype=np.float32)
    hits = top_k_hits(cents, queries, np.array([0, 1, 1]), ks=(1, 2))
    assert hits[1] == 2 / 3 and hits[2] == 1.0, hits
    print("bakeoff self-check: OK")


if __name__ == "__main__":
    main()
