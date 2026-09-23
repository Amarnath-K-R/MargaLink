// The FigureSpec: the one artifact the figure studio edits, Claude proposes,
// and web/public/figurelib.py renders. Pure (no window/fetch), so it is
// imported by functions/api/figure.ts too.
//
// FIGURE_SPEC_SCHEMA is written once and used three ways:
//   1. the input_schema of the strict tool Claude answers through (strict
//      mode: every property required, additionalProperties false, nullable
//      via ["type","null"], no min/max/length keywords);
//   2. what validateFigureSpec() walks, on the client and on the server;
//   3. what scrubSpec() walks to build the copy that may leave the device —
//      so a stray local key can never ride along.
// Caps that strict mode can't express (array lengths, string lengths,
// ranges) are a post-pass in validateFigureSpec.
import type { ColumnSchema, Dtype } from "./spreadsheet.ts";

export const FAMILIES = ["bar", "box", "violin", "strip", "scatter", "line", "histogram", "heatmap", "forest", "km"] as const;
export const ROLES = ["x", "y", "group", "error", "lower", "upper", "value", "time", "event"] as const;
export const STYLE_PRESETS = ["nature", "science", "medical", "ieee", "minimal"] as const;
export const SIZE_PRESETS = ["single", "double", "custom"] as const;
export const PALETTES = ["okabe-ito", "tol-bright", "tol-muted", "viridis", "grey", "custom"] as const;
export const ERROR_TYPES = ["none", "sd", "sem", "ci95", "column"] as const;
export const STATS = ["mean", "median", "sum", "count"] as const;
export const ORDER_MODES = ["as-is", "alpha", "value-asc", "value-desc", "explicit"] as const;
export const TICK_FORMATS = ["auto", "plain", "percent", "sci", "thousands"] as const;
export const LAYER_KINDS = ["points", "mean", "median", "regression", "n"] as const;
export const ANNOTATION_KINDS = ["text", "arrow", "hline", "vline", "hspan", "vspan"] as const;
export const TESTS = ["auto", "t", "welch", "mannwhitney", "wilcoxon", "anova", "kruskal", "pearson", "spearman", "logrank"] as const;
export const PAIRS = ["all", "vs-first", "vs-reference", "explicit"] as const;
export const P_DISPLAY = ["stars", "p", "both"] as const;

export type Family = (typeof FAMILIES)[number];
export type Role = (typeof ROLES)[number];
export type StylePreset = (typeof STYLE_PRESETS)[number];
export type SizePreset = (typeof SIZE_PRESETS)[number];
export type Palette = (typeof PALETTES)[number];
export type ErrorType = (typeof ERROR_TYPES)[number];
export type Stat = (typeof STATS)[number];
export type OrderMode = (typeof ORDER_MODES)[number];
export type TickFormat = (typeof TICK_FORMATS)[number];
export type LayerKind = (typeof LAYER_KINDS)[number];
export type AnnotationKind = (typeof ANNOTATION_KINDS)[number];
export type Test = (typeof TESTS)[number];
export type Pairs = (typeof PAIRS)[number];
export type PDisplay = (typeof P_DISPLAY)[number];

// A group reference. "#3" = the 4th level of the category column in
// first-appearance order (label-agnostic, always allowed). Anything else is a
// literal label: valid only if it's one of that column's levels, and rewritten
// to "#n" by scrubSpec before sending unless the user opted in to labels.
export type GroupRef = string;

export type Axis = { label: string; unit: string; min: number | null; max: number | null; log: boolean; tickFormat: TickFormat };
export type Layer = { kind: LayerKind; ci: boolean; alpha: number | null; size: number | null; jitter: number | null };
export type Annotation = {
  kind: AnnotationKind;
  text: string;
  x: number | null;
  y: number | null;
  x2: number | null;
  y2: number | null;
  xGroup: GroupRef | null;
};
export type PanelStats = { test: Test | null; pairs: Pairs; explicit: { a: GroupRef; b: GroupRef }[]; display: PDisplay; reference: GroupRef | null };
export type Panel = {
  title: string;
  family: Family;
  roles: Record<Role, string | null>;
  x: Axis;
  y: Axis;
  stat: Stat;
  errorType: ErrorType;
  stacked: boolean;
  horizontal: boolean;
  bins: number | null;
  order: { mode: OrderMode; explicit: GroupRef[] };
  layers: Layer[];
  annotations: Annotation[];
  stats: PanelStats;
  atRiskTable: boolean;
  censorTicks: boolean;
  colSpan: number;
  legend: boolean;
};
export type Layout = { rows: number; cols: number; letters: boolean; sharedLegend: boolean };
export type FigureSpec = {
  version: 1;
  style: StylePreset;
  size: SizePreset;
  widthMm: number | null;
  heightMm: number | null;
  palette: Palette;
  colors: string[];
  layout: Layout;
  panels: Panel[];
};

