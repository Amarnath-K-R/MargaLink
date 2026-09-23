// Runnable check for figureSpec.ts — the strict schema, its validator, the
// column checks, and the outbound scrub. Run directly:
//   node src/lib/figureSpec.selfcheck.ts
import assert from "node:assert/strict";
import {
  AXIS_KEYS,
  ANNOTATION_KEYS,
  DEFAULT_SPEC,
  FAMILIES,
  FIGURE_SPEC_SCHEMA,
  LAYER_KEYS,
  PANEL_KEYS,
  PANEL_SCHEMA_FOR_TESTS,
  SPEC_KEYS,
  STATS_KEYS,
  TESTS,
  TICK_FORMATS,
  checkLabels,
  checkSpecAgainstColumns,
  defaultPanel,
  mergeTextFields,
  scrubSpec,
  validateFigureSpec,
  type FigureSpec,
} from "./figureSpec.ts";
import type { ColumnSchema } from "./spreadsheet.ts";

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
const ok = (v: unknown) => typeof validateFigureSpec(v) !== "string";

// 1. defaults validate, for every family
assert.ok(ok(DEFAULT_SPEC), String(validateFigureSpec(DEFAULT_SPEC)));
for (const f of FAMILIES) {
  const s = clone(DEFAULT_SPEC);
  s.panels = [defaultPanel(f)];
  assert.ok(ok(s), `${f}: ${validateFigureSpec(s)}`);
}

// 2. unknown keys, wrong enums, and caps are rejected with a path
{
  const s = clone(DEFAULT_SPEC) as unknown as { panels: Record<string, unknown>[] };
  s.panels[0].sampleRows = [["x"]];
  assert.match(String(validateFigureSpec(s)), /panels\[0\]\.sampleRows: unexpected key/);
  const e = clone(DEFAULT_SPEC);
  (e.panels[0] as unknown as { family: string }).family = "pie";
  assert.match(String(validateFigureSpec(e)), /family: not one of/);
  const n = clone(DEFAULT_SPEC) as unknown as { layout: Record<string, unknown> };
  delete n.layout.letters;
  assert.match(String(validateFigureSpec(n)), /layout\.letters: missing/);
  const many = clone(DEFAULT_SPEC);
  many.layout = { rows: 2, cols: 4, letters: true, sharedLegend: false };
  assert.match(String(validateFigureSpec(many)), /rows x cols/);
  const seven = clone(DEFAULT_SPEC);
  seven.layout = { rows: 2, cols: 3, letters: true, sharedLegend: false };
  seven.panels = Array.from({ length: 7 }, () => defaultPanel("bar"));
  assert.match(String(validateFigureSpec(seven)), /panels: between 1 and 6/);
  const overflow = clone(DEFAULT_SPEC);
  overflow.layout = { rows: 1, cols: 2, letters: true, sharedLegend: false };
  overflow.panels = [defaultPanel("bar"), defaultPanel("box"), defaultPanel("scatter")];
  assert.match(String(validateFigureSpec(overflow)), /more panels than the grid has cells/);
  const notes = clone(DEFAULT_SPEC);
  notes.panels[0].annotations = Array.from({ length: 13 }, () => ({ kind: "text" as const, text: "", x: 0, y: 0, x2: null, y2: null, xGroup: null }));
  assert.match(String(validateFigureSpec(notes)), /annotations: at most 12/);
  const color = clone(DEFAULT_SPEC);
  color.colors = ["red"];
  assert.match(String(validateFigureSpec(color)), /hex colors/);
  const inf = clone(DEFAULT_SPEC) as unknown as { widthMm: unknown };
  inf.widthMm = "89";
  assert.match(String(validateFigureSpec(inf)), /widthMm: expected number or null/);
}

