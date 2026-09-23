// Runnable check for spreadsheet.ts's pure parts — the CSV reader, the
// delimiter sniff, header normalization, dtype inference, number parsing,
// prep (header row, NA tokens, number formats, overrides, reshape), levels.
// Run directly:
//   node src/lib/spreadsheet.selfcheck.ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  DEFAULT_NA_TOKENS,
  MAX_LEVELS,
  decodeText,
  inferDtype,
  normalizeHeaders,
  parseCsv,
  parseNumber,
  prepareDataset,
  readCsvText,
  reshapeWideToLong,
  sniffDelimiter,
  suggestPrepOptions,
  toCsv,
  type PrepOptions,
  type Workbook,
} from "./spreadsheet.ts";

// --- parseCsv: RFC-4180 shape ---
assert.deepEqual(
  parseCsv("a,b,c\n1,2,3\n", ","),
  [["a", "b", "c"], ["1", "2", "3"]],
  "plain comma-delimited rows"
);
assert.deepEqual(
  parseCsv('name,note\n"Doe, Jane","says ""hi"""\n', ","),
  [["name", "note"], ["Doe, Jane", 'says "hi"']],
  "a quoted field can embed the delimiter and an escaped \"\" literal quote"
);
assert.deepEqual(
  parseCsv('a,b\n"line one\nline two",2\n', ","),
  [["a", "b"], ["line one\nline two", "2"]],
  "a quoted field can embed a real newline"
);
assert.deepEqual(
  parseCsv("a,b\r\n1,2\r\n", ","),
  [["a", "b"], ["1", "2"]],
  "CRLF line endings are treated the same as LF"
);
assert.deepEqual(
  parseCsv("a,b\n1,2", ","),
  [["a", "b"], ["1", "2"]],
  "a file with no trailing newline still yields its last row"
);

// --- sniffDelimiter ---
assert.equal(sniffDelimiter("a,b,c"), ",", "comma-delimited header sniffs as comma");
assert.equal(sniffDelimiter("a;b;c"), ";", "semicolon-delimited header sniffs as semicolon");
assert.equal(sniffDelimiter("a\tb\tc"), "\t", "tab-delimited header sniffs as tab");
assert.equal(sniffDelimiter("a"), ",", "a single column with no delimiter present falls back to comma");

// --- normalizeHeaders ---
assert.deepEqual(
  normalizeHeaders(["subject_id", "", "group"]),
  ["subject_id", "column_2", "group"],
  "a blank header gets a positional placeholder name"
);
assert.deepEqual(
  normalizeHeaders(["group", "group", "group"]),
  ["group", "group_2", "group_3"],
  "duplicate headers get de-duplicated with a numeric suffix"
);
assert.deepEqual(normalizeHeaders(["  x  ", "y"]), ["x", "y"], "headers are trimmed");

// --- inferDtype ---
assert.equal(inferDtype(["1", "2.5", "-3", "4"]), "numeric", "mostly-numeric values infer as numeric");
assert.equal(
  inferDtype(["2024-01-01", "2024-02-15", "2024-03-01"]),
  "date",
  "mostly-parseable dates infer as date"
);
assert.equal(inferDtype(["control", "treatment", "control"]), "categorical", "non-numeric, non-date values infer as categorical");
assert.equal(
  inferDtype(["1", "2", "3", "4", "5", "6", "7", "8", "9", "not-a-number"]),
  "numeric",
  "one non-numeric value among nine numeric ones still crosses the 90% threshold"
);
assert.equal(
  inferDtype(["1", "two", "3", "four", "5"]),
  "categorical",
  "a roughly even mix of numeric and non-numeric values falls back to categorical, not numeric"
);
assert.equal(inferDtype(["03/15/2024", "15-Mar-2024", "Mar 15, 2024", "2024-03-15T10:30:00Z"]), "date", "common date shapes");
assert.equal(inferDtype(["week 3", "1,5", "2 5"]), "categorical", "Date.parse's lenient guesses aren't dates");
assert.equal(inferDtype(["", "", ""]), "categorical", "an entirely blank column infers as categorical rather than throwing");

// --- toCsv ---
assert.equal(toCsv([["a", "b"], ["1", "2"]]), "a,b\r\n1,2", "plain values need no quoting, rows join on CRLF with no trailing terminator");
assert.equal(
  toCsv([["name"], ['Doe, "Jane"']]),
  'name\r\n"Doe, ""Jane"""',
  "a value containing a comma or quote gets quoted, with embedded quotes doubled"
);

// --- parseNumber: strict per format ---
assert.equal(parseNumber("1.234,5", ",", "."), 1234.5);
assert.equal(parseNumber("1,234.5", ".", ","), 1234.5);
assert.equal(parseNumber("1 234,5", ",", " "), 1234.5);
assert.equal(parseNumber("-0,25", ",", ""), -0.25);
assert.equal(parseNumber("1e-3", ".", ""), 0.001);
assert.equal(parseNumber("1.5", ",", "."), null, "a dot in a comma-decimal file is not silently a thousands mark");
assert.equal(parseNumber("12,34,5", ".", ","), null, "malformed grouping is not a number");
assert.equal(parseNumber("NA", ".", ""), null, "NA tokens are the caller's job; they just aren't numbers");
assert.equal(parseNumber("", ".", ""), null);
assert.equal(inferDtype(["1,5", "2,25", "3"], ",", ""), "numeric", "decimal commas infer as numeric under a comma format");
assert.equal(inferDtype(["1,5", "2,25", "3"]), "categorical", "…and not under the default dot format");