// --- The strict JSON schema --------------------------------------------------

type Schema = {
  type: string | string[];
  enum?: readonly (string | null)[];
  const?: number;
  properties?: Record<string, Schema>;
  required?: string[];
  additionalProperties?: false;
  items?: Schema;
};
const obj = (properties: Record<string, Schema>): Schema => ({
  type: "object",
  additionalProperties: false,
  required: Object.keys(properties),
  properties,
});
const str: Schema = { type: "string" };
const bool: Schema = { type: "boolean" };
const nullableNumber: Schema = { type: ["number", "null"] };
const nullableString: Schema = { type: ["string", "null"] };
const oneOf = (values: readonly string[]): Schema => ({ type: "string", enum: values });
const arrayOf = (items: Schema): Schema => ({ type: "array", items });

const AXIS_SCHEMA = obj({
  label: str,
  unit: str,
  min: nullableNumber,
  max: nullableNumber,
  log: bool,
  tickFormat: oneOf(TICK_FORMATS),
});
const PANEL_SCHEMA = obj({
  title: str,
  family: oneOf(FAMILIES),
  roles: obj(Object.fromEntries(ROLES.map((r) => [r, nullableString]))),
  x: AXIS_SCHEMA,
  y: AXIS_SCHEMA,
  stat: oneOf(STATS),
  errorType: oneOf(ERROR_TYPES),
  stacked: bool,
  horizontal: bool,
  bins: { type: ["integer", "null"] },
  order: obj({ mode: oneOf(ORDER_MODES), explicit: arrayOf(str) }),
  layers: arrayOf(obj({ kind: oneOf(LAYER_KINDS), ci: bool, alpha: nullableNumber, size: nullableNumber, jitter: nullableNumber })),
  annotations: arrayOf(
    obj({
      kind: oneOf(ANNOTATION_KINDS),
      text: str,
      x: nullableNumber,
      y: nullableNumber,
      x2: nullableNumber,
      y2: nullableNumber,
      xGroup: nullableString,
    })
  ),
  stats: obj({
    test: { type: ["string", "null"], enum: [...TESTS, null] },
    pairs: oneOf(PAIRS),
    explicit: arrayOf(obj({ a: str, b: str })),
    display: oneOf(P_DISPLAY),
    reference: nullableString,
  }),
  atRiskTable: bool,
  censorTicks: bool,
  colSpan: { type: "integer" },
  legend: bool,
});
export const FIGURE_SPEC_SCHEMA: Schema = obj({
  version: { type: "integer", const: 1 },
  style: oneOf(STYLE_PRESETS),
  size: oneOf(SIZE_PRESETS),
  widthMm: nullableNumber,
  heightMm: nullableNumber,
  palette: oneOf(PALETTES),
  colors: arrayOf(str),
  layout: obj({ rows: { type: "integer" }, cols: { type: "integer" }, letters: bool, sharedLegend: bool }),
  panels: arrayOf(PANEL_SCHEMA),
});

// Drift guards: each fails to typecheck if its type gains a key the list
// doesn't have; the selfcheck asserts each list equals the schema's keys.
export const SPEC_KEYS: Record<keyof FigureSpec, true> = {
  version: true, style: true, size: true, widthMm: true, heightMm: true, palette: true, colors: true, layout: true, panels: true,
};
export const PANEL_KEYS: Record<keyof Panel, true> = {
  title: true, family: true, roles: true, x: true, y: true, stat: true, errorType: true, stacked: true, horizontal: true,
  bins: true, order: true, layers: true, annotations: true, stats: true, atRiskTable: true, censorTicks: true, colSpan: true, legend: true,
};
export const AXIS_KEYS: Record<keyof Axis, true> = { label: true, unit: true, min: true, max: true, log: true, tickFormat: true };
export const ANNOTATION_KEYS: Record<keyof Annotation, true> = { kind: true, text: true, x: true, y: true, x2: true, y2: true, xGroup: true };
export const STATS_KEYS: Record<keyof PanelStats, true> = { test: true, pairs: true, explicit: true, display: true, reference: true };
export const LAYER_KEYS: Record<keyof Layer, true> = { kind: true, ci: true, alpha: true, size: true, jitter: true };
export const PANEL_SCHEMA_FOR_TESTS = PANEL_SCHEMA;

