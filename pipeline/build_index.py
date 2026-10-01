"""Matching v2: builds the production journal index for the web app from
sources.jsonl + works (v2 if present) + DOAJ/NLM enrichment + topics.

Per journal: the newest papers are held out for evaluation (never part of the
index), the rest are embedded and clustered into 1-4 centres; a topic profile,
centre labels and alternate names are stored for the browser's topic and
reference-list signals; journals whose papers don't cohere, or both miss their
topics and scatter, are dropped (data/dropped.txt; quality.py says why). Every
journal's coherence goes to data/coherence.tsv, lowest first, for setting the
floor. The OpenAlex topic table is embedded once.

Usage:
  uv run build_index.py                  # full build (hours: ~110 papers/s on MPS)
  uv run build_index.py --journals 1500  # a seeded dev-sized sample
Writes web/public/index/{manifest.json, index.bin, meta.json, topics.bin, topics.json}
and pipeline/data/{heldout.bin, heldout.json, heldout_sample.json, drift_sample.json, dropped.txt, coherence.tsv}.

manifest.ranking stays null here: web/scripts/eval/eval_match.ts fits and writes it,
so a rebuild can never publish stale accuracy.
"""

import hashlib
import inspect
import itertools
import json
import os
import random
import sys
import tempfile
import time
from collections import Counter
from datetime import UTC, datetime
from pathlib import Path

import numpy as np

import embedding
from enrichment import (
    build_meta_entry,
    is_conference_proceedings_name,
    is_placeholder_source,
    load_doaj,
    load_nlm,
    load_nlm_abbrevs,
    load_sources,
)
from kmeans import cluster_journal
from openalex import safe_iter_jsonl
from quality import coherence, field_fit, is_suspect, top_topics

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


def slim(p: dict) -> dict:
    """What the build keeps of a paper in memory: never its text. The full works
    file (4.6 GB, 2.8M abstracts) doesn't fit in RAM beside everything else; texts
    are streamed from the file when they're embedded (iter_texts)."""
    return {"id": p.get("id"), "topics": [sys.intern(t) for t in p.get("topics") or []], "year": p.get("year")}


def load_splits(path: Path) -> dict[str, tuple[list[dict], list[dict]]]:
    """Journal id -> (index, held-out) papers, slimmed, in file order."""
    out = {}
    for j in safe_iter_jsonl(path):
        if j["id"] in out:
            continue  # a journal written twice (two fetch runs): the first wins, as in iter_texts
        idx, held = split_papers(j["papers"])
        out[j["id"]] = ([slim(p) for p in idx], [slim(p) for p in held])
    return out


def iter_texts(path: Path, ids: list[str], which: int):
    """The papers' texts streamed from the works file, journal by journal in `ids`
    order, which must be file order: which=0 the index papers, 1 the held-out."""
    want, seen = set(ids), set()
    for j in safe_iter_jsonl(path):
        if j["id"] in want and j["id"] not in seen:
            seen.add(j["id"])
            yield from (paper_text(p) for p in split_papers(j["papers"])[which])


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
    """The exact integer ranking web/src/lib/match/rank.ts computes for embedding-only
    weights: best centre per journal by int8 dot, score desc, journal index asc."""
    dots = centres.astype(np.int32) @ query.astype(np.int32)
    best = [int(dots[s : s + c].max()) for s, c in spans]
    return sorted(range(len(best)), key=lambda j: (-best[j], j))[:10]


EMBED_CHUNK = 20_000


def settings_tag() -> str:
    """Everything besides the works file and the journal ids that decides which
    vectors a cache holds: the split sizes, the text each paper becomes, the
    input cap and the model. A change to any of them names a new cache file."""
    parts = (HELDOUT_MAX, INDEX_CAP, MIN_INDEX_PAPERS, embedding.MAX_CHARS, embedding.MODEL_NAME, inspect.getsource(paper_text))
    return hashlib.sha1(repr(parts).encode()).hexdigest()[:8]


# The settings the caches written before settings_tag existed were made with
# (the full v2 build of 2026-09-28): while they hold, those files keep their
# names and are reused; any change to the settings gets a tagged name instead.
LEGACY_TAG = "0f59cdb8"


