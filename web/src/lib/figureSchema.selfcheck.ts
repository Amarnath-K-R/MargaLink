// Runnable check for figureSchema.ts — the privacy choke point standing
// between a researcher's spreadsheet and the network. This is the most
// important selfcheck in the figures feature: it proves the outbound
// payload can never carry a real cell value, rather than asserting it.
// Run directly:
//   node src/lib/figureSchema.selfcheck.ts
import assert from "node:assert/strict";
import {
  buildFigurePayload,
  isValidFigurePayload,
  validateSpec,
  NOTE_MAX_CHARS,
  type FigurePayload,
} from "./figureSchema.ts";
import type { Dataset } from "./spreadsheet.ts";

// Distinctive sentinels that must never appear anywhere in a built payload.
const SENTINEL_STRING = "ZZQQ-SENTINEL-0042";
const SENTINEL_NUMBER = "987654.321";

const FIXTURE_DATASET: Dataset = {
  fileName: "patients.csv",
  columns: [
    { name: "subject_id", dtype: "categorical" },
    { name: "group", dtype: "categorical" },
    { name: "response_mean", dtype: "numeric" },
  ],
  rowCount: 42,
  csv: `subject_id,group,response_mean\n${SENTINEL_STRING},treatment,${SENTINEL_NUMBER}\n`,
  previewRows: [[SENTINEL_STRING, "treatment", SENTINEL_NUMBER]],
  sheetName: "patients.csv",
  levels: { subject_id: [SENTINEL_STRING], group: ["treatment"] },
  coerced: { response_mean: 0 },
};

const SPEC = {
  chartType: "bar-error" as const,
  roles: { x: "group", y: "response_mean" },
  note: "use a muted palette",
};

const payload = buildFigurePayload(FIXTURE_DATASET, SPEC);
const payloadJson = JSON.stringify(payload);

// 1. Blanket string scan — the blunt instrument, first.
assert.ok(!payloadJson.includes(SENTINEL_STRING), "the built payload must never contain a real cell value (string)");
assert.ok(!payloadJson.includes(SENTINEL_NUMBER), "the built payload must never contain a real cell value (number, as a string)");

// 2. Exact key sets at every level — the assertion that protects the
// future: it fails the moment someone adds a field "to improve output
// quality," forcing that to be a deliberate, reviewed change.
assert.deepEqual(
  Object.keys(payload).sort(),
  ["chartType", "columns", "note", "roles", "rowCount"],
  "the payload must have exactly these five keys, nothing more"
);
for (const column of payload.columns) {
  assert.deepEqual(Object.keys(column).sort(), ["dtype", "name"], "each column entry must have exactly {name, dtype}");
}

// 3. Whitelist deep-walk: every string/number in the payload must trace to
// a declared column name, a dtype, the chart type, a role, rowCount, or a
// substring of the note.
const allowedStrings = new Set<string>([
  ...FIXTURE_DATASET.columns.map((c) => c.name),
  ...FIXTURE_DATASET.columns.map((c) => c.dtype),
  payload.chartType,
  ...Object.keys(payload.roles),
  ...Object.values(payload.roles),
]);
function walk(value: unknown): void {
  if (typeof value === "string") {
    const isKnown = allowedStrings.has(value) || payload.note.includes(value);
    assert.ok(isKnown, `payload contains a string that doesn't trace to a column/dtype/chartType/role/note: "${value}"`);
    return;
  }
  if (typeof value === "number") {
    assert.equal(value, payload.rowCount, `payload contains a number other than rowCount: ${value}`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach(walk);
    return;
  }
  if (value && typeof value === "object") {
    Object.values(value).forEach(walk);
  }
}
walk(payload);

// 4. Positive control — column names and rowCount DO come through, so a
// "fix" that empties the payload can't pass either.
assert.deepEqual(
  payload.columns,
  [
    { name: "subject_id", dtype: "categorical" },
    { name: "group", dtype: "categorical" },
    { name: "response_mean", dtype: "numeric" },
  ],
  "column names and dtypes should pass through unchanged"
);
assert.equal(payload.rowCount, 42, "rowCount should pass through unchanged");

// 5. Note truncation.
const longNote = "x".repeat(NOTE_MAX_CHARS + 50);
const truncated = buildFigurePayload(FIXTURE_DATASET, { ...SPEC, note: longNote });
assert.equal(truncated.note.length, NOTE_MAX_CHARS, "a note longer than NOTE_MAX_CHARS is truncated");
const untouched = buildFigurePayload(FIXTURE_DATASET, { ...SPEC, note: "short" });
assert.equal(untouched.note, "short", "a short note passes through unchanged");
const empty = buildFigurePayload(FIXTURE_DATASET, { ...SPEC, note: "" });
assert.equal(empty.note, "", "an empty note stays empty");

// 6. isValidFigurePayload rejects extra keys — the same guarantee enforced
// server-side, so a tampered client can't widen the payload either.
assert.equal(isValidFigurePayload(payload), true, "a genuinely valid payload should validate");
const tampered = { ...payload, sampleRows: [["not", "allowed"]] } as unknown;
assert.equal(isValidFigurePayload(tampered), false, "a payload with an unexpected extra key must be rejected");
const badColumn = { ...payload, columns: [{ name: "x", dtype: "numeric", sample: [1, 2, 3] }] } as unknown as FigurePayload;
assert.equal(isValidFigurePayload(badColumn), false, "a column entry with an extra key must be rejected");
assert.equal(isValidFigurePayload(null), false, "null is not a valid payload");
assert.equal(isValidFigurePayload("not an object"), false, "a non-object is not a valid payload");

// 7. validateSpec.
assert.equal(
  validateSpec(FIXTURE_DATASET.columns, SPEC),
  null,
  "a valid spec (categorical x, numeric y for bar-error) should pass validation"
);
assert.equal(
  validateSpec(FIXTURE_DATASET.columns, { chartType: "bar-error", roles: { y: "response_mean" }, note: "" }),
  'Pick a column for "x".',
  "a missing required role should be rejected with a clear message"
);
assert.equal(
  validateSpec(FIXTURE_DATASET.columns, { chartType: "bar-error", roles: { x: "response_mean", y: "response_mean" }, note: "" }),
  '"response_mean" is numeric, but x needs categorical or date.',
  "a numeric column in a categorical-only role should be rejected"
);

console.log("figureSchema.selfcheck: OK");
