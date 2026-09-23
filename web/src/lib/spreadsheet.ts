// Parses an uploaded CSV/XLSX into a typed Dataset, entirely in the browser.
// Nothing here ever sends the file or its values anywhere — see
// figureSchema.ts, which is the only thing allowed to describe this data to
// anyone, and does so without ever touching a real cell value.

export const DTYPES = ["numeric", "categorical", "date"] as const;
export type Dtype = (typeof DTYPES)[number];
export type ColumnSchema = { name: string; dtype: Dtype };

export type Dataset = {
  fileName: string;
  sheetName: string;
  columns: ColumnSchema[];
  rowCount: number;
  // Always OUR re-emitted, comma-delimited CSV — never the original file
  // bytes verbatim. That guarantees the header row here is byte-identical
  // to the column names in `columns` (and therefore to what figureSchema.ts
  // describes to Claude): blank/duplicate headers get normalized once, here,
  // not left for pandas to normalize differently on the other end. Numeric
  // columns are re-emitted as plain JS numbers ("1.234,5" -> "1234.5") and
  // NA tokens as empty cells, so pandas types the frame the way the UI does.
  csv: string;
  previewRows: string[][]; // first 5 prepared rows, for an on-page "did it parse right?" table
  // Categorical/date columns' distinct values in first-appearance order (the
  // order "#n" group references index into); null when a column has more
  // than MAX_LEVELS distinct values (an ID-like column). Numeric columns absent.
  levels: Record<string, string[] | null>;
  // Per numeric column: non-empty cells that weren't numbers and became empty.
  coerced: Record<string, number>;
};

export type Workbook = { fileName: string; sheets: { name: string; rows: string[][] }[] };

export const DEFAULT_NA_TOKENS = ["NA", "N/A", "NaN", "nan", "NULL", "null", "#N/A", "-", "."];
export type PrepOptions = {
  sheet: number;
  headerRow: number; // 0-based; rows above it are metadata and skipped
  naTokens: string[];
  decimal: "." | ",";
  thousands: "" | "," | "." | " " | "'";
  typeOverrides: Record<string, Dtype>;
  reshape: { idColumns: string[]; valueColumns: string[]; varName: string; valueName: string } | null;
};

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10MB
const MAX_ROWS = 100_000; // postMessage copies the whole csv string; wasm pandas has a memory ceiling
export const MAX_LEVELS = 200;

export async function readWorkbook(file: File): Promise<Workbook> {
  if (file.size > MAX_FILE_BYTES) {
    throw new Error("That file is too large (max 10MB). Try a smaller export or a summarized version.");
  }
  const name = file.name.toLowerCase();
  if (name.endsWith(".csv") || name.endsWith(".tsv") || name.endsWith(".txt")) {
    return { fileName: file.name, sheets: [{ name: file.name, rows: readCsvText(decodeText(await file.arrayBuffer())) }] };
  }
  if (name.endsWith(".xlsx")) {
    let sheets: { sheet: string; data: unknown[][] }[];
    try {
      const { default: readXlsxFile } = await import("read-excel-file/browser");
      sheets = (await readXlsxFile(file)) as { sheet: string; data: unknown[][] }[];
    } catch {
      throw new Error("Couldn't read that spreadsheet — if it's an old .xls, re-save it as .xlsx.");
    }
    return { fileName: file.name, sheets: sheets.map((s) => ({ name: s.sheet, rows: s.data.map((row) => row.map(cellToString)) })) };
  }
  throw new Error("Unsupported file type. Upload a .csv, .tsv or .xlsx.");
}

// UTF-8 when the bytes are valid UTF-8 (BOM stripped), else Windows-1252 —
// what Excel on Windows writes for "CSV" and what turns "µ" into "�" otherwise.
export function decodeText(bytes: ArrayBuffer): string {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    text = new TextDecoder("windows-1252").decode(bytes);
  }
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

export function readCsvText(text: string): string[][] {
  const sample = text.split("\n", 20).join("\n");
  return parseCsv(text, sniffDelimiter(sample));
}

const trimRow = (row: string[]) => {
  let n = row.length;
  while (n > 0 && row[n - 1].trim() === "") n--;
  return n;
};