def embed_cached(model, texts, count: int, dim: int, kind: str, key: str, cache_dir: Path = DATA_DIR) -> np.ndarray:
    """Paper vectors, embedded chunk by chunk straight into a float16 file on disk
    and returned memory-mapped, so millions never sit in memory at once. Cached
    by model + kind + key, so re-running the build to tune the quality pass
    doesn't re-embed; an interrupted run (OOM, sleep, SIGKILL) resumes where the
    last finished chunk left off."""
    tag = settings_tag()
    suffix = "" if tag == LEGACY_TAG else f"_{tag}"
    path = cache_dir / f"embcache_{embedding.MODEL_NAME.replace('/', '_')}_{kind}_{key}{suffix}.npy"
    if path.exists():
        cached = np.load(path, mmap_mode="r")
        if cached.shape == (count, dim):
            print(f"using cached vectors {path.name}", flush=True)
            return cached
        print(f"{path.name} holds {cached.shape}, not {(count, dim)}: embedding again", flush=True)
        del cached
    part, done_file = path.with_suffix(".partial.npy"), path.with_suffix(".done")
    resume = part.exists() and done_file.exists()
    if resume:
        # Only a partial file of the right size, with a readable count, is picked up.
        resume = np.load(part, mmap_mode="r").shape == (count, dim) and done_file.read_text().strip().isdigit()
    out = np.lib.format.open_memmap(part, mode="r+" if resume else "w+", dtype=np.float16, shape=(count, dim))
    done = int(done_file.read_text()) if resume else 0
    if done:
        print(f"{kind}: resuming at {done}/{count}", flush=True)
    rest, start, first = itertools.islice(texts, done, None), time.time(), done
    while chunk := list(itertools.islice(rest, EMBED_CHUNK)):
        out[done : done + len(chunk)] = embedding.embed_texts(model, chunk, kind, progress=False)
        out.flush()
        done += len(chunk)
        # Written aside and renamed into place, so a kill mid-write can't leave it empty.
        tmp = done_file.with_suffix(".done.tmp")
        tmp.write_text(str(done))
        os.replace(tmp, done_file)
        rate = (done - first) / max(time.time() - start, 1e-9)
        print(f"{kind}: {done}/{count} ({rate:.0f}/s, ~{(count - done) / rate / 3600:.1f} h left)", flush=True)
    if done != count:
        raise RuntimeError(f"{kind}: expected {count} texts, the works file gave {done}")
    del out
    part.rename(path)
    done_file.unlink()
    return np.load(path, mmap_mode="r")


