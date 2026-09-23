"use client";

import { LIMITS, PALETTES, SIZE_PRESETS, STYLE_PRESETS, type FigureSpec } from "@/lib/figureSpec";

const field = "rounded-sm border border-line bg-paper px-2 py-1 text-sm";
const label = "flex flex-col gap-1 text-xs text-ink-soft";
const STYLE_LABEL: Record<FigureSpec["style"], string> = {
  nature: "Nature (7 pt sans, a b c)",
  science: "Science (7 pt sans, A B C)",
  medical: "Medical journals (8 pt sans)",
  ieee: "IEEE (8 pt serif)",
  minimal: "Minimal (9 pt, slides)",
};
const SIZE_LABEL: Record<FigureSpec["size"], string> = { single: "Single column (89 mm)", double: "Double column (183 mm)", custom: "Custom" };
// A starting set for custom colours: Okabe–Ito, colour-blind safe.
const SEED = ["#E69F00", "#56B4E9", "#009E73", "#F0E442", "#0072B2", "#D55E00"];

// Whole-figure settings: journal style, size, palette and the panel grid.
export default function StyleBar({ spec, onChange }: { spec: FigureSpec; onChange: (s: FigureSpec) => void }) {
  const set = (patch: Partial<FigureSpec>) => onChange({ ...spec, ...patch });
  const setLayout = (patch: Partial<FigureSpec["layout"]>) => set({ layout: { ...spec.layout, ...patch } });
  const clampMm = (v: string) => (v === "" ? null : Math.min(LIMITS.mm[1], Math.max(LIMITS.mm[0], Number(v))));

  return (
    <div data-testid="style-bar" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className={label}>
          Journal style
          <select aria-label="Journal style" className={field} value={spec.style} onChange={(e) => set({ style: e.target.value as FigureSpec["style"] })}>
            {STYLE_PRESETS.map((s) => (
              <option key={s} value={s}>
                {STYLE_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
        <label className={label}>
          Size
          <select aria-label="Figure size" className={field} value={spec.size} onChange={(e) => set({ size: e.target.value as FigureSpec["size"] })}>
            {SIZE_PRESETS.map((s) => (
              <option key={s} value={s}>
                {SIZE_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
        {spec.size === "custom" && (
          <label className={label}>
            Width (mm)
            <input type="number" aria-label="Width in mm" className={`${field} w-20`} defaultValue={spec.widthMm ?? 120} onBlur={(e) => set({ widthMm: clampMm(e.target.value) })} />
          </label>
        )}
        <label className={label}>
          Height (mm)
          <input
            type="number"
            aria-label="Height in mm"
            placeholder="auto"
            className={`${field} w-20`}
            defaultValue={spec.heightMm ?? ""}
            onBlur={(e) => set({ heightMm: clampMm(e.target.value) })}
          />
        </label>
        <label className={label}>
          Palette
          <select
            aria-label="Palette"
            className={field}
            value={spec.palette}
            onChange={(e) => {
              const palette = e.target.value as FigureSpec["palette"];
              set({ palette, colors: palette === "custom" && spec.colors.length === 0 ? SEED : spec.colors });
            }}
          >
            {PALETTES.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </label>
        {spec.palette === "custom" && (
          <div className="flex items-end gap-1">
            {spec.colors.map((c, i) => (
              <input
                key={i}
                type="color"
                aria-label={`Colour ${i + 1}`}
                value={c}
                onChange={(e) => set({ colors: spec.colors.map((x, j) => (j === i ? e.target.value : x)) })}
                className="h-7 w-7 cursor-pointer border border-line"
              />
            ))}
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label className={label}>
          Rows
          <input type="number" min={1} max={LIMITS.cells} aria-label="Rows" className={`${field} w-16`} value={spec.layout.rows} onChange={(e) => setLayout({ rows: Math.max(1, Number(e.target.value) || 1) })} />
        </label>
        <label className={label}>
          Columns
          <input type="number" min={1} max={LIMITS.cells} aria-label="Columns" className={`${field} w-16`} value={spec.layout.cols} onChange={(e) => setLayout({ cols: Math.max(1, Number(e.target.value) || 1) })} />
        </label>
        <label className="flex items-center gap-1.5 text-sm">
          <input type="checkbox" checked={spec.layout.letters} onChange={(e) => setLayout({ letters: e.target.checked })} />
          Panel letters
        </label>
        <label className="flex items-center gap-1.5 text-sm">
          <input type="checkbox" checked={spec.layout.sharedLegend} onChange={(e) => setLayout({ sharedLegend: e.target.checked })} />
          One shared legend
        </label>
      </div>
    </div>
  );
}
