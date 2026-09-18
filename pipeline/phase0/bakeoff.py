"""Phase 0 spike: bake off 3 small embedding models on journal-centroid matching.

For each model: embed each journal's build papers, average into a centroid,
then rank held-out papers (from the same journals, not used in any centroid)
against all centroids and check whether the true journal lands in the top 5 / 10.

Usage: uv run phase0/bakeoff.py
Requires: pipeline/data/phase0_raw.jsonl (from fetch_sample.py)
Writes: pipeline/data/phase0_winner.npz (centroids, heldout vecs, labels, model name)
        for quantize_check.py to reuse without re-embedding.
"""

import json
import random
from pathlib import Path

import numpy as np
from sentence_transformers import SentenceTransformer

DATA_DIR = Path(__file__).parent.parent / "data"
RAW_PATH = DATA_DIR / "phase0_raw.jsonl"
WINNER_PATH = DATA_DIR / "phase0_winner.npz"

MODEL_NAMES = [
    "sentence-transformers/all-MiniLM-L6-v2",
    "BAAI/bge-small-en-v1.5",
    "thenlper/gte-small",
]
BUILD_SIZE = 100
HELDOUT_TARGET = 500
SEED = 42


def load_journals() -> list[dict]:
    journals = []
    with RAW_PATH.open() as f:
        for line in f:
            j = json.loads(line)
            if len(j["papers"]) >= BUILD_SIZE + 5:
                journals.append(j)
    return journals


def paper_text(p: dict) -> str:
    return f"{p['title']}\n\n{p['abstract']}"


def split_build_heldout(journals: list[dict]) -> tuple[list[list[str]], list[dict]]:
    """Per journal: first BUILD_SIZE papers (shuffled) build the centroid, a few
    more become held-out test papers labeled with their true journal index.

    Every journal in `journals` gets a centroid (so held-out papers always have
    the full candidate set to rank against); we just stop *adding held-out
    papers* once HELDOUT_TARGET is reached.
    """
    rng = random.Random(SEED)
    order = journals[:]
    rng.shuffle(order)

    build_sets: list[list[str]] = []
    heldout: list[dict] = []
    for journal_idx, j in enumerate(order):
        papers = j["papers"][:]
        rng.shuffle(papers)
        build_sets.append([paper_text(p) for p in papers[:BUILD_SIZE]])
        if len(heldout) < HELDOUT_TARGET:
            for p in papers[BUILD_SIZE : BUILD_SIZE + 5]:
                if len(heldout) >= HELDOUT_TARGET:
                    break
                heldout.append({"text": paper_text(p), "true_idx": journal_idx})
    return build_sets, heldout


def normalize(vecs: np.ndarray) -> np.ndarray:
    norms = np.linalg.norm(vecs, axis=-1, keepdims=True)
    return vecs / np.clip(norms, 1e-9, None)


def build_centroids(model: SentenceTransformer, build_sets: list[list[str]]) -> np.ndarray:
    all_texts = [t for group in build_sets for t in group]
    all_vecs = normalize(model.encode(all_texts, batch_size=64, show_progress_bar=False))
    centroids = np.zeros((len(build_sets), all_vecs.shape[1]), dtype=np.float32)
    i = 0
    for j, group in enumerate(build_sets):
        n = len(group)
        centroids[j] = normalize(all_vecs[i : i + n].mean(axis=0, keepdims=True))[0]
        i += n
    return centroids


def evaluate(centroids: np.ndarray, heldout_vecs: np.ndarray, true_idxs: np.ndarray) -> dict:
    sims = heldout_vecs @ centroids.T  # cosine, both sides normalized
    ranks = (-sims).argsort(axis=1)
    top5 = ranks[:, :5]
    top10 = ranks[:, :10]
    hit5 = (top5 == true_idxs[:, None]).any(axis=1).mean()
    hit10 = (top10 == true_idxs[:, None]).any(axis=1).mean()
    return {"top5": float(hit5), "top10": float(hit10)}


def main() -> None:
    journals = load_journals()
    print(f"loaded {len(journals)} journals with >= {BUILD_SIZE + 5} papers")
    if len(journals) < 50:
        print("too few journals for a meaningful bake-off yet — let fetch_sample.py run longer")
        return

    build_sets, heldout = split_build_heldout(journals)
    print(f"build set: {len(build_sets)} journals, held-out: {len(heldout)} papers")

    heldout_texts = [h["text"] for h in heldout]
    true_idxs = np.array([h["true_idx"] for h in heldout])

    results = {}
    best_name, best_top10 = None, -1.0
    best_arrays = None
    for name in MODEL_NAMES:
        print(f"\n--- {name} ---")
        model = SentenceTransformer(name)
        centroids = build_centroids(model, build_sets)
        heldout_vecs = normalize(model.encode(heldout_texts, batch_size=64, show_progress_bar=False))
        metrics = evaluate(centroids, heldout_vecs, true_idxs)
        results[name] = metrics
        print(f"top5={metrics['top5']:.3f}  top10={metrics['top10']:.3f}  dim={centroids.shape[1]}")
        if metrics["top10"] > best_top10:
            best_top10 = metrics["top10"]
            best_name = name
            best_arrays = (centroids, heldout_vecs, true_idxs)

    print("\n=== summary ===")
    for name, m in results.items():
        marker = " <-- winner" if name == best_name else ""
        print(f"{name:45s} top5={m['top5']:.3f}  top10={m['top10']:.3f}{marker}")

    if best_top10 < 0.5:
        print(
            "\nGATE: best top10 accuracy is below 0.5 — per plan, stop and reconsider "
            "the approach before building any UI. Not writing a winner file — "
            "a failing model must not get promoted into web/public/index by "
            "promote_winner.py just because the warning above scrolled by."
        )
        return
    print(f"\nGATE PASSED: {best_name} clears 0.5 top10 accuracy ({best_top10:.3f}).")

    centroids, heldout_vecs, true_idxs = best_arrays
    np.savez(
        WINNER_PATH,
        model_name=best_name,
        centroids=centroids,
        heldout_vecs=heldout_vecs,
        true_idxs=true_idxs,
    )
    print(f"saved winner arrays to {WINNER_PATH}")


if __name__ == "__main__":
    main()
