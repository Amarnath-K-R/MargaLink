// Runnable check for figureSchema.ts — the proof, with planted sentinels,
// that the payload carries no value by default, and nothing beyond the
// listed labels when labels are opted in. Run directly:
//   node src/lib/figureSchema.selfcheck.ts
import assert from "node:assert/strict";
import * as FS from "./figureSpec.ts";
import { DEFAULT_SPEC, defaultPanel, type FigureSpec } from "./figureSpec.ts";
import {
  MAX_LEVELS_PER_COLUMN,
  MAX_LEVEL_COLUMNS,
  REQUEST_MAX_CHARS,
  buildFigurePayload,
  isValidFigurePayload,
  levelsToSend,
} from "./figureSchema.ts";
import type { Dataset } from "./spreadsheet.ts";

const CELL = "ZZQQ-CELL-0042"; // a subject ID: a cell value
const NUMBER = "987654.321"; // a numeric cell value
const TITLE = "ZZQQ-TITLE-7"; // typed locally
const NOTE = "ZZQQ-NOTE-9"; // annotation text typed locally
const MANY = "ZZQQ-MANY"; // prefix of a 40-level column's values
const ARM = "ZZQQ-ARM"; // prefix of a 3-level column's values (the opt-in's only addition)

const many = Array.from({ length: 40 }, (_, i) => `${MANY}-${i}`);
const arms = [`${ARM}-Placebo`, `${ARM}-Low`, `${ARM}-High`];
const DATASET: Dataset = {
  fileName: "patients.csv",
  sheetName: "patients.csv",
  columns: [
    { name: "subject_id", dtype: "categorical" },
    { name: "site", dtype: "categorical" },
    { name: "arm", dtype: "categorical" },
    { name: "response", dtype: "numeric" },
  ],
  rowCount: 42,
  csv: `subject_id,site,arm,response\n${CELL},${many[0]},${arms[0]},${NUMBER}\n`,
  previewRows: [[CELL, many[0], arms[0], NUMBER]],
  levels: { subject_id: null, site: many, arm: arms },
  coerced: { response: 0 },
};

const spec: FigureSpec = structuredClone(DEFAULT_SPEC);
const p = spec.panels[0];
Object.assign(p.roles, { x: "arm", y: "response" });
p.title = TITLE;
p.y.unit = TITLE;
p.annotations = [{ kind: "text", text: NOTE, x: null, y: 1, x2: null, y2: null, xGroup: arms[1] }];
p.order = { mode: "explicit", explicit: [arms[2], "#0"] };
p.stats = { test: "welch", pairs: "explicit", explicit: [{ a: arms[0], b: arms[2] }], display: "stars", reference: arms[1] };
(p as unknown as Record<string, unknown>).cachedRows = [[CELL]]; // a stray local field
const REQUEST = "Two panels: response by arm with Welch brackets";

// 1. default payload: exact keys, no value, no label, no typed text
{
  const payload = buildFigurePayload(DATASET, spec, REQUEST, { sendLevels: false, mode: "spec" });
  const json = JSON.stringify(payload);
  assert.deepEqual(Object.keys(payload).sort(), ["columns", "levels", "mode", "request", "rowCount", "spec"]);
  assert.equal(payload.levels, null);
  for (const s of [CELL, NUMBER, TITLE, NOTE, MANY, ARM]) assert.ok(!json.includes(s), `default payload must not contain ${s}`);
  assert.deepEqual(payload.spec!.panels[0].order.explicit, ["#2", "#0"]);
  assert.deepEqual(payload.spec!.panels[0].stats.explicit, [{ a: "#0", b: "#2" }]);
  assert.equal(payload.spec!.panels[0].stats.reference, "#1");
  assert.equal(payload.spec!.panels[0].annotations[0].xGroup, "#1");
  assert.ok(isValidFigurePayload(JSON.parse(json)), "what the client sends, the server accepts");
  // positive control: the parts that should leave, do
  assert.equal(payload.request, REQUEST);
  assert.equal(payload.rowCount, 42);
  assert.deepEqual(payload.columns.map((c) => c.name), ["subject_id", "site", "arm", "response"]);
}