// --- Caps strict mode can't express ------------------------------------------

export const LIMITS = {
  panels: 6,
  cells: 6, // rows x cols
  layers: 4,
  annotations: 12,
  explicit: 12,
  colors: 12,
  text: 200,
  bins: [2, 200] as const,
  mm: [30, 250] as const,
};
const HEX = /^#[0-9a-fA-F]{6}$/;

// --- Validation ---------------------------------------------------------------

function typeOf(v: unknown): string {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  if (typeof v === "number") return Number.isInteger(v) ? "integer" : "number";
  return typeof v;
}

function walk(v: unknown, schema: Schema, path: string): string | null {
  const allowed = Array.isArray(schema.type) ? schema.type : [schema.type];
  const t = typeOf(v);
  const ok = allowed.includes(t) || (t === "integer" && allowed.includes("number"));
  if (!ok) return `${path}: expected ${allowed.join(" or ")}`;
  if (schema.enum && !schema.enum.includes(v as string | null)) return `${path}: not one of ${schema.enum.filter((e) => e !== null).join(", ")}`;
  if (schema.const !== undefined && v !== schema.const) return `${path}: must be ${schema.const}`;
  if (t === "number" && !Number.isFinite(v as number)) return `${path}: must be a finite number`;
  if (t === "object" && schema.properties) {
    const o = v as Record<string, unknown>;
    // Object.hasOwn, not `in`: "constructor" or "__proto__" must not pass as schema keys.
    for (const key of Object.keys(o)) if (!Object.hasOwn(schema.properties, key)) return `${path}.${key}: unexpected key`;
    for (const key of schema.required ?? []) {
      if (!Object.hasOwn(o, key)) return `${path}.${key}: missing`;
      const err = walk(o[key], schema.properties[key], `${path}.${key}`);
      if (err) return err;
    }
  }
  if (t === "array" && schema.items) {
    const arr = v as unknown[];
    for (let i = 0; i < arr.length; i++) {
      const err = walk(arr[i], schema.items, `${path}[${i}]`);
      if (err) return err;
    }
  }
  return null;
}

// Panels placed in reading order honouring colSpan — the same algorithm as
// figurelib.build_axes, so a spec that validates here always lays out there.
export function panelCellsFit(spec: FigureSpec): boolean {
  const { rows, cols } = spec.layout;
  let r = 0;
  let c = 0;
  for (const p of spec.panels) {
    const span = Math.max(1, Math.min(p.colSpan, cols));
    if (c + span > cols) {
      r += 1;
      c = 0;
    }
    if (r >= rows) return false;
    c += span;
    if (c >= cols) {
      r += 1;
      c = 0;
    }
  }
  return true;
}

function capsError(spec: FigureSpec): string | null {
  const text = (s: string, path: string) => (s.length > LIMITS.text ? `${path}: longer than ${LIMITS.text} characters` : null);
  const { rows, cols } = spec.layout;
  if (spec.panels.length < 1 || spec.panels.length > LIMITS.panels) return `panels: between 1 and ${LIMITS.panels}`;
  if (rows < 1 || cols < 1 || rows * cols > LIMITS.cells) return `layout: rows x cols must be between 1 and ${LIMITS.cells}`;
  if (!panelCellsFit(spec)) return "layout: more panels than the grid has cells";
  if (spec.colors.length > LIMITS.colors || spec.colors.some((c) => !HEX.test(c))) return `colors: up to ${LIMITS.colors} hex colors like #1f77b4`;
  for (const [key, v] of [["widthMm", spec.widthMm], ["heightMm", spec.heightMm]] as const) {
    if (v !== null && (v < LIMITS.mm[0] || v > LIMITS.mm[1])) return `${key}: between ${LIMITS.mm[0]} and ${LIMITS.mm[1]} mm`;
  }
  for (const [i, p] of spec.panels.entries()) {
    const at = `panels[${i}]`;
    const err =
      text(p.title, `${at}.title`) ??
      text(p.x.label, `${at}.x.label`) ??
      text(p.x.unit, `${at}.x.unit`) ??
      text(p.y.label, `${at}.y.label`) ??
      text(p.y.unit, `${at}.y.unit`);
    if (err) return err;
    if (p.colSpan < 1 || p.colSpan > cols) return `${at}.colSpan: between 1 and ${cols}`;
    if (p.bins !== null && (p.bins < LIMITS.bins[0] || p.bins > LIMITS.bins[1])) return `${at}.bins: between 2 and 200`;
    if (p.layers.length > LIMITS.layers) return `${at}.layers: at most ${LIMITS.layers}`;
    if (p.annotations.length > LIMITS.annotations) return `${at}.annotations: at most ${LIMITS.annotations}`;
    if (p.order.explicit.length > LIMITS.explicit || p.stats.explicit.length > LIMITS.explicit) return `${at}: at most ${LIMITS.explicit} explicit groups or pairs`;
    for (const [j, a] of p.annotations.entries()) {
      const e = text(a.text, `${at}.annotations[${j}].text`);
      if (e) return e;
    }
    const refs = [...p.order.explicit, ...p.stats.explicit.flatMap((e) => [e.a, e.b]), p.stats.reference, ...p.annotations.map((a) => a.xGroup)];
    if (refs.some((r) => r !== null && r.length > LIMITS.text)) return `${at}: a group reference is too long`;
  }
  return null;
}

