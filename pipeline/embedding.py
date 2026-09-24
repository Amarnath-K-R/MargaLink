"""The one place that names the embedding model. Journal centres, the topic
table, held-out papers and (via manifest.json) the browser's query vector
must all come from the same model — so everything reads it from here, and
build_index.py writes BROWSER_MODEL_ID and QUERY_PREFIX into the manifest.

Changed only by bakeoff.py's result, within the small-model cap (384-dim,
~33 MB in the browser): see docs/superpowers/specs/2026-09-24-matching-v2-design.md.
"""

from pathlib import Path

import numpy as np

# name → (browser ONNX id, query prefix, passage prefix). e5 was trained with
# "query: " / "passage: " and needs them on both sides; the others use none.
CANDIDATES: dict[str, tuple[str, str, str]] = {
    "thenlper/gte-small": ("Xenova/gte-small", "", ""),
    "BAAI/bge-small-en-v1.5": ("Xenova/bge-small-en-v1.5", "", ""),
    "intfloat/e5-small-v2": ("Xenova/e5-small-v2", "query: ", "passage: "),
}
MODEL_NAME = "thenlper/gte-small"
BROWSER_MODEL_ID, QUERY_PREFIX, PASSAGE_PREFIX = CANDIDATES[MODEL_NAME]

# A handful of fetched "abstracts" are tens of thousands of characters
# (mis-scraped full text). Past a 512-token window nothing changes the
# embedding, and one outlier in a batch drags the whole batch's attention cost
# up ~50x on MPS (measured) — so inputs are capped.
MAX_CHARS = 2000


def load_model(name: str = MODEL_NAME):
    from sentence_transformers import SentenceTransformer

    return SentenceTransformer(name)


def prefix_for(name: str, kind: str) -> str:
    _, query, passage = CANDIDATES[name]
    return query if kind == "query" else passage


def embed_texts(model, texts: list[str], kind: str, name: str = MODEL_NAME, batch_size: int = 64, progress: bool = True) -> np.ndarray:
    """Normalized float32 vectors; `kind` is "query" (a paper asking for a journal) or
    "passage" (the papers and topics being matched against)."""
    prefix = prefix_for(name, kind)
    capped = [prefix + t[:MAX_CHARS] for t in texts]
    return normalize(model.encode(capped, batch_size=batch_size, show_progress_bar=progress).astype(np.float32))


def normalize(vecs: np.ndarray) -> np.ndarray:
    norms = np.linalg.norm(vecs, axis=-1, keepdims=True)
    return vecs / np.clip(norms, 1e-9, None)


def quantize_int8(unit_vecs: np.ndarray) -> np.ndarray:
    return np.clip(np.round(unit_vecs * 127), -127, 127).astype(np.int8)


def _model_cached(name: str) -> bool:
    hub = Path.home() / ".cache" / "huggingface" / "hub"
    return (hub / f"models--{name.replace('/', '--')}").exists()


def _self_check() -> None:
    v = normalize(np.array([[3.0, 4.0], [0.0, 0.0]]))
    assert np.allclose(v[0], [0.6, 0.8]) and np.allclose(v[1], [0, 0]), "zero vector stays finite"
    assert quantize_int8(np.array([1.0, -1.0, 0.5])).tolist() == [127, -127, 64]
    assert prefix_for("intfloat/e5-small-v2", "query") == "query: " and prefix_for("thenlper/gte-small", "passage") == ""
    assert BROWSER_MODEL_ID.startswith("Xenova/")
    # The model itself is only exercised when already cached: CI must not download it.
    if _model_cached(MODEL_NAME):
        m = load_model()
        a, b, c = embed_texts(m, ["heart failure readmission", "hospital readmission after cardiac failure", "sediment transport in rivers"], "passage", progress=False)
        assert float(a @ b) > float(a @ c), "related texts are closer"
    else:
        print("embedding: model not cached, skipping the encode check")
    print("embedding self-check: OK")
