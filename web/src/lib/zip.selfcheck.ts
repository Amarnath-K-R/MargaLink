// Runnable check for zip.ts. Run directly: node src/lib/zip.selfcheck.ts
import assert from "node:assert/strict";
import { flattenSingleRoot, unzipFiles, zipFiles, type ZipEntry } from "./zip.ts";

const enc = (s: string) => new TextEncoder().encode(s);
const binary = Uint8Array.from({ length: 1000 }, (_, i) => (i * 37 + 11) % 256);
const entries: ZipEntry[] = [
  { path: "main.tex", data: enc("\\documentclass{article}\n\\begin{document}Hi\\end{document}\n") },
  { path: "figures/plot.pdf", data: binary },
  { path: "sections/intro/part.tex", data: enc("Intro — with a non-ASCII dash") },
];

// round trip: paths and bytes survive, including binary and nested folders
const back = unzipFiles(zipFiles(entries));
assert.deepEqual(back.map((e) => e.path).sort(), entries.map((e) => e.path).sort());
for (const e of entries) assert.deepEqual(back.find((b) => b.path === e.path)!.data, e.data, e.path);

// directory entries in a real zip ("figures/") are not files
assert.ok(unzipFiles(zipFiles([...entries, { path: "empty/", data: new Uint8Array(0) }])).every((e) => !e.path.endsWith("/")));

// a zip whose files all sit in one folder (how templates and Overleaf exports come) is flattened one level
const nested = entries.map((e) => ({ ...e, path: `paper/${e.path}` }));
assert.deepEqual(flattenSingleRoot(nested).map((e) => e.path).sort(), entries.map((e) => e.path).sort());
assert.deepEqual(flattenSingleRoot(entries).map((e) => e.path), entries.map((e) => e.path), "mixed roots are left alone");
assert.deepEqual(flattenSingleRoot([{ path: "main.tex", data: enc("x") }]).map((e) => e.path), ["main.tex"], "a single top-level file isn't a folder");
// macOS zips add __MACOSX/ noise: dropped, and they don't count as a second root
assert.deepEqual(flattenSingleRoot([...nested, { path: "__MACOSX/paper/._main.tex", data: enc("x") }]).map((e) => e.path).sort(), entries.map((e) => e.path).sort());

console.log("zip.selfcheck: OK");
