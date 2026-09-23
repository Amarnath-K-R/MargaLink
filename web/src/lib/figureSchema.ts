// The privacy choke point for the figure generator. This is the ONLY
// function in the app permitted to build the payload that leaves the
// device for /api/figure — nothing else may hand-assemble one. It is to
// this feature what reviewGrounding.ts is to the AI review: the one file
// where a mistake becomes a privacy failure instead of a bug.
// figureSchema.selfcheck.ts proves what these comments claim, with planted
// sentinels, rather than asserting it.
//
// What leaves, always: column names and inferred types, the row count, the
// user's own request text, and the current figure description with every
// typed text field blanked and every group reference as "#n" (scrubSpec).
// What leaves only when the user ticks the labels box: the category labels
// of categorical columns with ≤ MAX_LEVELS_PER_COLUMN distinct values (a
// label is itself a value — a site name, a patient ID — hence opt-in, and
// hence the cap, which keeps ID-like columns out entirely).
// What never leaves: any cell value, sample rows, titles/axis labels/
// annotation text the user typed, Python tracebacks.
import { LIMITS, scrubSpec, validateFigureSpec, type FigureSpec } from "./figureSpec.ts";
import { DTYPES, type ColumnSchema, type Dataset, type Dtype } from "./spreadsheet.ts";

export const REQUEST_MAX_CHARS = 1000;
export const MAX_LEVELS_PER_COLUMN = 30;
export const MAX_LEVEL_COLUMNS = 12;
export const MAX_COLUMNS = 500;
export const MODES = ["spec", "hook"] as const;
export type FigureMode = (typeof MODES)[number];

export type FigurePayload = {
  columns: ColumnSchema[];
  rowCount: number;
  request: string;
  spec: FigureSpec | null;
  levels: Record<string, string[]> | null;
  mode: FigureMode;
};

// The labels the opt-in would add — also what the consent dialog lists, so
// the notice and the request can't disagree.
export function levelsToSend(dataset: Dataset): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const c of dataset.columns) {
    if (Object.keys(out).length >= MAX_LEVEL_COLUMNS) break;
    const lv = dataset.levels[c.name];
    if (c.dtype !== "categorical" || !lv || lv.length > MAX_LEVELS_PER_COLUMN) continue;
    if (lv.some((l) => l.length > LIMITS.text)) continue; // free text, not a category
    out[c.name] = [...lv];
  }
  return out;
}

// Builds a FRESH literal — never a spread of caller data — so adding a field
// to Dataset or FigureSpec can never silently widen what this sends. Group
// references are always sent as "#n", even when labels are opted in: the
// labels block is the only place a label appears.
export function buildFigurePayload(
  dataset: Dataset,
  spec: FigureSpec | null,
  request: string,
  opts: { sendLevels: boolean; mode: FigureMode },
): FigurePayload {
  return {
    columns: dataset.columns.map((c) => ({ name: c.name, dtype: c.dtype })),
    rowCount: dataset.rowCount,
    request: request.slice(0, REQUEST_MAX_CHARS),
    spec: spec ? scrubSpec(spec, dataset.levels, false) : null,
    levels: opts.sendLevels ? levelsToSend(dataset) : null,
    mode: opts.mode,
  };
}

const exactKeys = (o: object, keys: string[]) => {
  const k = Object.keys(o);
  return k.length === keys.length && k.every((x) => keys.includes(x));
};
const isShortString = (v: unknown, max = LIMITS.text) => typeof v === "string" && v.length <= max;

// Server-side re-validation of the shape a well-behaved client sends — so a
// tampered request can't smuggle extra keys (sample values, say) through the
// endpoint either. Exact key sets at every level; levels only for declared
// categorical columns, within the caps; the spec through the schema walk,
// which rejects unknown keys.
export function isValidFigurePayload(v: unknown): v is FigurePayload {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const p = v as Record<string, unknown>;
  if (!exactKeys(p, ["columns", "rowCount", "request", "spec", "levels", "mode"])) return false;

  if (!Array.isArray(p.columns) || p.columns.length === 0 || p.columns.length > MAX_COLUMNS) return false;
  for (const c of p.columns) {
    if (!c || typeof c !== "object" || !exactKeys(c, ["name", "dtype"])) return false;
    const { name, dtype } = c as Record<string, unknown>;
    if (!isShortString(name) || !DTYPES.includes(dtype as Dtype)) return false;
  }
  if (typeof p.rowCount !== "number" || !Number.isInteger(p.rowCount) || p.rowCount < 0) return false;
  if (!isShortString(p.request, REQUEST_MAX_CHARS)) return false;
  if (!MODES.includes(p.mode as FigureMode)) return false;
  if (p.spec !== null && typeof validateFigureSpec(p.spec) === "string") return false;

  if (p.levels !== null) {
    if (!p.levels || typeof p.levels !== "object" || Array.isArray(p.levels)) return false;
    const dtype = new Map((p.columns as ColumnSchema[]).map((c) => [c.name, c.dtype]));
    const entries = Object.entries(p.levels as Record<string, unknown>);
    if (entries.length > MAX_LEVEL_COLUMNS) return false;
    for (const [col, lv] of entries) {
      if (dtype.get(col) !== "categorical") return false;
      if (!Array.isArray(lv) || lv.length > MAX_LEVELS_PER_COLUMN || !lv.every((l) => isShortString(l))) return false;
    }
  }
  return true;
}
