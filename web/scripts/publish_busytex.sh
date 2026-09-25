#!/usr/bin/env bash
# Puts the BusyTeX engine (MIT; TeX Live compiled to WebAssembly) into our R2
# bucket, for /write — copied server-side by a temporary Worker straight from
# BusyTeX's GitHub release, so nothing goes over this machine's upload link
# (a direct `wrangler r2 object put` of the 30-105 MB files timed out on a slow
# uplink). The Worker only copies the allowlisted files of one release, needs a
# random one-time token, and is deleted at the end, even on failure.
#
# Cost guardrails (R2 free tier: 10 GB stored, 1M writes/month, free egress):
#   - only the release's named files (ALLOWED) — the bucket holds ~223 MB;
#   - refuses unless the bucket's real size (wrangler r2 bucket info) plus the
#     files still to copy stays under MAX_BUCKET_MB — fails closed if the size
#     can't be read, so another release or stray uploads count too;
#   - every object is Cache-Control: immutable, so a browser fetches each once;
#   - idempotent: a file already live at the right size is skipped.
# Kill switch: `npx wrangler r2 bucket delete margalink-assets` stops all R2
# usage; only /write's compiling stops. Usage: bash scripts/publish_busytex.sh
set -euo pipefail

BUCKET="margalink-assets"
RELEASE_TAG="build_wasm_4499aa69fd3cf77ad86a47287d9a5193cf5ad993_7936974349_1"
PREFIX="busytex/2024-02-16"
PUBLIC="https://pub-fef44153e53d45fbaf08ca670aa565e3.r2.dev"
MAX_BUCKET_MB=500
WRANGLER="$(cd "$(dirname "$0")/.." && pwd)/node_modules/.bin/wrangler"

# name:bytes — the release's files and their exact sizes (verified against the live copies).
ALLOWED=(
  busytex.js:295606 busytex.wasm:30363063 busytex_worker.js:1241 busytex_pipeline.js:30380
  texlive-basic.js:2068492 texlive-basic.data:104576512
  ubuntu-texlive-latex-base.js:299539 ubuntu-texlive-latex-base.data:5741806
  ubuntu-texlive-latex-recommended.js:337892 ubuntu-texlive-latex-recommended.data:9058527
  ubuntu-texlive-latex-extra.js:1398581 ubuntu-texlive-latex-extra.data:49513577
  ubuntu-texlive-science.js:259829 ubuntu-texlive-science.data:9320179
  ubuntu-texlive-fonts-recommended.js:353109 ubuntu-texlive-fonts-recommended.data:10264033
)
NAMES=()
total=0
for e in "${ALLOWED[@]}"; do NAMES+=("${e%%:*}"); total=$((total + ${e##*:})); done
want_of() { for e in "${ALLOWED[@]}"; do [ "${e%%:*}" = "$1" ] && echo "${e##*:}"; done; }

header() { curl -sI "$1" | tr -d '\r' | awk -v h="$2" 'tolower($1)==h":"{v=$2} END{print v}'; }

echo "release: ${#NAMES[@]} files, $((total / 1000000)) MB"
if [ $((total / 1000000)) -gt "$MAX_BUCKET_MB" ]; then
  echo "refusing: exceeds the ${MAX_BUCKET_MB} MB guardrail" >&2
  exit 1
fi

TODO=()
for f in "${NAMES[@]}"; do
  if [ "$(header "$PUBLIC/$PREFIX/$f" content-length)" = "$(want_of "$f")" ]; then echo "live   $f"; else TODO+=("$f"); fi
done
if [ -z "${TODO[*]:-}" ]; then echo "all live: $PUBLIC/$PREFIX"; exit 0; fi

# The whole bucket, as R2 measures it ("bucket_size: 224 MB"), plus what's about to be copied.
bucket_mb=$("$WRANGLER" r2 bucket info "$BUCKET" 2>/dev/null | awk '$1=="bucket_size:" {
  u = toupper($3); m = (u=="B") ? 1e-6 : (u=="KB") ? 1e-3 : (u=="MB") ? 1 : (u=="GB") ? 1e3 : (u=="TB") ? 1e6 : -1
  if (m > 0) printf "%d", $2 * m + 0.999 }')
if [ -z "$bucket_mb" ]; then echo "refusing: couldn't read the bucket's size (wrangler r2 bucket info $BUCKET)" >&2; exit 1; fi
adding=0
for f in "${TODO[@]}"; do adding=$((adding + $(want_of "$f"))); done
echo "bucket: ${bucket_mb} MB now, +$((adding / 1000000)) MB to copy (cap ${MAX_BUCKET_MB} MB)"
if [ $((bucket_mb + adding / 1000000)) -gt "$MAX_BUCKET_MB" ]; then
  echo "refusing: the bucket would exceed the ${MAX_BUCKET_MB} MB guardrail" >&2
  exit 1
fi

WORK=$(mktemp -d)
TOKEN=$(openssl rand -hex 24)
cleanup() { (cd "$WORK" && "$WRANGLER" delete --name margalink-r2-copy --force >/dev/null 2>&1 || true); rm -rf "$WORK"; }
trap cleanup EXIT

names=$(printf '"%s",' "${NAMES[@]}")
cat > "$WORK/worker.js" <<EOF
const RELEASE = "https://github.com/busytex/busytex/releases/download/$RELEASE_TAG/";
const PREFIX = "$PREFIX/";
const ALLOWED = new Set([${names%,}]);
const TYPE = (n) => (n.endsWith(".wasm") ? "application/wasm" : n.endsWith(".js") ? "application/javascript" : "application/octet-stream");
export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.searchParams.get("token") !== env.TOKEN) return new Response("forbidden", { status: 403 });
    const name = url.searchParams.get("name") ?? "";
    if (!ALLOWED.has(name)) return new Response("not allowed", { status: 400 });
    const src = await fetch(RELEASE + name, { redirect: "follow" });
    if (!src.ok) return new Response("github " + src.status, { status: 502 });
    const { readable, writable } = new FixedLengthStream(Number(src.headers.get("content-length")));
    src.body.pipeTo(writable);
    const obj = await env.BUCKET.put(PREFIX + name, readable, {
      httpMetadata: { contentType: TYPE(name), cacheControl: "public, max-age=31536000, immutable" },
    });
    return Response.json({ name, size: obj.size });
  },
};
EOF
cat > "$WORK/wrangler.toml" <<EOF
name = "margalink-r2-copy"
main = "worker.js"
compatibility_date = "2026-09-01"
workers_dev = true
[[r2_buckets]]
binding = "BUCKET"
bucket_name = "$BUCKET"
EOF

cd "$WORK"
URL=$("$WRANGLER" deploy 2>&1 | grep -o 'https://margalink-r2-copy[^ ]*workers.dev' | head -1)
printf '%s' "$TOKEN" | "$WRANGLER" secret put TOKEN >/dev/null
echo "copying ${#TODO[@]} files via $URL (temporary)"
for f in "${TODO[@]}"; do
  for try in 1 2 3; do
    curl -s -m 280 "$URL/?token=$TOKEN&name=$f" >/dev/null || true
    if [ "$(header "$PUBLIC/$PREFIX/$f" content-length)" = "$(want_of "$f")" ]; then echo "copied $f"; break; fi
    [ "$try" = 3 ] && { echo "failed $f" >&2; exit 1; }
    sleep 10
  done
done
echo "all live: $PUBLIC/$PREFIX"
