"""Multi-centre journals: a broad journal (a general medicine title, a
multidisciplinary one) is several clusters of papers, and one averaged
vector sits between them and matches none well. Each journal gets 1-4
centres by k-means over its papers' unit vectors (cosine geometry). numpy
only — no new dependency.
"""

import numpy as np

from embedding import normalize

PAPERS_PER_CENTRE = 40
MAX_CENTRES = 4
MIN_MEMBERS = 8


def choose_k(n: int) -> int:
    return 1 if n < PAPERS_PER_CENTRE else min(MAX_CENTRES, n // PAPERS_PER_CENTRE)


def kmeans(vecs: np.ndarray, k: int, seed: int = 0, iters: int = 25) -> tuple[np.ndarray, np.ndarray]:
    """Spherical k-means with k-means++ seeding. Returns (unit centres [k, d], labels [n])."""
    n = len(vecs)
    k = max(1, min(k, n))
    rng = np.random.default_rng(seed)
    centres = [vecs[rng.integers(n)]]
    for _ in range(1, k):
        # distance = 1 - max cosine to any chosen centre
        dist = 1 - np.max(vecs @ np.array(centres).T, axis=1)
        dist = np.clip(dist, 0, None)
        total = dist.sum()
        centres.append(vecs[rng.integers(n)] if total <= 1e-12 else vecs[rng.choice(n, p=dist / total)])
    c = np.array(centres, dtype=np.float32)
    labels = np.zeros(n, dtype=np.int64)
    for _ in range(iters):
        sims = vecs @ c.T
        new = np.argmax(sims, axis=1)
        for j in range(k):
            members = vecs[new == j]
            if len(members) == 0:
                # empty cluster → re-seed at the point worst served by its centre
                worst = int(np.argmin(sims[np.arange(n), new]))
                c[j] = vecs[worst]
                new[worst] = j
            else:
                c[j] = normalize(members.mean(axis=0, keepdims=True))[0]
        if np.array_equal(new, labels):
            break
        labels = new
    return c, labels


def cluster_journal(vecs: np.ndarray, min_members: int = MIN_MEMBERS, seed: int = 0) -> tuple[np.ndarray, np.ndarray]:
    """choose_k, then fold clusters with < min_members papers into their nearest
    neighbour (a small cluster is noise, not a scope) and re-normalize."""
    centres, labels = kmeans(vecs, choose_k(len(vecs)), seed=seed)
    while len(centres) > 1:
        counts = np.bincount(labels, minlength=len(centres))
        small = int(np.argmin(counts))
        if counts[small] >= min_members:
            break
        keep = [j for j in range(len(centres)) if j != small]
        # members of the small cluster move to their best remaining centre
        sims = vecs @ centres[keep].T
        remap = {old: new for new, old in enumerate(keep)}
        labels = np.array([remap[lab] if lab != small else int(np.argmax(sims[i])) for i, lab in enumerate(labels)])
        centres = np.array([normalize(vecs[labels == j].mean(axis=0, keepdims=True))[0] for j in range(len(keep))], dtype=np.float32)
    return centres, labels


def _blobs(seed: int, sizes: list[int], dim: int = 16) -> np.ndarray:
    rng = np.random.default_rng(seed)
    parts = []
    for i, n in enumerate(sizes):
        centre = np.zeros(dim)
        centre[i] = 1.0
        parts.append(normalize(centre + rng.normal(0, 0.05, (n, dim))))
    return np.vstack(parts).astype(np.float32)


def _self_check() -> None:
    assert choose_k(10) == 1 and choose_k(39) == 1 and choose_k(80) == 2 and choose_k(200) == 4
    two = _blobs(1, [50, 50])
    c, labels = kmeans(two, 2)
    assert sorted(np.bincount(labels).tolist()) == [50, 50], "two separated blobs recovered"
    for j in range(2):
        assert float((two[labels == j] @ c[j]).mean()) > 0.95
    same = normalize(np.ones((10, 8), dtype=np.float32))
    c1, l1 = cluster_journal(same)
    assert len(c1) == 1 and set(l1.tolist()) == {0}, "identical papers: one centre, no crash"
    lopsided = _blobs(2, [95, 5])  # choose_k(100) = 2, but one cluster has 5 < 8 members
    c2, l2 = cluster_journal(lopsided)
    assert len(c2) == 1 and len(l2) == 100, "a tiny cluster folds into the rest"
    four = _blobs(3, [60, 60, 60, 60])
    c4, _ = cluster_journal(four)
    assert len(c4) == 4
    assert np.allclose(np.linalg.norm(c4, axis=1), 1, atol=1e-5)
    print("kmeans self-check: OK")
