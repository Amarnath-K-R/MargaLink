"use client";

import { DTYPES, type Dataset, type Dtype, type PrepOptions, type Workbook } from "@/lib/spreadsheet";

const input = "rounded-sm border border-line bg-paper px-2 py-1.5 text-sm";
const THOUSANDS: { value: PrepOptions["thousands"]; label: string }[] = [
  { value: "", label: "None" },
  { value: ",", label: "Comma (1,234)" },
  { value: ".", label: "Dot (1.234)" },
  { value: " ", label: "Space (1 234)" },
  { value: "'", label: "Apostrophe (1'234)" },
];

// How the file is read: sheet, header row, missing-value markers, number
// format, per-column types, and an optional wide→long stack — with the
// parsed result shown right under it, so a mis-read is visible before any
// figure is drawn. Everything here is local; nothing is sent.
export default function DataPrep({
  workbook,
  options,
  onChange,
  dataset,
  sourceColumns,
}: {
  workbook: Workbook;
  options: PrepOptions;
  onChange: (next: PrepOptions) => void;
  dataset: Dataset | null;
  sourceColumns: string[];
}) {
  const set = (patch: Partial<PrepOptions>) => onChange({ ...options, ...patch });
  const reshape = options.reshape;
  const setOverride = (name: string, dtype: string) => {
    const next = { ...options.typeOverrides };
    if (dtype) next[name] = dtype as Dtype;
    else delete next[name];
    set({ typeOverrides: next });
  };
  const toggleStacked = (name: string, on: boolean) => {
    const current = reshape?.valueColumns ?? [];
    const valueColumns = on ? [...current, name] : current.filter((c) => c !== name);
    set({
      reshape: valueColumns.length
        ? {
            valueColumns,
            idColumns: sourceColumns.filter((c) => !valueColumns.includes(c)),
            varName: reshape?.varName ?? "variable",
            valueName: reshape?.valueName ?? "value",
          }
        : null,
    });
  };

  return (
    <div data-testid="data-prep">
      <div className="grid gap-3 sm:grid-cols-5">
        {workbook.sheets.length > 1 && (
          <label className="flex flex-col gap-1 text-sm text-ink-soft">
            Sheet
            <select className={input} value={options.sheet} onChange={(e) => set({ sheet: Number(e.target.value), headerRow: 0, typeOverrides: {}, reshape: null })}>
              {workbook.sheets.map((s, i) => (
                <option key={s.name} value={i}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="flex flex-col gap-1 text-sm text-ink-soft">
          Header is on row
          <input
            type="number"
            min={1}
            className={input}
            aria-label="Header row"
            value={options.headerRow + 1}
            onChange={(e) => set({ headerRow: Math.max(0, (Number(e.target.value) || 1) - 1) })}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-ink-soft">
          Decimal mark
          <select className={input} aria-label="Decimal mark" value={options.decimal} onChange={(e) => set({ decimal: e.target.value as PrepOptions["decimal"] })}>
            <option value=".">Dot (1.5)</option>
            <option value=",">Comma (1,5)</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm text-ink-soft">
          Thousands separator
          <select className={input} aria-label="Thousands separator" value={options.thousands} onChange={(e) => set({ thousands: e.target.value as PrepOptions["thousands"] })}>
            {THOUSANDS.map((t) => (
              <option key={t.label} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm text-ink-soft">
          Missing-value markers
          <input
            className={input}
            aria-label="Missing-value markers"
            defaultValue={options.naTokens.join(" ")}
            onBlur={(e) => set({ naTokens: e.target.value.split(/\s+/).filter(Boolean) })}
          />
        </label>
      </div>

      <details className="mt-4 text-sm" open={!!reshape}>
        <summary className="cursor-pointer text-accent">Stack columns (wide → long)</summary>
        <p className="mt-2 text-ink-soft">
          Tick repeated measures (e.g. week1, week2, week3) to turn them into one row per measure — the shape most figures need.
        </p>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
          {sourceColumns.map((c) => (
            <label key={c} className="flex items-center gap-1.5">
              <input type="checkbox" checked={reshape?.valueColumns.includes(c) ?? false} onChange={(e) => toggleStacked(c, e.target.checked)} />
              {c}
            </label>
          ))}
        </div>
        {reshape && (
          <div className="mt-2 flex gap-3">
            <label className="flex flex-col gap-1 text-ink-soft">
              Name for the stacked labels
              <input className={input} value={reshape.varName} onChange={(e) => set({ reshape: { ...reshape, varName: e.target.value } })} />
            </label>
            <label className="flex flex-col gap-1 text-ink-soft">
              Name for the values
              <input className={input} value={reshape.valueName} onChange={(e) => set({ reshape: { ...reshape, valueName: e.target.value } })} />
            </label>
          </div>
        )}
      </details>

      {dataset && (
        <div className="mt-4 overflow-x-auto">
          <table data-testid="preview-table" className="w-full border-collapse text-left text-xs">
            <thead>
              <tr>
                {dataset.columns.map((c) => (
                  <th key={c.name} className="border-b border-line px-2 py-1 align-bottom font-medium">
                    <div>{c.name}</div>
                    <select
                      aria-label={`Type of ${c.name}`}
                      data-dtype={c.dtype}
                      className="mt-1 rounded-sm border border-line bg-paper px-1 py-0.5 font-normal"
                      value={options.typeOverrides[c.name] ?? ""}
                      onChange={(e) => setOverride(c.name, e.target.value)}
                    >
                      <option value="">{c.dtype} (auto)</option>
                      {DTYPES.map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                    {dataset.coerced[c.name] > 0 && (
                      <div className="mt-1 font-normal text-ink-soft">{dataset.coerced[c.name]} non-numbers left empty</div>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dataset.previewRows.map((row, i) => (
                <tr key={i}>
                  {row.map((cell, j) => (
                    <td key={j} className={`border-b border-line px-2 py-1 ${dataset.columns[j].dtype === "numeric" ? "text-right tabular-nums" : ""}`}>
                      {cell === "" ? <span className="text-ink-soft">—</span> : cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-ink-soft">
            {dataset.rowCount.toLocaleString()} rows × {dataset.columns.length} columns{dataset.sheetName !== dataset.fileName ? ` from sheet “${dataset.sheetName}”` : ""}. First 5 rows as the figure will read them.
          </p>
        </div>
      )}
    </div>
  );
}