// 3. the schema is strict-mode legal, and the drift guards equal its keys
{
  const forbidden = ["minimum", "maximum", "minLength", "maxLength", "minItems", "maxItems", "anyOf", "oneOf", "allOf", "pattern"];
  const visit = (node: unknown, path: string) => {
    if (!node || typeof node !== "object") return;
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      assert.ok(!forbidden.includes(k), `${path}.${k} is not allowed in strict mode`);
      visit(v, `${path}.${k}`);
    }
    const n = node as { type?: unknown; additionalProperties?: unknown; properties?: Record<string, unknown>; required?: string[] };
    if (n.type === "object") {
      assert.equal(n.additionalProperties, false, `${path}: additionalProperties must be false`);
      assert.deepEqual([...(n.required ?? [])].sort(), Object.keys(n.properties ?? {}).sort(), `${path}: every property required`);
    }
  };
  visit(FIGURE_SPEC_SCHEMA, "schema");
  const keys = (o: object) => Object.keys(o).sort();
  const props = (s: { properties?: Record<string, unknown> }) => keys(s.properties ?? {});
  const panel = PANEL_SCHEMA_FOR_TESTS as unknown as { properties: Record<string, { properties?: Record<string, unknown>; items?: { properties?: Record<string, unknown> } }> };
  assert.deepEqual(props(FIGURE_SPEC_SCHEMA), keys(SPEC_KEYS));
  assert.deepEqual(props(panel), keys(PANEL_KEYS));
  assert.deepEqual(props(panel.properties.x), keys(AXIS_KEYS));
  assert.deepEqual(props(panel.properties.annotations.items!), keys(ANNOTATION_KEYS));
  assert.deepEqual(props(panel.properties.layers.items!), keys(LAYER_KEYS));
  assert.deepEqual(props(panel.properties.stats), keys(STATS_KEYS));
  const statsSchema = panel.properties.stats as unknown as { properties: { test: { enum: unknown[] } } };
  assert.deepEqual(statsSchema.properties.test.enum, [...TESTS, null]);
  const axis = panel.properties.x as unknown as { properties: { tickFormat: { enum: unknown[] } } };
  assert.deepEqual(axis.properties.tickFormat.enum, [...TICK_FORMATS]);
}

