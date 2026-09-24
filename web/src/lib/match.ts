// Journal matching: everything below runs against data already sitting in the
// browser (the index fetched once and cached). The only network calls this
// file makes are for public, non-personal static assets - never the paper.
import { loadManifest } from "./manifest.ts";

export type JournalMeta = {
  id: string;
  display_name: string;
  field: string | null;
  is_in_doaj: boolean | null;
  apc_usd: number | null; // OpenAlex, normalized to USD — used for the fee filter
  country_code: string | null;
  medline_indexed: boolean | null;
  publication_time_weeks: number | null;
  // detail-page-only, not used for matching/filtering
  issn_l?: string | null;
  works_count?: number | null;
  last_publication_year?: number | null;
  homepage_url?: string | null;
  host_organization_name?: string | null;
  license_type?: string | null;
  review_url?: string | null;
  doaj_apc_amount?: number | null; // DOAJ's own figure — may not be USD, display-only
  doaj_apc_currency?: string | null;
  // Whether this journal has a dedicated static /journal/[id] page (only the
  // top ~2,000 by output volume do, to stay under Cloudflare Pages' 20,000
  // file cap — see pipeline/build_index.py's mark_prerendered). Missing on
  // older builds (e.g. the Phase 0 interim demo), which predate this field
  // and had every journal prerendered — see isPrerendered() in journal-url.ts.
  prerendered?: boolean;
  // Matching v2 (absent on older builds — rank.ts treats row j as one centre).
  centres?: [number, number]; // [first row in index.bin, count]
  centre_topics?: string[]; // one topic label per centre ("" when unknown)
  topics?: [string, number][]; // recent-paper topic profile: [OpenAlex topic id, share], descending
  names?: string[]; // abbreviation + alternate titles, for the reference-list matcher
  h_index?: number | null;
  cited_2yr?: number | null;
  is_oa?: boolean | null;
};

export type MatchResult = JournalMeta & { score: number };

export type JournalFilters = {
  field?: string;
  openAccessOnly?: boolean;
  maxFeeUsd?: number;
  maxPublicationWeeks?: number;
  medlineOnly?: boolean;
};

export function quantizeInt8(unitVec: Float32Array): Int8Array {
  const out = new Int8Array(unitVec.length);
  for (let i = 0; i < unitVec.length; i++) {
    const v = Math.round(unitVec[i] * 127);
    out[i] = v > 127 ? 127 : v < -127 ? -127 : v;
  }
  return out;
}

/** Rank a set of candidate journal indices against one query vector, both int8. */
export function topK(
  queryInt8: Int8Array,
  indexInt8: Int8Array,
  dim: number,
  candidateIndices: number[],
  k: number
): { index: number; score: number }[] {
  const scored = candidateIndices.map((j) => {
    let dot = 0;
    const base = j * dim;
    for (let d = 0; d < dim; d++) dot += indexInt8[base + d] * queryInt8[d];
    return { index: j, score: dot };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, k);
}

export function passesFilters(m: JournalMeta, f: JournalFilters): boolean {
  if (f.field && m.field !== f.field) return false;
  if (f.openAccessOnly && !m.is_in_doaj) return false;
  if (f.maxFeeUsd !== undefined && (m.apc_usd == null || m.apc_usd > f.maxFeeUsd)) return false;
  if (
    f.maxPublicationWeeks !== undefined &&
    (m.publication_time_weeks == null || m.publication_time_weeks > f.maxPublicationWeeks)
  )
    return false;
  if (f.medlineOnly && !m.medline_indexed) return false;
  return true;
}

let metaCache: JournalMeta[] | null = null;
let indexCache: { int8: Int8Array; meta: JournalMeta[]; dim: number } | null = null;

/** meta.json only (~a few hundred KB) — for anything that just needs journal
 * info (browse/search, the field dropdown), without pulling the int8 vector
 * file (index.bin) that only matching/ranking actually needs. */
export async function loadMeta(): Promise<JournalMeta[]> {
  if (metaCache) return metaCache;
  const res = await fetch("/index/meta.json");
  if (!res.ok) throw new Error("failed to load journal list");
  metaCache = (await res.json()) as JournalMeta[];
  return metaCache;
}

async function loadIndex() {
  if (indexCache) return indexCache;
  const [manifest, meta, binRes] = await Promise.all([
    loadManifest(),
    loadMeta(),
    fetch("/index/index.bin"),
  ]);
  if (!binRes.ok) throw new Error("failed to load journal index");
  const buf = new Int8Array(await binRes.arrayBuffer());
  indexCache = { int8: buf, meta, dim: manifest.dim };
  return indexCache;
}

/** Distinct fields present in the index, sorted — for populating a filter dropdown. */
export async function getAvailableFields(): Promise<string[]> {
  const meta = await loadMeta();
  const fields = new Set<string>();
  for (const m of meta) if (m.field) fields.add(m.field);
  return Array.from(fields).sort();
}

export async function matchJournals(
  queryEmbedding: Float32Array,
  k = 10,
  filters: JournalFilters = {}
): Promise<MatchResult[]> {
  const { int8, meta, dim } = await loadIndex();
  const queryInt8 = quantizeInt8(queryEmbedding);
  const candidateIndices = meta
    .map((_, i) => i)
    .filter((i) => passesFilters(meta[i], filters));
  const ranked = topK(queryInt8, int8, dim, candidateIndices, k);
  return ranked.map(({ index, score }) => ({ ...meta[index], score }));
}