// Best guesses for a fresh upload: the header is the first row as wide as
// the table's typical row (metadata lines above it are narrower), and the
// number format is whichever decimal mark the unambiguous cells use.
export function suggestPrepOptions(workbook: Workbook, sheet = 0): PrepOptions {
  const rows = workbook.sheets[sheet]?.rows ?? [];
  const widths = rows.map(trimRow).filter((w) => w > 0);
  const counts = new Map<number, number>();
  for (const w of widths) counts.set(w, (counts.get(w) ?? 0) + 1);
  const modal = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]?.[0] ?? 0;
  const headerRow = Math.max(0, rows.findIndex((r) => trimRow(r) >= modal));

  const cells = rows.slice(headerRow + 1, headerRow + 501).flat().map((c) => c.trim());
  const commaDecimal = cells.filter((c) => /^[-+]?\d*,(\d{1,2}|\d{4,})$/.test(c) || /^[-+]?\d{1,3}(\.\d{3})+,\d+$/.test(c)).length;
  const dotDecimal = cells.filter((c) => /^[-+]?\d*\.(\d{1,2}|\d{4,})$/.test(c) || /^[-+]?\d{1,3}(,\d{3})+\.\d+$/.test(c)).length;
  const decimal = commaDecimal > dotDecimal ? "," : ".";
  const group = decimal === "," ? "." : ",";
  const grouped = new RegExp(`^[-+]?\\d{1,3}(\\${group}\\d{3})+(\\${decimal}\\d+)?$`);
  const thousands = cells.some((c) => grouped.test(c)) ? group : "";
  return { sheet, headerRow, naTokens: DEFAULT_NA_TOKENS, decimal, thousands, typeOverrides: {}, reshape: null };
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Strict: "1.234,5" is a number only with decimal "," and thousands "."; a
// cell that doesn't fit the chosen format is not a number (null), rather
// than a silently wrong one ("1.5" with thousands "." is not 15).
const numberPatterns = new Map<string, [RegExp, RegExp | null]>();
function patterns(decimal: string, thousands: string): [RegExp, RegExp | null] {
  const key = decimal + thousands;
  let p = numberPatterns.get(key);
  if (!p) {
    const d = escapeRe(decimal);
    p = [
      new RegExp(`^[-+]?(\\d+(${d}\\d*)?|${d}\\d+)([eE][-+]?\\d+)?$`),
      thousands ? new RegExp(`^[-+]?\\d{1,3}(${escapeRe(thousands)}\\d{3})+(${d}\\d+)?$`) : null,
    ];
    numberPatterns.set(key, p);
  }
  return p;
}

export function parseNumber(raw: string, decimal: "." | ",", thousands: string): number | null {
  const s = raw.trim();
  if (s === "") return null;
  const [plain, grouped] = patterns(decimal, thousands);
  if (!plain.test(s) && !grouped?.test(s)) return null;
  const n = Number((thousands ? s.split(thousands).join("") : s).replace(decimal, "."));
  return Number.isFinite(n) ? n : null;
}

export function reshapeWideToLong(headers: string[], rows: string[][], r: NonNullable<PrepOptions["reshape"]>): { headers: string[]; rows: string[][] } {
  const index = (name: string) => {
    const i = headers.indexOf(name);
    if (i === -1) throw new Error(`Reshape: there's no column "${name}".`);
    return i;
  };
  if (r.valueColumns.length === 0) throw new Error("Reshape: pick at least one column to stack.");
  const ids = r.idColumns.map(index);
  const values = r.valueColumns.map((name) => [name, index(name)] as const);
  const out: string[][] = [];
  for (const row of rows) for (const [name, i] of values) out.push([...ids.map((j) => row[j] ?? ""), name, row[i] ?? ""]);
  return { headers: [...r.idColumns, r.varName.trim() || "variable", r.valueName.trim() || "value"], rows: out };
}

export function prepareDataset(workbook: Workbook, opts: PrepOptions): Dataset {
  const sheet = workbook.sheets[opts.sheet];
  if (!sheet) throw new Error("That sheet doesn't exist in this file.");
  const body = sheet.rows.slice(opts.headerRow).filter((r) => r.some((c) => c.trim() !== ""));
  if (body.length < 2) throw new Error("There are no rows under the header row.");
  const na = new Set(opts.naTokens.map((t) => t.trim()));
  let headers = normalizeHeaders(body[0]);
  let rows = body.slice(1).map((row) => headers.map((_, i) => (na.has((row[i] ?? "").trim()) ? "" : (row[i] ?? ""))));
  // Drop unnamed, entirely empty columns (trailing separators, spacer columns in Excel).
  const keep = headers.map((h, i) => (body[0][i] ?? "").trim() !== "" || rows.some((r) => r[i].trim() !== ""));
  headers = headers.filter((_, i) => keep[i]);
  rows = rows.map((r) => r.filter((_, i) => keep[i]));
  if (opts.reshape) ({ headers, rows } = reshapeWideToLong(headers, rows, opts.reshape));
  if (rows.length > MAX_ROWS) {
    throw new Error(`That's more than ${MAX_ROWS.toLocaleString()} rows — try a summarized version.`);
  }

  const columns: ColumnSchema[] = headers.map((name, i) => ({
    name,
    dtype: opts.typeOverrides[name] ?? inferDtype(rows.map((r) => r[i]), opts.decimal, opts.thousands),
  }));
  const levels: Dataset["levels"] = {};
  const coerced: Dataset["coerced"] = {};
  columns.forEach(({ name, dtype }, i) => {
    if (dtype === "numeric") {
      let bad = 0;
      for (const r of rows) {
        if (r[i].trim() === "") continue;
        const n = parseNumber(r[i], opts.decimal, opts.thousands);
        if (n === null) bad++;
        r[i] = n === null ? "" : String(n);
      }
      coerced[name] = bad;
    } else {
      const seen = new Set<string>();
      for (const r of rows) if (r[i] !== "" && seen.size <= MAX_LEVELS) seen.add(r[i]);
      levels[name] = seen.size > MAX_LEVELS ? null : [...seen];
    }
  });
  return {
    fileName: workbook.fileName,
    sheetName: sheet.name,
    columns,
    rowCount: rows.length,
    csv: toCsv([headers, ...rows]),
    previewRows: rows.slice(0, 5),
    levels,
    coerced,
  };
}

