// Zip in and out for /write: a project's backup, and importing a publisher
// template or an Overleaf export. Pure (fflate, MIT); nothing is sent.
import { unzipSync, zipSync } from "fflate";

export type ZipEntry = { path: string; data: Uint8Array };

export function zipFiles(entries: ZipEntry[]): Uint8Array {
  return zipSync(Object.fromEntries(entries.map((e) => [e.path, [e.data, { level: 6 }]])));
}

// A LaTeX project with its figures fits well inside these; a zip bomb (a
// few KB that inflate to gigabytes) or thousands of files doesn't, and is
// refused from the sizes its directory declares, before anything is inflated.
const MAX_FILES = 2000;
const MAX_BYTES = 300_000_000;

export function unzipFiles(bytes: Uint8Array, { maxFiles = MAX_FILES, maxBytes = MAX_BYTES } = {}): ZipEntry[] {
  let files = 0;
  let total = 0;
  const out = unzipSync(bytes, {
    filter: (f) => {
      files++;
      total += f.originalSize;
      if (files > maxFiles) throw new Error(`This zip has too many files (over ${maxFiles}).`);
      if (total > maxBytes) throw new Error(`This zip is too large once unpacked (over ${Math.round(maxBytes / 1e6)} MB).`);
      return true;
    },
  });
  const entries = Object.entries(out)
    .filter(([path]) => !path.endsWith("/"))
    .map(([path, data]) => ({ path, data }));
  // The directory's sizes are the zip's own claim; the real ones are checked too.
  if (entries.reduce((n, e) => n + e.data.length, 0) > maxBytes) throw new Error(`This zip is too large once unpacked (over ${Math.round(maxBytes / 1e6)} MB).`);
  return entries;
}

// Templates and exports usually arrive as one folder ("elsarticle/main.tex"):
// strip it so the project's files sit at the top. macOS's __MACOSX metadata
// and .DS_Store files are dropped first.
export function flattenSingleRoot(entries: ZipEntry[]): ZipEntry[] {
  const real = entries.filter((e) => !e.path.startsWith("__MACOSX/") && !e.path.endsWith(".DS_Store"));
  const roots = new Set(real.map((e) => (e.path.includes("/") ? e.path.split("/")[0] : null)));
  if (roots.size !== 1 || roots.has(null)) return real;
  const root = [...roots][0]!;
  return real.map((e) => ({ ...e, path: e.path.slice(root.length + 1) }));
}
