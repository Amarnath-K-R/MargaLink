"""Backups of the pipeline's data and the built journal index, in R2, so
neither depends on one machine.

What's kept: everything in pipeline/data (the papers fetched from OpenAlex,
the embedding caches, the NLM and DOAJ checks, the held-out references:
hours of fetching and embedding) except SKIP, and the built index
(web/public/index). Each snapshot is complete, so restoring any one gives a
working pipeline and the index it built.

How: each file is gzipped and cut into PART_BYTES pieces (wrangler uploads
at most 300 MiB at a time, and big uploads time out on a slow link) under
its sha256 (files/<sha256>/<n>), so a file that hasn't changed is never sent
twice. A snapshot is the list of paths and hashes (snapshots/<name>.json);
snapshots/list.json names them, newest last. Uploads resume: the pieces
already sent are listed in pipeline/data/.backup_sent.

The bucket is private; create it once with
`cd web && npx wrangler r2 bucket create margalink-data`. On another machine:
`cd web && npm install && npx wrangler login`, then pull.

Usage:
    uv run backup.py push                    # snapshot what's here now
    uv run backup.py list                    # the snapshots, newest last
    uv run backup.py pull [NAME] [--only index] [--force]
                                             # restore one (default: the newest)

push refuses while a pipeline job is running (it would keep a half-written
file). pull never replaces a local file that differs unless --force.
"""

import argparse
import fnmatch
import hashlib
import json
import subprocess
import tempfile
import time
import zlib
from collections.abc import Callable, Iterable, Iterator
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BUCKET = "margalink-data"
WRANGLER = ROOT / "web/node_modules/.bin/wrangler"
PART_BYTES = 16 * 1024 * 1024
DATA = "pipeline/data"
INDEX = "web/public/index"

# Not kept: the v1 data (read only with build_index.py --v1), logs, a build's
# half-written caches, and this tool's own resume list.
SKIP = ("works.jsonl", "sources_v1.jsonl", "*_works_1500_*", "index_v1_backup/*", "*.log", "*.partial.npy", "*.done", "*.restoring", ".*", "*/.*", "__pycache__/*")

# A job that writes into pipeline/data or the index; a snapshot taken under it could keep a half-written file.
JOBS = ("fetch_sources.py", "fetch_topics.py", "fetch_works.py", "enrich_doaj.py", "enrich_nlm.py", "fetch_nlm_abbrevs.py", "build_index.py", "eval_match.ts")

Put = Callable[[str, Path], None]
Get = Callable[[str, Path], bool]  # False when the key isn't there


def skipped(rel: str) -> bool:
    """Whether a path in pipeline/data is left out of a backup."""
    return any(fnmatch.fnmatch(rel, p) for p in SKIP)


def sha256(path: Path) -> str:
    with open(path, "rb") as f:
        return hashlib.file_digest(f, "sha256").hexdigest()


def pack(path: Path, part_bytes: int) -> Iterator[bytes]:
    """The gzip of a file, part_bytes at a time. zlib's gzip header has no
    timestamp, so the same file gives the same pieces every time."""
    comp = zlib.compressobj(6, zlib.DEFLATED, 31)
    buf = bytearray()
    with open(path, "rb") as f:
        while chunk := f.read(1 << 20):
            buf += comp.compress(chunk)
            while len(buf) >= part_bytes:
                yield bytes(buf[:part_bytes])
                del buf[:part_bytes]
    buf += comp.flush()
    while buf:
        yield bytes(buf[:part_bytes])
        del buf[:part_bytes]


def unpack(parts: Iterable[bytes], dest: Path) -> str:
    """Writes the file the pieces hold; returns its sha256. A piece that's
    damaged or missing at the end raises zlib.error."""
    dec = zlib.decompressobj(31)
    h = hashlib.sha256()
    with open(dest, "wb") as out:
        for part in parts:
            data = dec.decompress(part)
            h.update(data)
            out.write(data)
        data = dec.flush()
        h.update(data)
        out.write(data)
    if not dec.eof:
        raise zlib.error("the pieces end before the file does")
    return h.hexdigest()