// 4. bindings against the dataset's columns
const COLUMNS: ColumnSchema[] = [
  { name: "arm", dtype: "categorical" },
  { name: "change", dtype: "numeric" },
  { name: "dose", dtype: "numeric" },
  { name: "study", dtype: "categorical" },
  { name: "hr", dtype: "numeric" },
  { name: "lo", dtype: "numeric" },
  { name: "hi", dtype: "numeric" },
  { name: "months", dtype: "numeric" },
  { name: "died", dtype: "categorical" },
];
const withPanel = (family: (typeof FAMILIES)[number], roles: Record<string, string>) => {
  const s = clone(DEFAULT_SPEC);
  s.panels = [defaultPanel(family)];
  Object.assign(s.panels[0].roles, roles);
  return s;
};
assert.equal(checkSpecAgainstColumns(COLUMNS, withPanel("bar", { x: "arm", y: "change" })), null);
assert.match(String(checkSpecAgainstColumns(COLUMNS, withPanel("bar", { x: "dose", y: "change" }))), /"dose" is numeric, but x needs categorical or date/);
assert.match(String(checkSpecAgainstColumns(COLUMNS, withPanel("forest", { x: "hr", y: "study", upper: "hi" }))), /choose a column for "lower"/);
assert.match(String(checkSpecAgainstColumns(COLUMNS, withPanel("km", { time: "months", event: "died" }))), /"died" is categorical, but event needs numeric/);
assert.match(String(checkSpecAgainstColumns(COLUMNS, withPanel("bar", { x: "nope", y: "change" }))), /column "nope" doesn't exist/);
assert.equal(checkSpecAgainstColumns(COLUMNS, withPanel("heatmap", {})), null, "heatmap with no roles = correlation matrix");
assert.match(String(checkSpecAgainstColumns(COLUMNS, withPanel("heatmap", { x: "arm" }))), /all of x, y and value/);

// 5. the outbound scrub: known keys only, typed text blanked, literal labels -> "#n" unless opted in
{
  const SENTINEL = "ZZQQ-SENTINEL-0042";
  const s: FigureSpec = withPanel("bar", { x: "arm", y: "change" });
  const p = s.panels[0];
  p.title = `Title ${SENTINEL}`;
  p.x.label = `X ${SENTINEL}`;
  p.y.unit = SENTINEL;
  p.order = { mode: "explicit", explicit: ["High", "#0", "Typo"] };
  p.stats = { test: "welch", pairs: "explicit", explicit: [{ a: "Placebo", b: "High" }, { a: "Typo", b: "#1" }], display: "stars", reference: "Low" };
  p.annotations = [{ kind: "text", text: SENTINEL, x: null, y: 1, x2: null, y2: null, xGroup: "Low" }];
  (p as unknown as Record<string, unknown>).localOnly = SENTINEL;
  const levels = { arm: ["Placebo", "Low", "High"] };

  const out = scrubSpec(s, levels, false);
  const json = JSON.stringify(out);
  assert.ok(!json.includes(SENTINEL), "no typed text or local key leaves");
  for (const label of ["Placebo", "Low", "High", "Typo"]) assert.ok(!json.includes(`"${label}"`), `label ${label} rewritten or dropped`);
  assert.deepEqual(out.panels[0].order.explicit, ["#2", "#0"], "literals become indices; unknown ones are dropped");
  assert.deepEqual(out.panels[0].stats.explicit, [{ a: "#0", b: "#2" }], "a pair with an unknown label is dropped");
  assert.equal(out.panels[0].stats.reference, "#1");
  assert.equal(out.panels[0].annotations[0].xGroup, "#1");
  assert.equal(typeof validateFigureSpec(out), "object", "the scrubbed copy is still a valid spec");
  assert.equal(p.title, `Title ${SENTINEL}`, "scrub never mutates the user's spec");

  const optIn = scrubSpec(s, levels, true);
  assert.deepEqual(optIn.panels[0].order.explicit, ["High", "#0", "Typo"], "opted in: labels kept as the user wrote them");
  assert.ok(!JSON.stringify(optIn).includes(SENTINEL), "opted in still never sends typed text");
}

// 6. merging Claude's spec with the user's local text
{
  const local = withPanel("bar", { x: "arm", y: "change" });
  local.panels[0].title = "My title";
  local.panels[0].y.unit = "mmHg";
  const returned = clone(local);
  returned.panels[0].title = "";
  returned.panels[0].y.unit = "";
  returned.panels[0].y.label = "Change from baseline";
  const merged = mergeTextFields(local, returned);
  assert.equal(merged.panels[0].title, "My title", "empty returned text keeps the local text");
  assert.equal(merged.panels[0].y.unit, "mmHg");
  assert.equal(merged.panels[0].y.label, "Change from baseline", "non-empty returned text wins");
}

// 7. the label gate on Claude's output
{
  const s = withPanel("box", { x: "arm", y: "change" });
  s.panels[0].stats = { test: "welch", pairs: "explicit", explicit: [{ a: "#0", b: "#2" }], display: "stars", reference: null };
  assert.equal(checkLabels(s, null), null, "#n refs always pass");
  s.panels[0].stats.explicit = [{ a: "Placebo", b: "#2" }];
  assert.match(String(checkLabels(s, null)), /label it wasn't given/, "a literal without levels is refused");
  assert.equal(checkLabels(s, { arm: ["Placebo", "Low"] }), null, "a literal that was sent passes");
  assert.match(String(checkLabels(s, { arm: ["Low"] })), /label it wasn't given/, "a literal not among those sent is refused");
  assert.match(String(checkLabels(s, { site: ["Placebo"] })), /label it wasn't given/, "sent for another column doesn't count");
  s.panels[0].stats.explicit = [];
  s.panels[0].annotations = [{ kind: "vline", text: "", x: null, y: null, x2: null, y2: null, xGroup: "Guessed" }];
  assert.match(String(checkLabels(s, null)), /label/, "annotation refs are gated too");
}

console.log("figureSpec.selfcheck: OK");