def main() -> None:
    sources = load_sources()
    wpath = works_path()
    splits = load_splits(wpath)
    doaj, nlm, abbrevs = load_doaj(), load_nlm(), load_nlm_abbrevs()
    print(f"NLM abbreviations for {len(abbrevs)} ISSNs (fetch_nlm_abbrevs.py)", flush=True)
    topics = list(safe_iter_jsonl(DATA_DIR / "topics.jsonl"))
    topic_name = {t["id"]: t["name"] for t in topics}
    topic_field = {t["id"]: t["field"] for t in topics}
    ids = [sid for sid in sources if sid in splits and not is_conference_proceedings_name(sources[sid]["display_name"])]
    if "--journals" in sys.argv:
        n = int(sys.argv[sys.argv.index("--journals") + 1])
        ids = sorted(random.Random(1).sample(ids, min(n, len(ids))))
    print(f"{len(sources)} sources, {len(splits)} with papers ({wpath.name}), {len(ids)} to build", flush=True)
    if len(ids) < 10:
        print("too few journals joined yet — let fetch_works.py run longer")
        return

    chosen = {sid for sid in ids if len(splits[sid][0]) >= MIN_INDEX_PAPERS}
    ids = [sid for sid in splits if sid in chosen]  # file order, so texts can be streamed in step
    model = embedding.load_model()
    dim = model.get_embedding_dimension()
    stat = wpath.stat()
    digest = hashlib.sha1(f"{stat.st_size}:{stat.st_mtime_ns}:{','.join(ids)}".encode()).hexdigest()[:16]
    key = f"{wpath.stem}_{len(ids)}_{digest}"
    n_index, n_held = (sum(len(splits[sid][w]) for sid in ids) for w in (0, 1))
    print(f"embedding {n_index} index papers + {n_held} held-out", flush=True)
    index_vecs = embed_cached(model, iter_texts(wpath, ids, 0), n_index, dim, "passage", key)
    heldout_vecs = embed_cached(model, iter_texts(wpath, ids, 1), n_held, dim, "query", key) if n_held else np.zeros((0, dim), np.float16)

    centres_all, meta, spans, kept, dropped, cohs, means = [], [], [], [], [], [], []
    i = 0
    for sid in ids:
        papers = splits[sid][0]
        vecs = np.asarray(index_vecs[i : i + len(papers)], dtype=np.float32)
        i += len(papers)
        centres, labels = cluster_journal(vecs)
        paper_topics = [p.get("topics") or [] for p in papers]
        coh = coherence(vecs, centres, labels)
        cohs.append((coh, sources[sid]["display_name"], sid))
        entry = build_meta_entry(sid, sources[sid]["display_name"], sources, doaj, nlm, abbrevs)
        # Placeholders are dropped here, after embedding, not from `ids`: the
        # embedding cache is keyed on `ids`, and re-embedding takes a day.
        reason = "not a journal (no ISSN and no publisher)" if is_placeholder_source(sources[sid]) else is_suspect(coh, field_fit(sources[sid].get("topics") or [], paper_topics, topic_field))
        if reason:
            dropped.append(f"{sources[sid]['display_name']}\t{sid}\t{reason}")
            continue
        entry["centres"] = [sum(len(c) for c in centres_all), len(centres)]
        entry["centre_topics"] = centre_labels(labels, paper_topics, len(centres), topic_name)
        entry["topics"] = top_topics(paper_topics) or source_topic_profile(sources[sid])
        spans.append((entry["centres"][0], len(centres)))
        centres_all.append(centres)
        # The single averaged vector the v1 index used — kept (never deployed)
        # so the harness's baseline is the index that was actually live.
        means.append(embedding.normalize(vecs.mean(axis=0, keepdims=True))[0])
        meta.append(entry)
        kept.append(sid)
    q = np.percentile([c for c, _, _ in cohs], [1, 5, 10, 50])
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
    heldout_int8 = embedding.quantize_int8(np.asarray(heldout_vecs[h_rows], dtype=np.float32)) if h_rows else np.zeros((0, dim), np.int8)
    heldout_int8.tofile(DATA_DIR / "heldout.bin")
    (DATA_DIR / "heldout.json").write_text(json.dumps({"model_id": embedding.BROWSER_MODEL_ID, "dim": dim, "papers": h_papers}))
    rng = random.Random(1)
    drift_ids = rng.sample(range(len(h_papers)), min(DRIFT_PAPERS, len(h_papers)))
    drift = [{"i": d, "top10": int8_top10(heldout_int8[d], centres_int8, spans)} for d in drift_ids]
    (DATA_DIR / "drift_sample.json").write_text(json.dumps(drift))
    works_ids = [p["work"] for p in h_papers if p["work"]]
    (DATA_DIR / "heldout_sample.json").write_text(json.dumps(rng.sample(works_ids, min(REF_SAMPLE, len(works_ids)))))
    (DATA_DIR / "dropped.txt").write_text("\n".join(dropped) + "\n")
    (DATA_DIR / "coherence.tsv").write_text("".join(f"{c:.4f}\t{name}\t{sid}\n" for c, name, sid in sorted(cohs)))
    embedding.quantize_int8(np.array(means)).tofile(DATA_DIR / "mean_centroids.bin")

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

    # Streaming: texts come back in file order, per split, and match what's kept.
    with tempfile.TemporaryDirectory() as tmp:
        works = Path(tmp) / "w.jsonl"
        journal = lambda jid, n: {"id": jid, "papers": [{"id": f"{jid}{i}", "title": f"{jid}{i}", "abstract": "a", "topics": ["T1"], "year": 2026} for i in range(n)]}
        works.write_text("\n".join(json.dumps(journal(j, n)) for j, n in [("A", 20), ("B", 12), ("C", 20)]) + "\n")
        sp = load_splits(works)
        assert list(sp) == ["A", "B", "C"] and set(sp["A"][0][0]) == {"id", "topics", "year"}, "slim, file order"
        texts = list(iter_texts(works, ["A", "C"], 0))
        assert len(texts) == 30 and texts[0].startswith("A5") and texts[15].startswith("C5")
        assert [t.split()[0] for t in iter_texts(works, ["A", "C"], 1)] == [f"A{i}" for i in range(5)] + [f"C{i}" for i in range(5)]

        # Resumable embedding: a run killed mid-way picks up at the last chunk.
        class Model:
            def __init__(self, fail_after=None):
                self.seen, self.fail_after = [], fail_after

            def encode(self, texts, **_):
                if self.fail_after is not None and len(self.seen) >= self.fail_after:
                    raise KeyboardInterrupt
                self.seen += texts
                return np.array([[len(t), 1.0] for t in texts], dtype=np.float32)

        global EMBED_CHUNK
        chunk, EMBED_CHUNK = EMBED_CHUNK, 2
        items = [f"t{'x' * i}" for i in range(5)]
        try:
            embed_cached(Model(fail_after=2), iter(items), 5, 2, "passage", "k", Path(tmp))
            raise AssertionError("should have been interrupted")
        except KeyboardInterrupt:
            pass
        m = Model()
        vecs = embed_cached(m, iter(items), 5, 2, "passage", "k", Path(tmp))
        assert m.seen == items[2:], "only the unfinished chunks are re-embedded"
        assert np.allclose(vecs, embedding.normalize(np.array([[len(t), 1.0] for t in items], dtype=np.float32)), atol=1e-3)
        assert embed_cached(Model(fail_after=0), iter(items), 5, 2, "passage", "k", Path(tmp)).shape == (5, 2), "cached: nothing re-embedded"
        # A cache of the wrong size (the split settings changed) is embedded again, not used.
        m = Model()
        wrong = embed_cached(m, iter(items[:4]), 4, 2, "passage", "k", Path(tmp))
        assert wrong.shape == (4, 2) and m.seen == items[:4], "a mismatched cache is re-embedded"

        # A progress file left empty by a kill mid-write means starting over, not a crash.
        np.save(Path(tmp) / f"embcache_{embedding.MODEL_NAME.replace('/', '_')}_query_k.partial.npy", np.zeros((5, 2), np.float16))
        (Path(tmp) / f"embcache_{embedding.MODEL_NAME.replace('/', '_')}_query_k.done").write_text("")
        m = Model()
        assert embed_cached(m, iter(items), 5, 2, "query", "k", Path(tmp)).shape == (5, 2) and m.seen == items

        # Changed settings name a new cache; today's settings keep the old names.
        global INDEX_CAP
        assert settings_tag() == LEGACY_TAG, "the recorded settings are today's"
        cap, INDEX_CAP = INDEX_CAP, INDEX_CAP + 1
        try:
            assert settings_tag() != LEGACY_TAG
            m = Model()
            embed_cached(m, iter(items), 5, 2, "passage", "k", Path(tmp))
            assert m.seen == items, "not the cache made under the old settings"
        finally:
            INDEX_CAP = cap
        EMBED_CHUNK = chunk

        # A journal written twice: the first copy wins, in both passes.
        dup = Path(tmp) / "dup.jsonl"
        dup.write_text("\n".join(json.dumps(journal(j, n)) for j, n in [("A", 20), ("A", 40), ("B", 12)]) + "\n")
        sp = load_splits(dup)
        assert len(sp["A"][0]) == 15, "first copy"
        assert len(list(iter_texts(dup, ["A", "B"], 0))) == 15 + 12, "texts match the counts"

    print("build_index self-check: OK")


if __name__ == "__main__":
    main()