// Returns the spec (typed) or a message naming the first problem's path.
export function validateFigureSpec(v: unknown): FigureSpec | string {
  const err = walk(v, FIGURE_SPEC_SCHEMA, "spec");
  if (err) return err;
  return capsError(v as FigureSpec) ?? (v as FigureSpec);
}

// --- Bindings against the dataset's columns -----------------------------------

type RoleRule = { role: Role; dtypes: Dtype[]; required: boolean };
const cat: Dtype[] = ["categorical"];
const catOrDate: Dtype[] = ["categorical", "date"];
const num: Dtype[] = ["numeric"];
const numOrDate: Dtype[] = ["numeric", "date"];
const CATEGORY_FAMILY: RoleRule[] = [
  { role: "x", dtypes: catOrDate, required: true },
  { role: "y", dtypes: num, required: true },
  { role: "group", dtypes: cat, required: false },
];
export const FAMILY_ROLES: Record<Family, RoleRule[]> = {
  bar: [...CATEGORY_FAMILY, { role: "error", dtypes: num, required: false }],
  box: CATEGORY_FAMILY,
  // figurelib draws violins and strips per x level only — no group split.
  violin: CATEGORY_FAMILY.filter((r) => r.role !== "group"),
  strip: CATEGORY_FAMILY.filter((r) => r.role !== "group"),
  scatter: [
    { role: "x", dtypes: numOrDate, required: true },
    { role: "y", dtypes: num, required: true },
    { role: "group", dtypes: cat, required: false },
  ],
  line: [
    { role: "x", dtypes: numOrDate, required: true },
    { role: "y", dtypes: num, required: true },
    { role: "group", dtypes: cat, required: false },
  ],
  histogram: [
    { role: "x", dtypes: num, required: true },
    { role: "group", dtypes: cat, required: false },
  ],
  heatmap: [
    { role: "x", dtypes: catOrDate, required: false },
    { role: "y", dtypes: catOrDate, required: false },
    { role: "value", dtypes: num, required: false },
  ],
  forest: [
    { role: "x", dtypes: num, required: true },
    { role: "y", dtypes: catOrDate, required: true },
    { role: "lower", dtypes: num, required: true },
    { role: "upper", dtypes: num, required: true },
    { role: "group", dtypes: cat, required: false },
  ],
  km: [
    { role: "time", dtypes: num, required: true },
    { role: "event", dtypes: num, required: true },
    { role: "group", dtypes: cat, required: false },
  ],
};

// What public/figurelib.py accepts per family (apply_layers / draw_stats) —
// used by the panel editor to offer only these, and below to refuse the rest.
export const CATEGORY_FAMILIES: readonly Family[] = ["bar", "box", "violin", "strip"];
export function layersFor(f: Family): LayerKind[] {
  return CATEGORY_FAMILIES.includes(f) ? ["points", "mean", "median", "n"] : f === "scatter" || f === "line" ? ["regression"] : [];
}
export function testsFor(f: Family): Test[] {
  if (CATEGORY_FAMILIES.includes(f)) return ["auto", "t", "welch", "mannwhitney", "wilcoxon", "anova", "kruskal"];
  if (f === "scatter" || f === "line" || f === "heatmap") return ["pearson", "spearman"];
  return f === "km" ? ["logrank"] : [];
}

