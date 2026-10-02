"use client";

import { useEffect, useState } from "react";
import { errorMessage } from "@/lib/errorMessage";
import ErrorText from "@/components/ui/ErrorText";
import FigureStudio from "@/app/figures/_components/FigureStudio";
import { readRecipe, type Recipe } from "@/app/figures/_components/RecipeImportExport";
import type { FiguresApi } from "@/app/figures/_components/useFigures";

// The Figures window: the whole figure studio (over the same useFigures as
// /figures), with "Insert into paper" in place of "Add to a paper": the
// figure is exported at 300 dpi in the workspace's `format` (a PDF and its
// data-free recipe for LaTeX, a PNG for Word) and lands at the cursor. `pendingRecipe` (a .figure.json
// opened in the file tree) is applied once a spreadsheet is attached.
export default function FiguresWindow({
  figures: f,
  pendingRecipe,
  onRecipeApplied,
  compiling,
  format,
  onInsert,
}: {
  figures: FiguresApi;
  pendingRecipe: string | null;
  onRecipeApplied: (note: string | null) => void;
  compiling: boolean;
  format: "pdf" | "png";
  onInsert: (image: Uint8Array, recipe: Recipe) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { dataset, loadRecipe } = f;
  useEffect(() => {
    if (!pendingRecipe || !dataset) return;
    const r = readRecipe(pendingRecipe, dataset.columns);
    if (typeof r === "string") onRecipeApplied(r);
    else {
      loadRecipe(r);
      onRecipeApplied(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per recipe, when the data arrives
  }, [pendingRecipe, dataset]);

  const insert = async () => {
    if (!f.spec) return;
    setBusy(true);
    setError(null);
    try {
      const image = (await f.onExport([format], 300))[format];
      if (!image) throw new Error(`The ${format.toUpperCase()} export came back empty. Try Export first to see why.`);
      await onInsert(Uint8Array.from(atob(image), (c) => c.charCodeAt(0)), { version: 1, spec: f.spec, hook: f.hookApproved ? f.hook : null });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div data-testid="figures-window">
      {pendingRecipe && !f.dataset && (
        <p className="mb-4 rounded-sm border border-line bg-paper-alt p-3 text-sm">Attach the spreadsheet this figure was drawn from; its settings will then be applied.</p>
      )}
      <FigureStudio
        figures={f}
        exportExtra={
          <>
            <button
              type="button"
              onClick={() => void insert()}
              disabled={!f.spec || !!f.problem || compiling || busy}
              title={compiling ? "Wait for the compile to finish" : undefined}
              className="rounded-sm border border-line bg-paper-alt px-4 py-1.5 hover:border-accent disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy ? "Inserting…" : "Insert into paper"}
            </button>
            {error && <ErrorText>{error}</ErrorText>}
          </>
        }
      />
    </div>
  );
}
