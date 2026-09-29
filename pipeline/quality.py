"""Index hygiene: some OpenAlex sources carry papers that aren't theirs (a
Japanese entomology society's record returned Vygotsky and an SPSS textbook).
A journal whose papers don't hang together, or whose papers both miss its
own topic profile and scatter across fields, is dropped and written to
data/dropped.txt for a human to look over.

Why both, for the field test: OpenAlex's journal-level topics are often
wrong for old or broad journals (The Lancet's top topic is "Human auditory
perception", in Engineering), so disagreeing with them alone dropped The
Lancet, NEJM, JAMA, Nature and Science. Papers that mostly share one field
are a real journal with a bad label; papers that miss the label and share
nothing are the junk this is for.
"""

from collections import Counter

import numpy as np

# gte-small's cosines are compressed: in the full v2 build (19,078
# journals) coherence ran from 0.858 (Cureus) with p1 0.874 and p50 0.906,
# and the lowest were broad journals (Cureus, Heliyon, PLoS ONE, Science),
# not junk. So the floor sits just below all of them: it catches only a
# journal far outside anything real, and the field test does the rest.
COHERENCE_FLOOR = 0.85
OVERLAP_FLOOR = 0.2  # papers' field mix vs the source's own (1.0 = the same mix)
SCATTERED = 0.5  # below this, no single field holds most of the papers


def coherence(vecs: np.ndarray, centres: np.ndarray, labels: np.ndarray) -> float:
    """Mean cosine of each paper to its own centre (1.0 = all identical)."""
    return float(np.mean(np.sum(vecs * centres[labels], axis=1)))


def field_fit(source_topics: list[dict], paper_topics: list[list[str]], topic_field: dict[str, str]) -> tuple[float, float] | None:
    """(overlap, dominant): how much the papers' primary-topic fields overlap
    the source's own count-weighted topic fields (sum of the smaller share per
    field), and the largest single field's share among the papers. None when
    it can't be judged (no source topics, no topic-tagged papers)."""
    src = Counter()
    for t in source_topics:
        f = (t.get("field") or {}).get("display_name")
        if f:
            src[f] += t.get("count") or 0
    fields = [topic_field.get(t[0]) for t in paper_topics if t]
    papers = Counter(f for f in fields if f)
    total, n = sum(src.values()), sum(papers.values())
    if not total or not n:
        return None
    overlap = sum(min(c / n, src[f] / total) for f, c in papers.items())
    return overlap, papers.most_common(1)[0][1] / n


def is_suspect(coh: float, fit: tuple[float, float] | None) -> str | None:
    """The reason to drop, or None."""
    if coh < COHERENCE_FLOOR:
        return f"papers don't cohere ({coh:.2f})"
    if fit is not None and fit[0] < OVERLAP_FLOOR and fit[1] < SCATTERED:
        return f"papers miss the journal's topics ({fit[0]:.0%} overlap) and share no field ({fit[1]:.0%} at most)"
    return None


def top_topics(paper_topics: list[list[str]], n: int = 8) -> list[tuple[str, float]]:
    """Primary-topic shares among a journal's papers, descending."""
    primary = [t[0] for t in paper_topics if t]
    if not primary:
        return []
    counts = Counter(primary).most_common(n)
    return [(tid, round(c / len(primary), 4)) for tid, c in counts]


def _self_check() -> None:
    same = np.ones((5, 4), dtype=np.float32) / 2
    assert abs(coherence(same, same[:1], np.zeros(5, dtype=int)) - 1.0) < 1e-6
    tf = {"T1": "Medicine", "T2": "Medicine", "T3": "Physics", "T4": "Psychology", "T5": "Mathematics", "T6": "Agriculture", "T7": "Engineering"}
    src = lambda *fc: [{"field": {"display_name": f}, "count": c} for f, c in fc]
    # the papers' field mix against the source's own count-weighted one, and how scattered the papers are
    fit = field_fit(src(("Medicine", 3), ("Physics", 1)), [["T1"], ["T2", "T3"], ["T3"], []], tf)
    assert fit is not None and abs(fit[0] - (0.66667 + 0.25)) < 1e-3 and abs(fit[1] - 2 / 3) < 1e-6
    assert field_fit([], [["T1"]], tf) is None and field_fit(src(("Medicine", 1)), [[]], tf) is None
    # a mislabelled source whose papers agree with each other stays (The Lancet: OpenAlex's top topic is Engineering)
    lancet = field_fit(src(("Engineering", 18), ("Economics", 14), ("Medicine", 1)), [["T1"]] * 9 + [["T3"]], tf)
    assert is_suspect(0.9, lancet) is None
    # papers that belong elsewhere and don't hang together go (an entomology record holding Vygotsky and an SPSS manual)
    junk = field_fit(src(("Agriculture", 50), ("Medicine", 5)), [["T4"], ["T5"], ["T1"], ["T7"], ["T3"]], tf)
    assert is_suspect(0.9, junk)
    # a broad journal whose papers are broad like its profile stays
    broad = field_fit(src(("Medicine", 3), ("Physics", 3), ("Psychology", 3)), [["T1"], ["T3"], ["T4"], ["T5"]], tf)
    assert is_suspect(0.9, broad) is None
    assert is_suspect(0.3, None) and is_suspect(0.9, None) is None
    tops = top_topics([["T1"], ["T1", "T2"], ["T2"], ["T3"]], 2)
    assert tops == [("T1", 0.5), ("T2", 0.25)] and top_topics([]) == []
    print("quality self-check: OK")
