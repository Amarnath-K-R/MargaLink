"use client";

import { useRef, useState } from "react";
import ErrorText from "@/components/ErrorText";
import { checkSpecAgainstColumns, validateFigureSpec, type FigureSpec } from "@/lib/figureSpec";
import { isCodeSafeToRun } from "@/lib/figureRunner";
import type { ColumnSchema } from "@/lib/spreadsheet";

export type Recipe = { version: 1; spec: FigureSpec; hook: string | null };

// Parses and checks an uploaded recipe; returns it or a plain-language reason.
export function readRecipe(text: string, columns: ColumnSchema[]): Recipe | string {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return "That file isn't a figure recipe (not valid JSON).";
  }
  const r = raw as Partial<Recipe> | null;
  if (!r || r.version !== 1 || !("spec" in r)) return "That file isn't a figure recipe.";
  const spec = validateFigureSpec(r.spec);
  if (typeof spec === "string") return `The recipe's figure isn't valid: ${spec}`;
  const fit = checkSpecAgainstColumns(columns, spec);
  if (fit) return `The recipe doesn't fit this data: ${fit}`;
  const hook = typeof r.hook === "string" && r.hook.trim() ? r.hook : null;
  if (hook) {
    const unsafe = isCodeSafeToRun(hook);
    if (unsafe) return unsafe;
  }
  return { version: 1, spec, hook };
}

// A recipe is the whole figure as JSON — settings and any custom tweak, never
// data — so the same figure can be redrawn later or on updated numbers.
export default function RecipeImportExport({
  spec,
  hook,
  columns,
  onLoad,
}: {
  spec: FigureSpec;
  hook: string | null;
  columns: ColumnSchema[];
  onLoad: (r: Recipe) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function download() {
    const recipe: Recipe = { version: 1, spec, hook };
    const url = URL.createObjectURL(new Blob([JSON.stringify(recipe, null, 2)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "figure-recipe.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function upload(file: File) {
    setError(null);
    const r = readRecipe(await file.text(), columns);
    if (typeof r === "string") setError(r);
    else onLoad(r);
  }

  return (
    <div data-testid="recipe">
      <div className="flex flex-wrap gap-3 text-sm">
        <button type="button" onClick={download} className="rounded-sm border border-line bg-paper-alt px-3 py-1.5 hover:border-accent">
          Save recipe
        </button>
        <button type="button" onClick={() => inputRef.current?.click()} className="rounded-sm border border-line bg-paper-alt px-3 py-1.5 hover:border-accent">
          Load recipe
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".json,application/json"
          aria-label="Recipe file"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void upload(f);
          }}
        />
      </div>
      {error && <ErrorText>{error}</ErrorText>}
    </div>
  );
}