// 2. opted in: the only new strings are the ≤ 30-level column's labels
{
  const payload = buildFigurePayload(DATASET, spec, REQUEST, { sendLevels: true, mode: "spec" });
  const json = JSON.stringify(payload);
  assert.deepEqual(payload.levels, { arm: arms }, "only the 3-level categorical column; the 40-level and ID columns stay out");
  for (const s of [CELL, NUMBER, TITLE, NOTE, MANY]) assert.ok(!json.includes(s), `opted-in payload must not contain ${s}`);
  const withoutLevels = JSON.stringify({ ...payload, levels: null });
  assert.ok(!withoutLevels.includes(ARM), "labels appear only in the levels block — refs stay #n");
  assert.ok(isValidFigurePayload(JSON.parse(json)));
}

// 3. whitelist walk: every string in either payload is a known-safe string
{
  const allowed = new Set<string>([
    ...DATASET.columns.flatMap((c) => [c.name, c.dtype]),
    ...arms,
    REQUEST,
    "spec",
    "hook",
    "",
    // every enum the schema allows
    ...[FS.FAMILIES, FS.STYLE_PRESETS, FS.SIZE_PRESETS, FS.PALETTES, FS.ERROR_TYPES, FS.STATS, FS.ORDER_MODES, FS.TICK_FORMATS, FS.LAYER_KINDS, FS.ANNOTATION_KINDS, FS.TESTS, FS.PAIRS, FS.P_DISPLAY].flat(),
  ]);
  const safe = (s: string) => allowed.has(s) || /^#\d+$/.test(s);
  const walk = (v: unknown, path: string): void => {
    if (typeof v === "string") assert.ok(safe(v), `unexpected string at ${path}: ${v}`);
    else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) walk(x, `${path}.${k}`);
  };
  walk(buildFigurePayload(DATASET, spec, REQUEST, { sendLevels: true, mode: "hook" }), "payload");
}

// 4. caps and edge cases
{
  const long = buildFigurePayload(DATASET, null, "x".repeat(5000), { sendLevels: false, mode: "spec" });
  assert.equal(long.request.length, REQUEST_MAX_CHARS);
  assert.equal(long.spec, null);
  const wide: Dataset = {
    ...DATASET,
    columns: Array.from({ length: 20 }, (_, i) => ({ name: `c${i}`, dtype: "categorical" as const })),
    levels: Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`c${i}`, ["a", "b"]])),
  };
  assert.equal(Object.keys(levelsToSend(wide)).length, MAX_LEVEL_COLUMNS);
  const prose: Dataset = { ...DATASET, levels: { ...DATASET.levels, arm: ["a".repeat(500)] } };
  assert.deepEqual(levelsToSend(prose), {}, "free-text columns aren't categories to send");
}

// 5. the server rejects anything wider than the contract
{
  const good = JSON.parse(JSON.stringify(buildFigurePayload(DATASET, spec, REQUEST, { sendLevels: true, mode: "spec" })));
  const bad = (mutate: (x: Record<string, unknown>) => void) => {
    const x = structuredClone(good);
    mutate(x);
    return isValidFigurePayload(x);
  };
  assert.ok(isValidFigurePayload(good));
  assert.ok(!bad((x) => (x.sampleRows = [[CELL]])), "extra top-level key");
  assert.ok(!bad((x) => ((x.columns as Record<string, unknown>[])[0].example = CELL)), "extra column key");
  assert.ok(!bad((x) => ((x.levels as Record<string, string[]>).arm = Array.from({ length: MAX_LEVELS_PER_COLUMN + 1 }, (_, i) => `l${i}`))), "31 levels");
  assert.ok(!bad((x) => ((x.levels as Record<string, string[]>).response = ["1.5"])), "levels for a numeric column");
  assert.ok(!bad((x) => ((x.levels as Record<string, string[]>).nope = ["a"])), "levels for an undeclared column");
  assert.ok(!bad((x) => (((x.spec as FigureSpec).panels[0] as unknown as Record<string, unknown>).rows = [[CELL]])), "non-schema spec key");
  assert.ok(!bad((x) => (x.mode = "code")), "unknown mode");
  assert.ok(!bad((x) => (x.request = "x".repeat(REQUEST_MAX_CHARS + 1))), "over-long request");
  assert.ok(!bad((x) => (x.rowCount = 1.5)), "non-integer row count");
  const specPanel = defaultPanel("box");
  assert.ok(!bad((x) => ((x.spec as FigureSpec).panels = Array.from({ length: 7 }, () => specPanel))), "spec over its caps");
}

console.log("figureSchema.selfcheck: OK");