def collect(root: Path) -> list[str]:
    """What a snapshot holds, as paths from the repo root."""
    data = root / DATA
    kept = [p for p in data.rglob("*") if p.is_file() and not skipped(p.relative_to(data).as_posix())] if data.exists() else []
    index = [p for p in (root / INDEX).rglob("*") if p.is_file()] if (root / INDEX).exists() else []
    return sorted(p.relative_to(root).as_posix() for p in kept + index)


def _get_json(get: Get, key: str):
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / "f.json"
        return json.loads(path.read_text()) if get(key, path) else None


def push(root: Path, put: Put, get: Get, sent: Path, name: str, part_bytes: int = PART_BYTES) -> str:
    """Uploads a snapshot of root's data and index; returns its name."""
    names = _get_json(get, "snapshots/list.json") or []
    known = {f["sha256"]: f["parts"] for f in _get_json(get, f"snapshots/{names[-1]}.json")["files"]} if names else {}
    done = set(sent.read_text().split()) if sent.exists() else set()
    files = []
    with tempfile.TemporaryDirectory() as tmp:
        piece = Path(tmp) / "piece"
        for rel in collect(root):
            path = root / rel
            digest = sha256(path)
            if digest not in known:
                n = 0
                for n, data in enumerate(pack(path, part_bytes)):
                    key = f"files/{digest}/{n:04d}"
                    if key in done:
                        continue
                    piece.write_bytes(data)
                    put(key, piece)
                    with sent.open("a") as s:
                        s.write(key + "\n")
                    print(f"sent {rel} piece {n + 1}", flush=True)
                known[digest] = n + 1
            files.append({"path": rel, "sha256": digest, "bytes": path.stat().st_size, "parts": known[digest]})
        piece.write_text(json.dumps({"name": name, "files": files}, indent=1))
        put(f"snapshots/{name}.json", piece)
        piece.write_text(json.dumps([n for n in names if n != name] + [name]))
        put("snapshots/list.json", piece)
    return name


def pull(root: Path, get: Get, name: str | None, only: str | None = None, force: bool = False) -> None:
    """Restores a snapshot (the newest if name is None) into root. Checks every
    file first: one that differs locally stops it before anything's written."""
    names = _get_json(get, "snapshots/list.json") or []
    if not names:
        raise SystemExit("there are no snapshots in the bucket yet")
    name = name or names[-1]
    if name not in names:
        raise SystemExit(f"there's no snapshot {name}; there are: {', '.join(names)}")
    files = [f for f in _get_json(get, f"snapshots/{name}.json")["files"] if only != "index" or f["path"].startswith(INDEX + "/")]
    todo, clash = [], []
    for f in files:
        dest = root / f["path"]
        if dest.exists() and sha256(dest) == f["sha256"]:
            continue
        (clash if dest.exists() and not force else todo).append(f)
    if clash:
        raise SystemExit("these differ from the snapshot; pass --force to replace them:\n  " + "\n  ".join(f["path"] for f in clash))
    with tempfile.TemporaryDirectory() as tmp:
        piece = Path(tmp) / "piece"
        for f in todo:
            dest = root / f["path"]
            dest.parent.mkdir(parents=True, exist_ok=True)
            restoring = dest.with_name(dest.name + ".restoring")

            def pieces(f=f) -> Iterator[bytes]:
                for n in range(f["parts"]):
                    if not get(f"files/{f['sha256']}/{n:04d}", piece):
                        raise SystemExit(f"{f['path']}: piece {n + 1} is missing from the bucket")
                    yield piece.read_bytes()

            try:
                digest = unpack(pieces(), restoring)
            except zlib.error as e:
                restoring.unlink(missing_ok=True)
                raise SystemExit(f"{f['path']}: a piece came back damaged ({e})") from None
            if digest != f["sha256"]:
                restoring.unlink()
                raise SystemExit(f"{f['path']}: what came back doesn't match the snapshot")
            restoring.replace(dest)
            print(f"restored {f['path']}", flush=True)


def _wrangler(*args: str) -> subprocess.CompletedProcess:
    return subprocess.run([str(WRANGLER), "r2", *args], cwd=ROOT / "web", capture_output=True, text=True, check=False)


def r2_put(key: str, path: Path) -> None:
    for attempt in range(4):
        r = _wrangler("object", "put", f"{BUCKET}/{key}", "--file", str(path), "--remote", "--force")
        if r.returncode == 0:
            return
        time.sleep(5 * 2**attempt)
    raise RuntimeError(f"couldn't upload {key}: {(r.stdout + r.stderr).strip()[-300:]}")