function cellToString(v: unknown): string {
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10); // YYYY-MM-DD
  return String(v);
}

// Best-effort sniff over the header line only — counts each delimiter
// candidate's raw occurrences and picks the most common, ties favoring
// comma. Not quote-aware (a delimiter char inside a quoted header would
// throw this off); good enough for a sniff, not a parse.
function sniffDelimiter(firstLine: string): string {
  let best = ",";
  let bestCount = -1;
  for (const d of [",", ";", "\t"]) {
    const count = firstLine.split(d).length - 1;
    if (count > bestCount) {
      bestCount = count;
      best = d;
    }
  }
  return best;
}

// A real (if minimal) RFC-4180 reader: quoted fields, embedded
// delimiters/newlines inside quotes, "" as an escaped literal quote,
// CRLF or LF line endings.
function parseCsv(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  const len = text.length;

  while (i < len) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
        } else {
          inQuotes = false;
          i += 1;
        }
      } else {
        field += char;
        i += 1;
      }
      continue;
    }
    if (char === '"') {
      inQuotes = true;
      i += 1;
    } else if (char === delimiter) {
      row.push(field);
      field = "";
      i += 1;
    } else if (char === "\r") {
      i += 1; // swallow; \n (below) ends the row
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i += 1;
    } else {
      field += char;
      i += 1;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

export function toCsv(rows: string[][]): string {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          const escaped = cell.replace(/"/g, '""');
          return /[",\n\r]/.test(cell) ? `"${escaped}"` : escaped;
        })
        .join(",")
    )
    .join("\r\n");
}

function normalizeHeaders(raw: string[]): string[] {
  const seen = new Map<string, number>();
  return raw.map((h, i) => {
    const trimmed = (h ?? "").trim();
    const name = trimmed || `column_${i + 1}`;
    const count = seen.get(name) ?? 0;
    seen.set(name, count + 1);
    return count === 0 ? name : `${name}_${count + 1}`;
  });
}

// Date.parse alone is far too lenient (V8 reads "1,5" or "week 3" as dates),
// so a value must also look like one: ISO, d/m/y-style, or with a month name.
const DATE_SHAPE = /^(\d{4}[-/]\d{1,2}[-/]\d{1,2}([ T]\d{1,2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?|\d{1,2}[-/]\d{1,2}[-/]\d{2,4}|\d{1,2}[ -][A-Za-z]{3,9}[ -]\d{2,4}|[A-Za-z]{3,9}\.? \d{1,2},? \d{4})$/;

export function inferDtype(values: string[], decimal: "." | "," = ".", thousands = ""): Dtype {
  const nonEmpty = values.map((v) => v.trim()).filter((v) => v !== "");
  if (nonEmpty.length === 0) return "categorical";

  const numericCount = nonEmpty.filter((v) => parseNumber(v, decimal, thousands) !== null).length;
  if (numericCount / nonEmpty.length >= 0.9) return "numeric";

  const dateCount = nonEmpty.filter((v) => DATE_SHAPE.test(v) && !Number.isNaN(Date.parse(v))).length;
  if (dateCount / nonEmpty.length >= 0.9) return "date";

  return "categorical";
}

// readWorkbook() needs a browser File; everything it feeds (readCsvText,
// decodeText, prepareDataset and the helpers) is pure and covered by
// spreadsheet.selfcheck.ts.
export { parseCsv, sniffDelimiter, normalizeHeaders };
