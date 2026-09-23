// Parses an uploaded CSV/XLSX into a typed Dataset, entirely in the browser.
// Nothing here ever sends the file or its values anywhere — see
// figureSchema.ts, which is the only thing allowed to describe this data to
// anyone, and does so without ever touching a real cell value.

export const DTYPES = ["numeric", "categorical", "date"] as const;
export type Dtype = (typeof DTYPES)[number];
export type ColumnSchema = { name: string; dtype: Dtype };

export type Dataset = {
  fileName: string;
  columns: ColumnSchema[];
  rowCount: number;
  // Always OUR re-emitted, comma-delimited CSV — never the original file
  // bytes verbatim. That guarantees the header row here is byte-identical
  // to the column names in `columns` (and therefore to what figureSchema.ts
  // describes to Claude): blank/duplicate headers get normalized once, here,
  // not left for pandas to normalize differently on the other end. Real
  // cell values are untouched, just re-serialized.
  csv: string;
  previewRows: string[][]; // first 5 data rows, for an on-page "did it parse right?" table
};

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10MB
const MAX_ROWS = 100_000; // postMessage copies the whole csv string; wasm pandas has a memory ceiling

export async function parseSpreadsheet(file: File): Promise<Dataset> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".csv")) return parseCsvFile(file);
  if (name.endsWith(".xlsx")) return parseXlsxFile(file);
  throw new Error("Unsupported file type. Upload a .csv or .xlsx.");
}

async function parseCsvFile(file: File): Promise<Dataset> {
  if (file.size > MAX_FILE_BYTES) {
    throw new Error("That file is too large (max 10MB). Try a smaller export or a summarized version.");
  }
  let text = await file.text();
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // strip a UTF-8 BOM, common from Excel's own CSV export

  const firstLineEnd = text.indexOf("\n");
  const firstLine = firstLineEnd === -1 ? text : text.slice(0, firstLineEnd);
  const rows = parseCsv(text, sniffDelimiter(firstLine)).filter((r) => !(r.length === 1 && r[0] === ""));

  return buildDataset(file.name, rows);
}

async function parseXlsxFile(file: File): Promise<Dataset> {
  if (file.size > MAX_FILE_BYTES) {
    throw new Error("That file is too large (max 10MB). Try a smaller export or a summarized version.");
  }
  let rawRows: unknown[][];
  try {
    // readXlsxFile() (the default export) reads every sheet and returns
    // Sheet<T>[]; readSheet() with no `sheet` argument reads just the
    // first one and returns plain rows — what a single-table upload needs.
    const { readSheet } = await import("read-excel-file/browser");
    rawRows = await readSheet(file);
  } catch {
    throw new Error("Couldn't read that spreadsheet — if it's an old .xls, re-save it as .xlsx.");
  }
  return buildDataset(file.name, rawRows.map((row) => row.map(cellToString)));
}

function buildDataset(fileName: string, rows: string[][]): Dataset {
  if (rows.length < 2) {
    throw new Error("That file has no rows under its header.");
  }
  const [headerRow, ...dataRows] = rows;
  if (dataRows.length > MAX_ROWS) {
    throw new Error(`That file has more than ${MAX_ROWS.toLocaleString()} rows — try a summarized version.`);
  }

  const headers = normalizeHeaders(headerRow);
  const stringRows = dataRows.map((row) => headers.map((_, i) => row[i] ?? ""));
  const columns: ColumnSchema[] = headers.map((name, i) => ({
    name,
    dtype: inferDtype(stringRows.map((r) => r[i])),
  }));

  return {
    fileName,
    columns,
    rowCount: stringRows.length,
    csv: toCsv([headers, ...stringRows]),
    previewRows: stringRows.slice(0, 5),
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

function inferDtype(values: string[]): Dtype {
  const nonEmpty = values.map((v) => v.trim()).filter((v) => v !== "");
  if (nonEmpty.length === 0) return "categorical";

  const numericCount = nonEmpty.filter((v) => Number.isFinite(Number(v))).length;
  if (numericCount / nonEmpty.length >= 0.9) return "numeric";

  const dateCount = nonEmpty.filter((v) => !Number.isNaN(Date.parse(v))).length;
  if (dateCount / nonEmpty.length >= 0.9) return "date";

  return "categorical";
}

// No unit test for parseSpreadsheet() itself — nothing pure to check
// without a browser + a real File (same note extract.ts carries). The pure
// helpers (parseCsv, toCsv, normalizeHeaders, inferDtype, sniffDelimiter)
// are exported for spreadsheet.selfcheck.ts instead.
export { parseCsv, sniffDelimiter, normalizeHeaders, inferDtype };
