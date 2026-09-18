// Server-only: reads the journal index straight from disk at build time.
// Static export has no server at runtime, so journal detail pages must be
// fully prerendered — generateStaticParams and the page component both run
// during `next build`, where a filesystem read is correct (a fetch() to
// "/index/meta.json" would have nothing serving it at that point).
import fs from "node:fs";
import path from "node:path";
import type { JournalMeta } from "./match";

let cache: JournalMeta[] | null = null;

export function getAllJournals(): JournalMeta[] {
  if (cache) return cache;
  const filePath = path.join(process.cwd(), "public", "index", "meta.json");
  cache = JSON.parse(fs.readFileSync(filePath, "utf-8")) as JournalMeta[];
  return cache;
}
