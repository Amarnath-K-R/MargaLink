"use client";

import { CHART_ROLES, NOTE_MAX_CHARS, buildFigurePayload, type ChartType, type FigureSpec } from "@/lib/figureSchema";
import type { Dataset } from "@/lib/spreadsheet";

// Labels/descriptions for the 7 v1 chart types — same pattern as
// review/_components/TierPicker.tsx's TIER_OPTIONS living next to the
// component that renders it.
const CHART_OPTIONS: { value: ChartType; label: string; description: string }[] = [
  { value: "bar-error", label: "Bar (with error bars)", description: "Compare group means, optionally with error bars." },
  { value: "box", label: "Box plot", description: "Distribution and spread within each group." },
  { value: "scatter", label: "Scatter", description: "Relationship between two numeric variables." },
  { value: "line", label: "Line", description: "A trend across an ordered or numeric x-axis." },
  { value: "histogram", label: "Histogram", description: "Distribution of one numeric variable." },
  { value: "grouped-bar", label: "Grouped bar", description: "Compare groups side-by-side within categories." },
  { value: "stacked-bar", label: "Stacked bar", description: "Compare groups stacked within categories." },
];

export default function FigureSpecForm({
  dataset,
  spec,
  onChange,
}: {
  dataset: Dataset;
  spec: FigureSpec;
  onChange: (next: FigureSpec) => void;
}) {
  const roleDefs = CHART_ROLES[spec.chartType];
  const payload = buildFigurePayload(dataset, spec);

  function setRole(role: string, columnName: string) {
    const nextRoles = { ...spec.roles };
    if (columnName) {
      nextRoles[role as keyof typeof nextRoles] = columnName;
    } else {
      delete nextRoles[role as keyof typeof nextRoles];
    }
    onChange({ ...spec, roles: nextRoles });
  }

  return (
    <div>
      <div className="grid gap-2 sm:grid-cols-3">
        {CHART_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange({ chartType: opt.value, roles: {}, note: spec.note })}
            aria-pressed={spec.chartType === opt.value}
            className={`rounded-sm border p-3 text-left text-sm transition-colors ${
              spec.chartType === opt.value ? "border-accent bg-accent-soft" : "border-line bg-paper-alt hover:border-accent"
            }`}
          >
            <p className="font-medium">{opt.label}</p>
            <p className="mt-0.5 text-xs text-ink-soft">{opt.description}</p>
          </button>
        ))}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {roleDefs.map((def) => {
          const options = dataset.columns.filter((c) => def.dtypes.includes(c.dtype));
          return (
            <label key={def.role} className="flex flex-col gap-1">
              <span className="text-sm text-ink-soft">
                {def.role}
                {def.required ? "" : " (optional)"}
              </span>
              <select
                value={spec.roles[def.role] ?? ""}
                onChange={(e) => setRole(def.role, e.target.value)}
                className="rounded-sm border border-line bg-paper px-2 py-1.5"
              >
                <option value="">{def.required ? "Choose a column" : "None"}</option>
                {options.map((c) => (
                  <option key={c.name} value={c.name}>
                    {c.name} ({c.dtype})
                  </option>
                ))}
              </select>
            </label>
          );
        })}
      </div>

      <label className="mt-4 flex flex-col gap-1">
        <span className="text-sm text-ink-soft">Style note (optional)</span>
        <input
          type="text"
          value={spec.note}
          maxLength={NOTE_MAX_CHARS}
          onChange={(e) => onChange({ ...spec, note: e.target.value })}
          placeholder="e.g. use a muted palette, log scale on y"
          className="rounded-sm border border-line bg-paper px-3 py-2"
        />
      </label>

      <div className="mt-4">
        <p className="mb-1 text-sm font-medium text-accent">Exactly what would be sent</p>
        <pre data-testid="figure-payload" className="overflow-x-auto rounded-sm border border-line bg-paper-alt p-3 text-xs">
          {JSON.stringify(payload, null, 2)}
        </pre>
      </div>
    </div>
  );
}
