// Cloudflare Pages takes at most 20,000 files per deployment and 25 MiB per
// file; past either the upload fails halfway. Run on the static export before
// deploying (npm run deploy does): it fails with what's over, and says how
// close the build is. The journal pages and the Word editor's fonts are most
// of the count.
//   node scripts/ops/check_out_limits.mjs [dir]
import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const MAX_FILES = 20_000;
const MAX_BYTES = 25 * 1024 * 1024;
const root = process.argv[2] ?? new URL("../../out", import.meta.url).pathname;

let files = 0;
let largest = { path: "", bytes: 0 };
const tooBig = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) walk(p);
    else {
      files++;
      if (s.size > largest.bytes) largest = { path: relative(root, p), bytes: s.size };
      if (s.size > MAX_BYTES) tooBig.push(`${relative(root, p)} (${(s.size / 1048576).toFixed(1)} MiB)`);
    }
  }
};
walk(root);
console.log(`${files.toLocaleString("en")} files of ${MAX_FILES.toLocaleString("en")} allowed; largest ${largest.path} (${(largest.bytes / 1048576).toFixed(1)} MiB of 25)`);
if (files > MAX_FILES) console.error(`Too many files for one Cloudflare Pages deployment: ${files} > ${MAX_FILES}.`);
if (tooBig.length) console.error(`Files over Cloudflare Pages' 25 MiB limit:\n  ${tooBig.join("\n  ")}`);
process.exit(files > MAX_FILES || tooBig.length ? 1 : 0);
