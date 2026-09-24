"""Matching v2: builds the production journal index for the web app from
sources.jsonl + works (v2 if present) + DOAJ/NLM enrichment + topics.

Per journal: the newest papers are held out for evaluation (never part of the
index), the rest are embedded and clustered into 1-4 centres; a topic profile,
centre labels and alternate names are stored for the browser's topic and
reference-list signals; journals whose papers don't cohere or don't match their
field are dropped (data/dropped.txt). The OpenAlex topic table is embedded once.

Usage:
  uv run build_index.py                  # full build (hours: ~110 papers/s on MPS)
  uv run build_index.py --journals 1500  # a seeded dev-sized sample
Writes web/public/index/{manifest.json, index.bin, meta.json, topics.bin, topics.json}
and pipeline/data/{heldout.bin, heldout.json, heldout_sample.json, drift_sample.json, dropped.txt}.

manifest.ranking stays null here: web/scripts/eval_match.ts fits and writes it,
so a rebuild can never publish stale accuracy.
"""

import hashlib
import json
import random
import sys
from collections import Counter
from datetime import UTC, datetime
from pathlib import Path

import numpy as np

import embedding
from enrichment import (
    build_meta_entry,
    is_conference_proceedings_name,
    load_doaj,
    load_nlm,
    load_sources,
)
from kmeans import cluster_journal
from openalex import safe_iter_jsonl
from quality import coherence, field_agreement, is_suspect, top_topics

DATA_DIR = Path(__file__).parent / "data"
OUT_DIR = Path(__file__).parent.parent / "web" / "public" / "index"

HELDOUT_MAX = 20
MIN_INDEX_PAPERS = 10
INDEX_CAP = 180
DRIFT_PAPERS = 10
REF_SAMPLE = 500

# Cloudflare Pages' free plan caps a deployment at 20,000 files total, which
# a dedicated static page per journal alone would consume at full scale.
# Only the top PRERENDER_LIMIT by output volume get a real, crawlable
# /journal/[id] page; the rest stay fully browsable via the client-side
# index on /journals, just without a dedicated URL of their own.
PRERENDER_LIMIT = 2000


def mark_prerendered(meta: list[dict], limit: int = PRERENDER_LIMIT) -> None:
    ranked = sorted(meta, key=lambda m: m["works_count"] or 0, reverse=True)
    prerendered_ids = {m["id"] for m in ranked[:limit]}
    for m in meta:
        m["prerendered"] = m["id"] in prerendered_ids


def works_path() -> Path:
    v2 = DATA_DIR / "works_v2.jsonl"
    return v2 if v2.exists() and v2.stat().st_size > 0 and "--v1" not in sys.argv else DATA_DIR / "works.jsonl"


def load_works(path: Path) -> dict[str, list[dict]]:
    return {j["id"]: j["papers"] for j in safe_iter_jsonl(path)}


