#!/usr/bin/env bash
# Downloads the built journal index (web/public/index/, gitignored) from the
# deployed site, so a fresh clone can run /match, /journals and `npm run build`
# without the pipeline (which takes hours and ~11 GB of OpenAlex data).
# Usage: npm run fetch-index [-- <site-url>]
set -euo pipefail
SITE="${1:-https://margalink.pages.dev}"
OUT="$(cd "$(dirname "$0")/../.." && pwd)/public/index"
mkdir -p "$OUT"
for f in manifest.json index.bin meta.json topics.bin topics.json; do
  echo "fetching $f"
  curl -fsSL --retry 3 -o "$OUT/$f.part" "$SITE/index/$f"
  mv "$OUT/$f.part" "$OUT/$f"
done
echo "index ready in $OUT"
