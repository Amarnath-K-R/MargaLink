"use client";

// THROWAWAY: exercises parseSpreadsheet() through a real upload, then
// figureRunner.runFigureCode() through a HARDCODED matplotlib snippet
// (never a real Claude call) — de-risking Pyodide-in-a-worker with real
// data, end to end in a real browser, before figurePrompt.ts/functions/api/figure.ts
// exist at all. Replaced by the real route in a later step.
import { useState } from "react";
import { parseSpreadsheet, type Dataset } from "@/lib/spreadsheet";
import { runFigureCode, warmUp, type ProgressStage } from "@/lib/figureRunner";

const HARDCODED_SNIPPET = `
counts = df["group"].value_counts()
fig, ax = plt.subplots(figsize=(5, 4))
ax.bar(counts.index.astype(str), counts.values, color="#2c5f6f")
ax.set_xlabel("group")
ax.set_ylabel("count")
ax.set_title("Throwaway build-check chart")
`;

export default function FiguresPageThrowaway() {
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stage, setStage] = useState<ProgressStage | "idle" | "done">("idle");
  const [pngSrc, setPngSrc] = useState<string | null>(null);

  async function onFile(file: File) {
    setError(null);
    setPngSrc(null);
    try {
      const ds = await parseSpreadsheet(file);
      setDataset(ds);
      warmUp(setStage); // start loading Pyodide the moment we have a file, same as the real flow will
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function onRunHardcoded() {
    if (!dataset) return;
    setError(null);
    setPngSrc(null);
    try {
      const images = await runFigureCode(HARDCODED_SNIPPET, dataset.csv, setStage);
      setStage("done");
      setPngSrc(`data:image/png;base64,${images.png}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <main style={{ padding: 40 }}>
      <h1>Figures (throwaway Pyodide build check)</h1>
      <input
        type="file"
        accept=".csv,.xlsx"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void onFile(file);
        }}
      />
      <p>stage: {stage}</p>
      {error && <p style={{ color: "red" }}>{error}</p>}
      {dataset && (
        <>
          <pre>{JSON.stringify({ fileName: dataset.fileName, columns: dataset.columns, rowCount: dataset.rowCount }, null, 2)}</pre>
          <button type="button" onClick={() => void onRunHardcoded()}>
            Run hardcoded chart against real data
          </button>
        </>
      )}
      {pngSrc && <img data-testid="figure-image" src={pngSrc} alt="Throwaway test chart" />}
    </main>
  );
}
