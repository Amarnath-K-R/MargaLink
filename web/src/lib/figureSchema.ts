// The privacy choke point for the figure generator. This is the ONLY
// function in the app permitted to build the payload that leaves the
// device for /api/figure — nothing else may hand-assemble one. It is to
// this feature what reviewGrounding.ts is to the AI review: the one file
// where a mistake becomes a privacy failure instead of a bug.
// figureSchema.selfcheck.ts proves what this file's own doc comments
// claim, rather than asserting it.
//
// Three things are deliberately never included here, each of which would
// genuinely improve the generated code:
//   - cell values (the entire point);
//   - category LEVELS (a group label is itself a value — a site name, a
//     patient ID — not just its dtype);
//   - sample rows, ever, "to help the model."
// If a future change wants to send any of those, it has to touch this
// file's shape, which is exactly what isValidFigurePayload's exact-key-set
// check and the selfcheck's whitelist walk are built to make expensive to
// do by accident.
import { DTYPES, type ColumnSchema, type Dataset, type Dtype } from "./spreadsheet.ts";

export const CHART_TYPES = ["bar-error", "box", "scatter", "line", "histogram", "grouped-bar", "stacked-bar"] as const;
export type ChartType = (typeof CHART_TYPES)[number];

export const COLUMN_ROLES = ["x", "y", "group", "error"] as const;
export type ColumnRole = (typeof COLUMN_ROLES)[number];

export const NOTE_MAX_CHARS = 200;

export type FigureSpec = {
  chartType: ChartType;
  roles: Partial<Record<ColumnRole, string>>; // role -> column NAME
  note: string; // user-typed style note; "" if none
};

export type FigurePayload = {
  columns: ColumnSchema[];
  rowCount: number;
  chartType: ChartType;
  roles: Partial<Record<ColumnRole, string>>;
  note: string;
};

// Which roles a chart type accepts, which are required, and which column
// dtypes each role makes sense for. Drives three things off one table: the
// form's role dropdowns (only offer columns whose dtype fits), client-side
// validation, and the server's re-validation of the same spec.
export const CHART_ROLES: Record<ChartType, { role: ColumnRole; dtypes: Dtype[]; required: boolean }[]> = {
  "bar-error": [
    { role: "x", dtypes: ["categorical", "date"], required: true },
    { role: "y", dtypes: ["numeric"], required: true },
    { role: "error", dtypes: ["numeric"], required: false },
    { role: "group", dtypes: ["categorical"], required: false },
  ],
  box: [
    { role: "x", dtypes: ["categorical", "date"], required: true },
    { role: "y", dtypes: ["numeric"], required: true },
    { role: "group", dtypes: ["categorical"], required: false },
  ],
  scatter: [
    { role: "x", dtypes: ["numeric", "date"], required: true },
    { role: "y", dtypes: ["numeric"], required: true },
    { role: "group", dtypes: ["categorical"], required: false },
  ],
  line: [
    { role: "x", dtypes: ["numeric", "date"], required: true },
    { role: "y", dtypes: ["numeric"], required: true },
    { role: "group", dtypes: ["categorical"], required: false },
  ],
  histogram: [
    { role: "x", dtypes: ["numeric"], required: true },
    { role: "group", dtypes: ["categorical"], required: false },
  ],
  "grouped-bar": [
    { role: "x", dtypes: ["categorical", "date"], required: true },
    { role: "y", dtypes: ["numeric"], required: true },
    { role: "group", dtypes: ["categorical"], required: true },
  ],
  "stacked-bar": [
    { role: "x", dtypes: ["categorical", "date"], required: true },
    { role: "y", dtypes: ["numeric"], required: true },
    { role: "group", dtypes: ["categorical"], required: true },
  ],
};

// Builds a FRESH literal — deliberately never `{...dataset}` or any other
// spread of caller data — so adding a field to Dataset can never silently
// widen what this function sends.
export function buildFigurePayload(dataset: Dataset, spec: FigureSpec): FigurePayload {
  return {
    columns: dataset.columns.map((c) => ({ name: c.name, dtype: c.dtype })),
    rowCount: dataset.rowCount,
    chartType: spec.chartType,
    roles: { ...spec.roles },
    note: spec.note.slice(0, NOTE_MAX_CHARS),
  };
}

// Server-side re-validation of the same shape a well-behaved client would
// have sent — so a tampered/hand-crafted request can't smuggle extra keys
// (e.g. sample values) through the endpoint either. Rejects unknown keys
// at every level, not just checks the ones it expects are present.
export function isValidFigurePayload(v: unknown): v is FigurePayload {
  if (!v || typeof v !== "object") return false;
  const p = v as Record<string, unknown>;

  const allowedKeys = ["columns", "rowCount", "chartType", "roles", "note"];
  const keys = Object.keys(p);
  if (keys.length !== allowedKeys.length || !keys.every((k) => allowedKeys.includes(k))) return false;

  if (!Array.isArray(p.columns)) return false;
  const columnsValid = p.columns.every((c) => {
    if (!c || typeof c !== "object") return false;
    const cKeys = Object.keys(c);
    if (cKeys.length !== 2 || !cKeys.includes("name") || !cKeys.includes("dtype")) return false;
    const { name, dtype } = c as Record<string, unknown>;
    return typeof name === "string" && DTYPES.includes(dtype as Dtype);
  });
  if (!columnsValid) return false;

  if (typeof p.rowCount !== "number") return false;
  if (!CHART_TYPES.includes(p.chartType as ChartType)) return false;

  if (!p.roles || typeof p.roles !== "object") return false;
  const roleKeys = Object.keys(p.roles as object);
  const rolesValid = roleKeys.every(
    (k) => COLUMN_ROLES.includes(k as ColumnRole) && typeof (p.roles as Record<string, unknown>)[k] === "string"
  );
  if (!rolesValid) return false;

  return typeof p.note === "string";
}

// Human-readable validation of the actual chart choice against the actual
// columns — used both client-side (before the request is even built) and
// server-side (before the request is spent on Claude).
export function validateSpec(columns: ColumnSchema[], spec: FigureSpec): string | null {
  const dtypeByName = new Map(columns.map((c) => [c.name, c.dtype]));
  for (const def of CHART_ROLES[spec.chartType]) {
    const columnName = spec.roles[def.role];
    if (!columnName) {
      if (def.required) return `Pick a column for "${def.role}".`;
      continue;
    }
    const dtype = dtypeByName.get(columnName);
    if (dtype === undefined) return `Column "${columnName}" doesn't exist in this dataset.`;
    if (!def.dtypes.includes(dtype)) {
      return `"${columnName}" is ${dtype}, but ${def.role} needs ${def.dtypes.join(" or ")}.`;
    }
  }
  return null;
}