// Coordinates each annotation kind needs (x may come from xGroup instead).
const ANNOTATION_NEEDS: Record<AnnotationKind, ("x" | "y" | "x2" | "y2")[]> = {
  hline: ["y"],
  vline: ["x"],
  hspan: ["y", "y2"],
  vspan: ["x", "x2"],
  text: ["x", "y"],
  arrow: ["x", "y", "x2", "y2"],
};

// A plain message for the first binding or combination that can't work, or null.
export function checkSpecAgainstColumns(columns: ColumnSchema[], spec: FigureSpec): string | null {
  const dtypeOf = new Map(columns.map((c) => [c.name, c.dtype]));
  for (const [i, p] of spec.panels.entries()) {
    const where = spec.panels.length > 1 ? `Panel ${i + 1}: ` : "";
    for (const rule of FAMILY_ROLES[p.family]) {
      const name = p.roles[rule.role];
      if (!name) {
        if (rule.required) return `${where}choose a column for "${rule.role}".`;
        continue;
      }
      const dtype = dtypeOf.get(name);
      if (dtype === undefined) return `${where}column "${name}" doesn't exist in this dataset.`;
      if (!rule.dtypes.includes(dtype)) return `${where}"${name}" is ${dtype}, but ${rule.role} needs ${rule.dtypes.join(" or ")}.`;
    }
    if (p.family === "heatmap") {
      const set = [p.roles.x, p.roles.y, p.roles.value].filter(Boolean).length;
      if (set !== 0 && set !== 3) return `${where}a heatmap needs all of x, y and value — or none, for a correlation matrix.`;
    }
    const layer = p.layers.find((l) => !layersFor(p.family).includes(l.kind));
    if (layer) return `${where}a ${p.family} panel can't have a "${layer.kind}" overlay.`;
    if (p.stats.test && !testsFor(p.family).includes(p.stats.test)) return `${where}a ${p.family} panel can't use the ${p.stats.test} test.`;
    const horizontalBar = p.family === "bar" && p.horizontal;
    if (horizontalBar && (p.layers.length || p.stats.test || p.annotations.some((a) => a.xGroup))) {
      return `${where}overlays, significance tests and group-anchored notes aren't available on horizontal bars.`;
    }
    const numericNeeded = p.stats.test === "pearson" || p.stats.test === "spearman" || p.layers.some((l) => l.kind === "regression");
    if (numericNeeded && (p.family === "scatter" || p.family === "line") && p.roles.x && dtypeOf.get(p.roles.x) === "date") {
      return `${where}correlation and regression need a numeric x, not a date.`;
    }
    for (const [j, a] of p.annotations.entries()) {
      const missing = ANNOTATION_NEEDS[a.kind].filter((k) => a[k] === null && !(k === "x" && a.xGroup));
      if (missing.length) return `${where}note ${j + 1} (${a.kind}) needs ${missing.join(", ")}.`;
    }
  }
  return null;
}

// --- Group references ---------------------------------------------------------

// The category column a panel's group references point into.
export function refColumn(p: Panel): string | null {
  return p.family === "forest" ? p.roles.y : p.roles.x;
}

const REF = /^#(\d+)$/;

// A literal → "#n" when it's a level of the column; "#n" passes through;
// anything else (a typo, or a label the column doesn't have) → null.
function toIndexRef(ref: string, levels: string[] | null | undefined): string | null {
  if (REF.test(ref)) return ref;
  const i = levels ? levels.indexOf(ref) : -1;
  return i >= 0 ? `#${i}` : null;
}

// Every group reference in a panel, with where it sits.
function groupRefs(p: Panel): string[] {
  return [
    ...p.order.explicit,
    ...p.stats.explicit.flatMap((e) => [e.a, e.b]),
    ...(p.stats.reference === null ? [] : [p.stats.reference]),
    ...p.annotations.flatMap((a) => (a.xGroup === null ? [] : [a.xGroup])),
  ];
}

// The label gate for Claude's output: a group reference must be "#n" — or,
// only when labels were sent, one of the labels sent for that column. So a
// spec can never carry a label Claude wasn't given (a guessed one would be a
// hallucination at best, a value at worst).
export function checkLabels(spec: FigureSpec, levels: Record<string, string[]> | null): string | null {
  for (const [i, p] of spec.panels.entries()) {
    const col = refColumn(p);
    for (const ref of groupRefs(p)) {
      if (REF.test(ref)) continue;
      if (levels && col && levels[col]?.includes(ref)) continue;
      return `Panel ${i + 1} refers to a group label it wasn't given.`;
    }
  }
  return null;
}

// --- The outbound copy --------------------------------------------------------