def r2_get(key: str, path: Path) -> bool:
    for attempt in range(4):
        r = _wrangler("object", "get", f"{BUCKET}/{key}", "--file", str(path), "--remote")
        if r.returncode == 0:
            return True
        if "The specified key does not exist" in r.stdout + r.stderr:
            return False
        time.sleep(5 * 2**attempt)
    raise RuntimeError(f"couldn't download {key}: {(r.stdout + r.stderr).strip()[-300:]}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Back up pipeline/data and the journal index to R2, or restore them.")
    sub = parser.add_subparsers(dest="cmd", required=True)
    sub.add_parser("push", help="snapshot what's here now")
    sub.add_parser("list", help="the snapshots, newest last")
    p = sub.add_parser("pull", help="restore a snapshot (default: the newest)")
    p.add_argument("name", nargs="?")
    p.add_argument("--only", choices=["index"])
    p.add_argument("--force", action="store_true", help="replace local files that differ")
    args = parser.parse_args()

    if not WRANGLER.exists():
        raise SystemExit("wrangler isn't installed: cd web && npm install")
    # A missing bucket and a missing key look the same to `object get`, so check the bucket first.
    if _wrangler("bucket", "info", BUCKET).returncode != 0:
        raise SystemExit(f"can't reach the R2 bucket {BUCKET}: create it (cd web && npx wrangler r2 bucket create {BUCKET}) or sign in (npx wrangler login)")
    if args.cmd == "push":
        ps = subprocess.run(["ps", "axo", "command"], capture_output=True, text=True, check=True).stdout
        busy = [j for j in JOBS if j in ps]
        if busy:
            raise SystemExit(f"a pipeline job is running ({', '.join(busy)}); back up once it's finished")
        name = push(ROOT, r2_put, r2_get, ROOT / DATA / ".backup_sent", time.strftime("%Y-%m-%dT%H%MZ", time.gmtime()))
        print(f"snapshot {name}: done")
    elif args.cmd == "list":
        names = _get_json(r2_get, "snapshots/list.json") or []
        print("\n".join(names) if names else "no snapshots yet")
    else:
        pull(ROOT, r2_get, args.name, only=args.only, force=args.force)
        print("restored")


