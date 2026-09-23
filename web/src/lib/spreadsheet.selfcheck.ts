// Runnable check for spreadsheet.ts's pure helpers — the CSV reader, the
// delimiter sniff, header normalization, and dtype inference. Run directly:
//   node src/lib/spreadsheet.selfcheck.ts
import assert from "node:assert/strict";
import { parseCsv, sniffDelimiter, normalizeHeaders, inferDtype, toCsv } from "./spreadsheet.ts";

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
assert.equal(inferDtype(["", "", ""]), "categorical", "an entirely blank column infers as categorical rather than throwing");

// --- toCsv ---
assert.equal(toCsv([["a", "b"], ["1", "2"]]), "a,b\r\n1,2", "plain values need no quoting, rows join on CRLF with no trailing terminator");
assert.equal(
  toCsv([["name"], ['Doe, "Jane"']]),
  'name\r\n"Doe, ""Jane"""',
  "a value containing a comma or quote gets quoted, with embedded quotes doubled"
);

console.log("spreadsheet.selfcheck: OK");
