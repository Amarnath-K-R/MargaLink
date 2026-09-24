"""Index hygiene: some OpenAlex sources carry papers that aren't theirs (a
Japanese entomology society's record returned Vygotsky and an SPSS textbook).
A journal whose papers don't hang together, or don't match its own field,
is dropped and written to data/dropped.txt for a human to look over.
"""

from collections import Counter

import numpy as np

# Provisional: build_index.py prints the coherence distribution and the
# value is set from its low tail (Task 3 of the matching v2 plan).
COHERENCE_FLOOR = 0.55
AGREEMENT_FLOOR = 0.2


def coherence(vecs: np.ndarray, centres: np.ndarray, labels: np.ndarray) -> float:
    """Mean cosine of each paper to its own centre (1.0 = all identical)."""
    return float(np.mean(np.sum(vecs * centres[labels], axis=1)))


def field_agreement(source_field: str | None, paper_topics: list[list[str]], topic_field: dict[str, str]) -> float | None:
    """Share of papers whose primary topic's field equals the source's field;
    None when it can't be judged (no source field, no topic-tagged papers)."""
    fields = [topic_field.get(t[0]) for t in paper_topics if t]
    fields = [f for f in fields if f]
    if not source_field or not fields:
        return None
    return sum(f == source_field for f in fields) / len(fields)


def is_suspect(coh: float, agreement: float | None) -> str | None:
    """The reason to drop, or None."""
    if coh < COHERENCE_FLOOR:
        return f"papers don't cohere ({coh:.2f})"
    if agreement is not None and agreement < AGREEMENT_FLOOR:
        return f"papers rarely match the journal's field ({agreement:.0%})"
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
    tf = {"T1": "Medicine", "T2": "Medicine", "T3": "Physics"}
    assert field_agreement("Medicine", [["T1"], ["T2", "T3"], ["T3"], []], tf) == 2 / 3
    assert field_agreement(None, [["T1"]], tf) is None and field_agreement("Medicine", [[]], tf) is None
    assert is_suspect(0.3, None) and is_suspect(0.9, 0.1) and is_suspect(0.9, None) is None
    tops = top_topics([["T1"], ["T1", "T2"], ["T2"], ["T3"]], 2)
    assert tops == [("T1", 0.5), ("T2", 0.25)] and top_topics([]) == []
    print("quality self-check: OK")
