"use client";

// THROWAWAY: exercises parseSpreadsheet() through a real upload so
// `npm run build` forces Turbopack to resolve read-excel-file's lazy
// import for real, before anything else in the feature depends on it
// working under static export. Replaced by the real route in a later step.
import { useState } from "react";
import { parseSpreadsheet, type Dataset } from "@/lib/spreadsheet";

export default function FiguresPageThrowaway() {
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onFile(file: File) {
    setError(null);
    try {
      setDataset(await parseSpreadsheet(file));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <main style={{ padding: 40 }}>
      <h1>Figures (throwaway build check)</h1>
      <input
        type="file"
        accept=".csv,.xlsx"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void onFile(file);
        }}
      />
      {error && <p>{error}</p>}
      {dataset && (
        <pre>{JSON.stringify({ fileName: dataset.fileName, columns: dataset.columns, rowCount: dataset.rowCount }, null, 2)}</pre>
      )}
    </main>
  );
}
