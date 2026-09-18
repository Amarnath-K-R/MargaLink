"""Phase 0 spike: does int8-quantizing the winning model's vectors hurt ranking?

Validates the plan's decision to ship the journal index to the browser as int8
(7.7 MB for 20k journals) instead of fp32 (31 MB), before that decision is load-bearing.

Usage: uv run phase0/quantize_check.py
Requires: pipeline/data/phase0_winner.npz (from bakeoff.py)
"""

from pathlib import Path

import numpy as np

WINNER_PATH = Path(__file__).parent.parent / "data" / "phase0_winner.npz"


def quantize_int8(unit_vecs: np.ndarray) -> np.ndarray:
    """Vectors are already unit-length; scale to int8 range and round."""
    return np.clip(np.round(unit_vecs * 127), -127, 127).astype(np.int8)


def int8_cosine_sim(a: np.ndarray, b: np.ndarray) -> np.ndarray:
    """Dot product of int8 vectors, upcast to avoid overflow (127*127*384 fits in int32)."""
    return a.astype(np.int32) @ b.astype(np.int32).T


def evaluate(sims: np.ndarray, true_idxs: np.ndarray) -> dict:
    ranks = (-sims).argsort(axis=1)
    hit5 = (ranks[:, :5] == true_idxs[:, None]).any(axis=1).mean()
    hit10 = (ranks[:, :10] == true_idxs[:, None]).any(axis=1).mean()
    return {"top5": float(hit5), "top10": float(hit10)}


def main() -> None:
    data = np.load(WINNER_PATH, allow_pickle=True)
    model_name = str(data["model_name"])
    centroids = data["centroids"]
    heldout_vecs = data["heldout_vecs"]
    true_idxs = data["true_idxs"]
    print(f"model: {model_name}, {centroids.shape[0]} journals, {heldout_vecs.shape[0]} held-out papers")

    fp32_sims = heldout_vecs @ centroids.T
    fp32_metrics = evaluate(fp32_sims, true_idxs)
    print(f"fp32:  top5={fp32_metrics['top5']:.3f}  top10={fp32_metrics['top10']:.3f}")

    centroids_i8 = quantize_int8(centroids)
    heldout_i8 = quantize_int8(heldout_vecs)
    int8_sims = int8_cosine_sim(heldout_i8, centroids_i8)
    int8_metrics = evaluate(int8_sims, true_idxs)
    print(f"int8:  top5={int8_metrics['top5']:.3f}  top10={int8_metrics['top10']:.3f}")

    delta5 = int8_metrics["top5"] - fp32_metrics["top5"]
    delta10 = int8_metrics["top10"] - fp32_metrics["top10"]
    print(f"\ndelta: top5={delta5:+.3f}  top10={delta10:+.3f}")
    if delta10 < -0.03:
        print("GATE: int8 quantization costs more than 3pp of top10 accuracy — reconsider before shipping fp16/fp32 instead.")
    else:
        print("GATE PASSED: int8 quantization loss is negligible, safe to ship to the browser.")


def _self_check() -> None:
    """Round-trip and ranking-invariance check on a tiny synthetic example."""
    rng = np.random.default_rng(0)
    vecs = rng.normal(size=(5, 8)).astype(np.float32)
    vecs /= np.linalg.norm(vecs, axis=1, keepdims=True)
    q = quantize_int8(vecs)
    assert q.dtype == np.int8
    assert (q >= -127).all() and (q <= 127).all()
    # a vector dotted with itself should still rank itself first after quantization
    sims = int8_cosine_sim(q, q)
    assert sims.argmax(axis=1).tolist() == list(range(5))
    print("quantize_check self-check: OK")


if __name__ == "__main__":
    import sys

    if len(sys.argv) > 1 and sys.argv[1] == "--self-check":
        _self_check()
    else:
        main()