function pick(v: unknown, schema: Schema): unknown {
  if (v === null || typeof v !== "object") return v;
  if (Array.isArray(v)) return schema.items ? v.map((x) => pick(x, schema.items!)) : [];
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(schema.properties ?? {})) out[key] = pick((v as Record<string, unknown>)[key], schema.properties![key]);
  return out;
}

// The copy of a spec that may go to Claude: only schema-known keys (walks the
// schema, so a stray local field can't ride along); every free-text field the
// user typed blanked (titles, axis labels and units, annotation text — only
// the user's explicit request text is ever sent); every literal group label
// rewritten to "#n" unless the user opted in to sending labels.
export function scrubSpec(spec: FigureSpec, levels: Record<string, string[] | null>, sendLevels: boolean): FigureSpec {
  const copy = pick(spec, FIGURE_SPEC_SCHEMA) as FigureSpec;
  for (const p of copy.panels) {
    p.title = "";
    p.x = { ...p.x, label: "", unit: "" };
    p.y = { ...p.y, label: "", unit: "" };
    p.annotations = p.annotations.map((a) => ({ ...a, text: "" }));
    if (sendLevels) continue;
    const col = refColumn(p);
    const lv = col ? levels[col] : null;
    p.order.explicit = p.order.explicit.map((r) => toIndexRef(r, lv)).filter((r): r is string => r !== null);
    p.stats.explicit = p.stats.explicit
      .map((e) => ({ a: toIndexRef(e.a, lv), b: toIndexRef(e.b, lv) }))
      .filter((e): e is { a: string; b: string } => e.a !== null && e.b !== null);
    p.stats.reference = p.stats.reference === null ? null : toIndexRef(p.stats.reference, lv);
    p.annotations = p.annotations.map((a) => ({ ...a, xGroup: a.xGroup === null ? null : toIndexRef(a.xGroup, lv) }));
  }
  return copy;
}

// Merges Claude's spec with the user's local text: a text field Claude
// returns empty keeps the user's text; a non-empty one wins. Local text is
// matched to a returned panel by what it shows (family + columns), never by
// position — "drop the first panel" must not move panel a's title onto b.
export function mergeTextFields(local: FigureSpec, returned: FigureSpec): FigureSpec {
  const keep = (mine: string | undefined, theirs: string) => (theirs === "" && mine !== undefined ? mine : theirs);
  const identity = (p: Panel) => JSON.stringify([p.family, ROLES.map((r) => p.roles[r])]);
  const unused = [...local.panels];
  return {
    ...returned,
    panels: returned.panels.map((p) => {
      const at = unused.findIndex((lp) => identity(lp) === identity(p));
      const lp = at >= 0 ? unused.splice(at, 1)[0] : undefined;
      return {
        ...p,
        title: keep(lp?.title, p.title),
        x: { ...p.x, label: keep(lp?.x.label, p.x.label), unit: keep(lp?.x.unit, p.x.unit) },
        y: { ...p.y, label: keep(lp?.y.label, p.y.label), unit: keep(lp?.y.unit, p.y.unit) },
        annotations: p.annotations.map((a, j) => ({ ...a, text: keep(lp?.annotations[j]?.kind === a.kind ? lp.annotations[j].text : undefined, a.text) })),
      };
    }),
  };
}

// --- Defaults -----------------------------------------------------------------

const defaultAxis = (): Axis => ({ label: "", unit: "", min: null, max: null, log: false, tickFormat: "auto" });

export function defaultPanel(family: Family): Panel {
  return {
    title: "",
    family,
    roles: Object.fromEntries(ROLES.map((r) => [r, null])) as Record<Role, string | null>,
    x: defaultAxis(),
    y: defaultAxis(),
    stat: "mean",
    errorType: family === "bar" ? "sem" : "none",
    stacked: false,
    horizontal: false,
    bins: null,
    order: { mode: "as-is", explicit: [] },
    layers: [],
    annotations: [],
    stats: { test: null, pairs: "all", explicit: [], display: "stars", reference: null },
    atRiskTable: family === "km",
    censorTicks: true,
    colSpan: 1,
    legend: true,
  };
}

export const DEFAULT_SPEC: FigureSpec = {
  version: 1,
  style: "nature",
  size: "single",
  widthMm: null,
  heightMm: null,
  palette: "okabe-ito",
  colors: [],
  layout: { rows: 1, cols: 1, letters: true, sharedLegend: false },
  panels: [defaultPanel("bar")],
};
