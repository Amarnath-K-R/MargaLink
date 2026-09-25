// Zip in and out for /write: a project's backup, and importing a publisher
// template or an Overleaf export. Pure (fflate, MIT); nothing is sent.
import { unzipSync, zipSync } from "fflate";

export type ZipEntry = { path: string; data: Uint8Array };

export function zipFiles(entries: ZipEntry[]): Uint8Array {
  return zipSync(Object.fromEntries(entries.map((e) => [e.path, [e.data, { level: 6 }]])));
}

export function unzipFiles(bytes: Uint8Array): ZipEntry[] {
  return Object.entries(unzipSync(bytes))
    .filter(([path]) => !path.endsWith("/"))
    .map(([path, data]) => ({ path, data }));
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