def split_papers(papers: list[dict]) -> tuple[list[dict], list[dict]]:
    """(index, held-out). v2 papers are newest first, so the held-out set is the
    most recent — the fairest stand-in for a paper submitted today. A journal too
    small to spare any keeps all its papers in the index."""
    hold = min(HELDOUT_MAX, len(papers) // 4)
    if len(papers) - hold < MIN_INDEX_PAPERS:
        return papers[:INDEX_CAP], []
    return papers[hold : hold + INDEX_CAP], papers[:hold]


def paper_text(p: dict) -> str:
    return f"{p['title']}\n\n{p['abstract']}"


def source_topic_profile(source: dict, n: int = 8) -> list[tuple[str, float]]:
    """Fallback profile from the source record's own topic counts (v1 papers carry no topics)."""
    topics = [(t["id"].rsplit("/", 1)[-1], t.get("count") or 0) for t in source.get("topics") or []]
    total = sum(c for _, c in topics)
    if total <= 0:
        return []
    return [(tid, round(c / total, 4)) for tid, c in sorted(topics, key=lambda x: -x[1])[:n]]


def centre_labels(labels: np.ndarray, paper_topics: list[list[str]], k: int, topic_name: dict[str, str]) -> list[str]:
    out = []
    for j in range(k):
        primaries = [t[0] for t, lab in zip(paper_topics, labels) if lab == j and t]
        out.append(topic_name.get(Counter(primaries).most_common(1)[0][0], "") if primaries else "")
    return out


def int8_top10(query: np.ndarray, centres: np.ndarray, spans: list[tuple[int, int]]) -> list[int]:
    """The exact integer ranking web/src/lib/rank.ts computes for embedding-only
    weights: best centre per journal by int8 dot, score desc, journal index asc."""
    dots = centres.astype(np.int32) @ query.astype(np.int32)
    best = [int(dots[s : s + c].max()) for s, c in spans]
    return sorted(range(len(best)), key=lambda j: (-best[j], j))[:10]


def embed_cached(model, texts: list[str], kind: str, key: str) -> np.ndarray:
    """Paper vectors cached on disk (float16) by model + kind + content hash, so
    re-running the build to tune the quality pass doesn't re-embed millions."""
    digest = hashlib.sha1(("\x00".join(texts)).encode()).hexdigest()[:16]
    path = DATA_DIR / f"embcache_{embedding.MODEL_NAME.replace('/', '_')}_{kind}_{key}_{digest}.npy"
    if path.exists():
        print(f"using cached vectors {path.name}", flush=True)
        return np.load(path).astype(np.float32)
    vecs = embedding.embed_texts(model, texts, kind)
    np.save(path, vecs.astype(np.float16))
    return vecs


def main() -> None:
    sources = load_sources()
    wpath = works_path()
    works = load_works(wpath)
    doaj, nlm = load_doaj(), load_nlm()
    topics = list(safe_iter_jsonl(DATA_DIR / "topics.jsonl"))
    topic_name = {t["id"]: t["name"] for t in topics}
    topic_field = {t["id"]: t["field"] for t in topics}
    ids = [sid for sid in sources if sid in works and not is_conference_proceedings_name(sources[sid]["display_name"])]
    if "--journals" in sys.argv:
        n = int(sys.argv[sys.argv.index("--journals") + 1])
        ids = sorted(random.Random(1).sample(ids, min(n, len(ids))))
    print(f"{len(sources)} sources, {len(works)} with papers ({wpath.name}), {len(ids)} to build", flush=True)
    if len(ids) < 10:
        print("too few journals joined yet — let fetch_works.py run longer")
        return

    splits = {sid: split_papers(works[sid]) for sid in ids}
    ids = [sid for sid in ids if len(splits[sid][0]) >= MIN_INDEX_PAPERS]
    model = embedding.load_model()
    dim = model.get_embedding_dimension()
    key = f"{wpath.stem}_{len(ids)}"
    index_texts = [paper_text(p) for sid in ids for p in splits[sid][0]]
    heldout_texts = [paper_text(p) for sid in ids for p in splits[sid][1]]
    print(f"embedding {len(index_texts)} index papers + {len(heldout_texts)} held-out", flush=True)
    index_vecs = embed_cached(model, index_texts, "passage", key)
    heldout_vecs = embed_cached(model, heldout_texts, "query", key) if heldout_texts else np.zeros((0, dim), np.float32)

    centres_all, meta, spans, kept, dropped, cohs = [], [], [], [], [], []
    i = 0
    for sid in ids:
        papers = splits[sid][0]
        vecs = index_vecs[i : i + len(papers)]
        i += len(papers)
        centres, labels = cluster_journal(vecs)
        paper_topics = [p.get("topics") or [] for p in papers]
        coh = coherence(vecs, centres, labels)
        cohs.append(coh)
        entry = build_meta_entry(sid, sources[sid]["display_name"], sources, doaj, nlm)
        reason = is_suspect(coh, field_agreement(entry["field"], paper_topics, topic_field))
        if reason:
            dropped.append(f"{sources[sid]['display_name']}\t{sid}\t{reason}")
            continue
        entry["centres"] = [sum(len(c) for c in centres_all), len(centres)]
        entry["centre_topics"] = centre_labels(labels, paper_topics, len(centres), topic_name)
        entry["topics"] = top_topics(paper_topics) or source_topic_profile(sources[sid])
        spans.append((entry["centres"][0], len(centres)))
        centres_all.append(centres)
        meta.append(entry)
        kept.append(sid)
    q = np.percentile(cohs, [1, 5, 10, 50])
    print(f"coherence p1/p5/p10/p50: {q.round(3).tolist()}; dropped {len(dropped)}", flush=True)
    mark_prerendered(meta)

    centres_int8 = embedding.quantize_int8(np.vstack(centres_all))
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    centres_int8.tofile(OUT_DIR / "index.bin")
    (OUT_DIR / "meta.json").write_text(json.dumps(meta, separators=(",", ":")))

    topic_vecs = (
        embedding.embed_texts(model, [f"{t['name']}. {t['description']} Keywords: {', '.join(t['keywords'])}" for t in topics], "passage")
        if topics
        else np.zeros((0, dim), np.float32)
    )
    embedding.quantize_int8(topic_vecs).tofile(OUT_DIR / "topics.bin")
    rows = [{k: t[k] for k in ("id", "name", "subfield", "field", "domain")} for t in topics]
    (OUT_DIR / "topics.json").write_text(json.dumps(rows, separators=(",", ":")))

    # Held-out: only for journals that made it into the index, re-indexed to their row.
    row_of = {sid: r for r, sid in enumerate(kept)}
    h_papers, h_rows, h = [], [], 0
    for sid in ids:
        for p in splits[sid][1]:
            if sid in row_of:
                h_papers.append({"work": p.get("id"), "j": row_of[sid], "topics": p.get("topics") or [], "year": p.get("year")})
                h_rows.append(h)
            h += 1
    heldout_int8 = embedding.quantize_int8(heldout_vecs[h_rows]) if h_rows else np.zeros((0, dim), np.int8)
    heldout_int8.tofile(DATA_DIR / "heldout.bin")
    (DATA_DIR / "heldout.json").write_text(json.dumps({"model_id": embedding.BROWSER_MODEL_ID, "dim": dim, "papers": h_papers}))
    rng = random.Random(1)
    drift_ids = rng.sample(range(len(h_papers)), min(DRIFT_PAPERS, len(h_papers)))
    drift = [{"i": d, "top10": int8_top10(heldout_int8[d], centres_int8, spans)} for d in drift_ids]
    (DATA_DIR / "drift_sample.json").write_text(json.dumps(drift))
    works_ids = [p["work"] for p in h_papers if p["work"]]
    (DATA_DIR / "heldout_sample.json").write_text(json.dumps(rng.sample(works_ids, min(REF_SAMPLE, len(works_ids)))))
    (DATA_DIR / "dropped.txt").write_text("\n".join(dropped) + "\n")

    manifest = {
        "model_id": embedding.BROWSER_MODEL_ID,
        "dim": dim,
        "query_prefix": embedding.QUERY_PREFIX,
        "journal_count": len(meta),
        "centre_count": len(centres_int8),
        "topic_count": len(rows),
        "built_at": datetime.now(UTC).isoformat(),
        "works_file": wpath.name,
        "ranking": None,
    }
    (OUT_DIR / "manifest.json").write_text(json.dumps(manifest))
    sizes = {f.name: f"{f.stat().st_size / 1e6:.1f} MB" for f in OUT_DIR.iterdir()}
    print(f"wrote {len(meta)} journals, {len(centres_int8)} centres, {len(rows)} topics, {len(h_papers)} held-out: {sizes}", flush=True)


def _self_check() -> None:
    meta = [{"id": f"j{i}", "works_count": i} for i in range(5)]
    mark_prerendered(meta, limit=2)
    assert {m["id"] for m in meta if m["prerendered"]} == {"j4", "j3"}
    meta_with_nulls = [{"id": "a", "works_count": None}, {"id": "b", "works_count": 5}]
    mark_prerendered(meta_with_nulls, limit=1)
    assert meta_with_nulls[1]["prerendered"] is True and meta_with_nulls[0]["prerendered"] is False

    papers = lambda n: [{"id": f"W{i}"} for i in range(n)]
    idx, held = split_papers(papers(200))
    assert len(held) == 20 and held[0]["id"] == "W0" and len(idx) == 180 and idx[0]["id"] == "W20", "newest held out"
    idx, held = split_papers(papers(20))
    assert len(held) == 5 and len(idx) == 15
    idx, held = split_papers(papers(12))
    assert held == [] and len(idx) == 12, "too small to spare: nothing held out"
    assert not {p["id"] for p in idx} & {p["id"] for p in held}

    assert source_topic_profile({"topics": [{"id": "https://openalex.org/T1", "count": 30}, {"id": "T2", "count": 10}]}) == [("T1", 0.75), ("T2", 0.25)]
    assert source_topic_profile({}) == []
    labels = np.array([0, 0, 1, 1, 1])
    assert centre_labels(labels, [["T1"], ["T1"], ["T2"], [], ["T2"]], 2, {"T1": "Heart", "T2": "Lung"}) == ["Heart", "Lung"]
    assert centre_labels(np.array([0]), [[]], 1, {}) == [""]

    centres = np.array([[10, 0], [0, 10], [5, 5], [9, 1]], dtype=np.int8)
    top = int8_top10(np.array([10, 0], dtype=np.int8), centres, [(0, 1), (1, 2), (3, 1)])
    assert top == [0, 2, 1], top  # j0: 100, j1: max(0, 50) = 50, j2: 90
    tie = int8_top10(np.array([1, 1], dtype=np.int8), np.array([[1, 1], [1, 1]], dtype=np.int8), [(0, 1), (1, 1)])
    assert tie == [0, 1], "ties break by journal index"

    print("build_index self-check: OK")


if __name__ == "__main__":
    main()