// --- decoding and sniffing past metadata lines ---
assert.equal(decodeText(new Uint8Array([0xef, 0xbb, 0xbf, 0x61]).buffer), "a", "UTF-8 BOM stripped");
assert.equal(decodeText(new Uint8Array([0x62, 0xb5, 0x67]).buffer), "bµg", "invalid UTF-8 falls back to Windows-1252");
assert.equal(readCsvText("Exported by X\na;b\n1;2\n")[1].length, 2, "the delimiter sniff looks past a metadata first line");

// --- the messy real-world export, end to end ---
const messy: Workbook = { fileName: "messy.csv", sheets: [{ name: "messy.csv", rows: readCsvText(readFileSync(new URL("../../scripts/fixtures/messy.csv", import.meta.url), "utf8")) }] };
const guess = suggestPrepOptions(messy);
assert.deepEqual([guess.headerRow, guess.decimal, guess.thousands], [2, ",", "."], "header row and number format are guessed");
const ds = prepareDataset(messy, guess);
const dtype = Object.fromEntries(ds.columns.map((c) => [c.name, c.dtype]));
assert.deepEqual(dtype, {
  subject: "categorical", site: "categorical", arm: "categorical", dose_mg: "numeric",
  weight_kg: "numeric", week1: "numeric", week2: "numeric", week3: "numeric",
});
assert.equal(ds.rowCount, 6);
assert.deepEqual(ds.previewRows[1], ["S02", "Nordklinik", "Low", "10", "1081", "2.4", "2.1", ""], "numbers re-emitted plainly, NA tokens emptied");
assert.equal(ds.csv.split("\r\n")[0], "subject,site,arm,dose_mg,weight_kg,week1,week2,week3");
assert.deepEqual(ds.levels.arm, ["Placebo", "Low", "High"], "levels in first-appearance order");
assert.deepEqual(ds.levels.site, ["Nordklinik", "Südhaus", "Østby"]);
assert.ok(!("dose_mg" in ds.levels), "numeric columns have no levels");
assert.equal(ds.coerced.week2, 0, "NA tokens and blanks aren't counted as coerced");
assert.equal(ds.sheetName, "messy.csv");

// with the wrong format the numeric columns fall to categorical — the case the prep step exists for
const naive = prepareDataset(messy, { ...guess, decimal: ".", thousands: "" });
assert.equal(naive.columns.find((c) => c.name === "week1")!.dtype, "categorical");

// type overrides win over inference
assert.equal(prepareDataset(messy, { ...guess, typeOverrides: { dose_mg: "categorical" } }).columns.find((c) => c.name === "dose_mg")!.dtype, "categorical");

// NA tokens: without "-", week3's "-" is a non-number (1 in 6, under the 90% bar) —
// and forcing the column numeric coerces exactly that cell to empty
const strictNa = prepareDataset(messy, { ...guess, naTokens: ["NA"] });
assert.equal(strictNa.columns.find((c) => c.name === "week3")!.dtype, "categorical");
const forced = prepareDataset(messy, { ...guess, naTokens: ["NA"], typeOverrides: { week3: "numeric" } });
assert.equal(forced.coerced.week3, 1);
assert.equal(forced.previewRows[1][7], "");

// --- wide -> long ---
const reshape: NonNullable<PrepOptions["reshape"]> = { idColumns: ["subject", "arm"], valueColumns: ["week1", "week2", "week3"], varName: "week", valueName: "score" };
const long = prepareDataset(messy, { ...guess, reshape });
assert.deepEqual(long.columns.map((c) => c.name), ["subject", "arm", "week", "score"]);
assert.equal(long.rowCount, 18, "3 rows per subject");
assert.deepEqual(long.previewRows.slice(0, 3), [["S01", "Placebo", "week1", "1.2"], ["S01", "Placebo", "week2", ""], ["S01", "Placebo", "week3", "0.8"]]);
assert.equal(long.columns.find((c) => c.name === "score")!.dtype, "numeric");
assert.throws(() => reshapeWideToLong(["a"], [], { ...reshape, idColumns: ["nope"] }), /no column "nope"/);

// --- prep edge cases ---
const wb = (rows: string[][]): Workbook => ({ fileName: "t.csv", sheets: [{ name: "Sheet A", rows }, { name: "Sheet B", rows: [["x"], ["1"]] }] });
const base: PrepOptions = { sheet: 0, headerRow: 0, naTokens: DEFAULT_NA_TOKENS, decimal: ".", thousands: "", typeOverrides: {}, reshape: null };
assert.equal(prepareDataset(wb([["a"], ["1"]]), { ...base, sheet: 1 }).sheetName, "Sheet B", "the chosen sheet is read");
const ids = Array.from({ length: MAX_LEVELS + 1 }, (_, i) => [`id${i}`]);
assert.equal(prepareDataset(wb([["id"], ...ids]), base).levels.id, null, "an ID-like column has no level list");
const spacer = prepareDataset(wb([["a", "", "b", ""], ["1", "", "x", ""], ["", "", "", ""], ["2", "", "y", ""]]), base);
assert.deepEqual(spacer.columns.map((c) => c.name), ["a", "b"], "unnamed empty columns and blank rows are dropped");
assert.equal(spacer.rowCount, 2);
assert.throws(() => prepareDataset(wb([["a"]]), base), /no rows under the header/);

console.log("spreadsheet.selfcheck: OK");