def _self_check() -> None:
    import contextlib
    import io
    import os

    with tempfile.TemporaryDirectory() as tmp, contextlib.redirect_stdout(io.StringIO()):
        t = Path(tmp)

        # pieces: the gzip of a file cut to size, the same bytes every time, and back again
        src = t / "a.jsonl"
        src.write_bytes(b'{"id": 1, "title": "x"}\n' * 5000 + os.urandom(3000))
        parts = list(pack(src, 1024))
        assert len(parts) > 1 and all(len(p) == 1024 for p in parts[:-1])
        assert parts == list(pack(src, 1024)), "deterministic, so an interrupted upload can resume"
        assert unpack(iter(parts), t / "a.out") == sha256(src)
        assert (t / "a.out").read_bytes() == src.read_bytes()
        empty = t / "empty"
        empty.write_bytes(b"")
        assert unpack(iter(list(pack(empty, 1024))), t / "empty.out") == sha256(empty)

        # what's kept
        assert skipped("works.jsonl") and skipped("sources_v1.jsonl") and skipped("rebuild.log")
        assert skipped("index_v1_backup/manifest.json") and skipped(".backup_sent")
        assert skipped("embcache_x_passage_works_1500_ab.npy") and skipped("embcache_x.partial.npy")
        assert not skipped("works_v2.jsonl") and not skipped("nlm.jsonl")
        assert not skipped("embcache_x_passage_works_v2_19078_ab.npy")

        # a machine with data, a store, and an empty machine
        store = t / "r2"
        store.mkdir()
        puts: list[str] = []

        def put(key: str, path: Path) -> None:
            puts.append(key)
            (store / key).parent.mkdir(parents=True, exist_ok=True)
            (store / key).write_bytes(path.read_bytes())

        def get(key: str, path: Path) -> bool:
            if not (store / key).exists():
                return False
            path.write_bytes((store / key).read_bytes())
            return True

        a = t / "a"
        (a / "pipeline/data").mkdir(parents=True)
        (a / "web/public/index").mkdir(parents=True)
        (a / "pipeline/data/works_v2.jsonl").write_bytes(b"paper\n" * 20000)
        (a / "pipeline/data/nlm.jsonl").write_bytes(b'{"id": 1}\n')
        (a / "pipeline/data/rebuild.log").write_bytes(b"not kept")
        (a / "web/public/index/manifest.json").write_bytes(b'{"v": 1}')
        sent = a / "pipeline/data/.backup_sent"

        first = push(a, put, get, sent, "2026-10-02T1000Z", part_bytes=512)
        manifest = json.loads((store / "snapshots" / f"{first}.json").read_text())
        assert sorted(f["path"] for f in manifest["files"]) == ["pipeline/data/nlm.jsonl", "pipeline/data/works_v2.jsonl", "web/public/index/manifest.json"]
        assert json.loads((store / "snapshots/list.json").read_text()) == [first]

        # an unchanged file isn't sent again; a changed one is
        (a / "web/public/index/manifest.json").write_bytes(b'{"v": 2}')
        before = len(puts)
        second = push(a, put, get, sent, "2026-10-03T1000Z", part_bytes=512)
        file_puts = [k for k in puts[before:] if k.startswith("files/")]
        assert file_puts == [f"files/{sha256(a / 'web/public/index/manifest.json')}/0000"], file_puts
        assert json.loads((store / "snapshots/list.json").read_text()) == [first, second]

        # an interrupted upload resumes where it stopped
        (a / "pipeline/data/topics.jsonl").write_bytes(os.urandom(2000))
        calls = {"n": 0}

        def flaky(key: str, path: Path) -> None:
            calls["n"] += 1
            if calls["n"] == 3:
                raise RuntimeError("link dropped")
            put(key, path)

        try:
            push(a, flaky, get, sent, "2026-10-04T1000Z", part_bytes=512)
            raise AssertionError("the dropped link should stop the push")
        except RuntimeError:
            pass
        before = len(puts)
        push(a, put, get, sent, "2026-10-04T1000Z", part_bytes=512)
        resent = [k for k in puts[before:] if k.startswith("files/")]
        assert len(resent) == len(list(pack(a / "pipeline/data/topics.jsonl", 512))) - 2, "the two pieces already sent aren't sent again"

        # restoring on an empty machine: the newest by default, or a named one, or just the index
        b = t / "b"
        pull(b, get, None)
        assert (b / "web/public/index/manifest.json").read_bytes() == b'{"v": 2}'
        assert (b / "pipeline/data/works_v2.jsonl").read_bytes() == (a / "pipeline/data/works_v2.jsonl").read_bytes()
        assert not (b / "pipeline/data/rebuild.log").exists()
        c = t / "c"
        pull(c, get, first, only="index")
        assert (c / "web/public/index/manifest.json").read_bytes() == b'{"v": 1}'
        assert not (c / "pipeline").exists()

        # a local file that differs is never replaced without --force, and nothing is written
        try:
            pull(b, get, first)
            raise AssertionError("should refuse to replace a different local file")
        except SystemExit as e:
            assert "web/public/index/manifest.json" in str(e)
        assert (b / "web/public/index/manifest.json").read_bytes() == b'{"v": 2}'
        pull(b, get, first, force=True)
        assert (b / "web/public/index/manifest.json").read_bytes() == b'{"v": 1}'

        # a piece that comes back damaged is caught, and the file left as it was
        works = next(f for f in manifest["files"] if f["path"].endswith("works_v2.jsonl"))
        piece = store / "files" / works["sha256"] / "0000"
        damaged = bytearray(piece.read_bytes())
        damaged[100] ^= 0xFF
        piece.write_bytes(bytes(damaged))
        d = t / "d"
        try:
            pull(d, get, first)
            raise AssertionError("a damaged piece should stop the restore")
        except SystemExit as e:
            assert "works_v2.jsonl" in str(e), e
        assert not (d / "pipeline/data/works_v2.jsonl").exists() and not (d / "pipeline/data/works_v2.jsonl.restoring").exists()

    print("backup self-check: OK")


if __name__ == "__main__":
    main()
