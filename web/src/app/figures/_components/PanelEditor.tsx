"use client";

import { useState } from "react";
import {
  ANNOTATION_KINDS,
  CATEGORY_FAMILIES,
  layersFor,
  testsFor,
  ERROR_TYPES,
  FAMILIES,
  FAMILY_ROLES,
  LIMITS,
  ORDER_MODES,
  P_DISPLAY,
  PAIRS,
  STATS,
  TICK_FORMATS,
  defaultPanel,
  refColumn,
  type Annotation,
  type Axis,
  type Family,
  type LayerKind,
  type Panel,
  type Test,
} from "@/lib/figureSpec";
import type { Dataset } from "@/lib/spreadsheet";

const FAMILY_LABEL: Record<Family, string> = {
  bar: "Bar", box: "Box", violin: "Violin", strip: "Strip", scatter: "Scatter",
  line: "Line", histogram: "Histogram", heatmap: "Heatmap", forest: "Forest", km: "Survival (KM)",
};
const LAYER_LABEL: Record<LayerKind, string> = { points: "Individual points", mean: "Mean marker", median: "Median marker", regression: "Regression line", n: "n under each group" };
const TEST_LABEL: Record<Test, string> = {
  auto: "Automatic (Welch)", t: "Student's t", welch: "Welch's t", mannwhitney: "Mann–Whitney U", wilcoxon: "Wilcoxon (paired)",
  anova: "One-way ANOVA", kruskal: "Kruskal–Wallis", pearson: "Pearson r", spearman: "Spearman ρ", logrank: "Log-rank",
};

const field = "rounded-sm border border-line bg-paper px-2 py-1 text-sm";
const label = "flex flex-col gap-1 text-xs text-ink-soft";

function NumField({ name, value, onChange, step }: { name: string; value: number | null; onChange: (v: number | null) => void; step?: number }) {
  return (
    <label className={label}>
      {name}
      <input
        type="number"
        step={step ?? "any"}
        aria-label={name}
        className={`${field} w-24`}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
      />
    </label>
  );
}

function Section({ title, children, open }: { title: string; children: React.ReactNode; open?: boolean }) {
  return (
    <details className="border-t border-line py-3" open={open}>
      <summary className="cursor-pointer text-sm font-medium">{title}</summary>
      <div className="mt-3 flex flex-col gap-3">{children}</div>
    </details>
  );
}

function AxisFields({ name, axis, onChange }: { name: string; axis: Axis; onChange: (a: Axis) => void }) {
  const set = (patch: Partial<Axis>) => onChange({ ...axis, ...patch });
  return (
    <div className="flex flex-wrap items-end gap-3">
      <label className={label}>
        {name} label
        <input aria-label={`${name} label`} className={field} maxLength={LIMITS.text} value={axis.label} placeholder="column name" onChange={(e) => set({ label: e.target.value })} />
      </label>
      <label className={label}>
        {name} unit
        <input aria-label={`${name} unit`} className={`${field} w-24`} maxLength={LIMITS.text} value={axis.unit} onChange={(e) => set({ unit: e.target.value })} />
      </label>
      <NumField name={`${name} min`} value={axis.min} onChange={(min) => set({ min })} />
      <NumField name={`${name} max`} value={axis.max} onChange={(max) => set({ max })} />
      <label className={label}>
        Ticks
        <select aria-label={`${name} tick format`} className={field} value={axis.tickFormat} onChange={(e) => set({ tickFormat: e.target.value as Axis["tickFormat"] })}>
          {TICK_FORMATS.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-1.5 text-sm">
        <input type="checkbox" aria-label={`${name} log scale`} checked={axis.log} onChange={(e) => set({ log: e.target.checked })} />
        Log scale
      </label>
    </div>
  );
}

// Everything about one panel. Group choices are stored as "#n" (the n-th
// group in first-appearance order), shown here with their labels.
export default function PanelEditor({ panel, onChange, dataset }: { panel: Panel; onChange: (p: Panel) => void; dataset: Dataset }) {
  const set = (patch: Partial<Panel>) => onChange({ ...panel, ...patch });
  const f = panel.family;
  const refCol = refColumn(panel);
  // Group pickers only where groups sit on the category axis figurelib draws.
  const horizontal = f === "bar" && panel.horizontal;
  const groups = (CATEGORY_FAMILIES.includes(f) && !horizontal && refCol && dataset.levels[refCol]) || [];
  const layerKinds = horizontal ? [] : layersFor(f);
  const tests = horizontal ? [] : testsFor(f);
  const [pairA, setPairA] = useState("#0");
  const [pairB, setPairB] = useState("#1");

  function changeFamily(next: Family) {
    const fresh = defaultPanel(next);
    const dtype = new Map(dataset.columns.map((c) => [c.name, c.dtype]));
    for (const rule of FAMILY_ROLES[next]) {
      const kept = panel.roles[rule.role];
      if (kept && rule.dtypes.includes(dtype.get(kept)!)) fresh.roles[rule.role] = kept;
    }
    onChange({
      ...fresh,
      title: panel.title,
      x: panel.x,
      y: panel.y,
      colSpan: panel.colSpan,
      layers: panel.layers.filter((l) => layersFor(next).includes(l.kind)),
      stats: panel.stats.test && testsFor(next).includes(panel.stats.test) ? panel.stats : fresh.stats,
      annotations: panel.annotations,
    });
  }

  function toggleLayer(kind: LayerKind, on: boolean) {
    const layers = on ? [...panel.layers, { kind, ci: kind === "regression", alpha: kind === "points" ? 0.6 : null, size: null, jitter: null }] : panel.layers.filter((l) => l.kind !== kind);
    set({ layers: layers.slice(0, LIMITS.layers) });
  }

  // Order: the explicit list, then any group it doesn't name, in first-appearance order.
  const orderRefs = panel.order.mode === "explicit" ? [...panel.order.explicit, ...groups.map((_, i) => `#${i}`).filter((r) => !panel.order.explicit.includes(r))] : [];
  const move = (i: number, d: -1 | 1) => {
    const next = [...orderRefs];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    set({ order: { mode: "explicit", explicit: next.slice(0, LIMITS.explicit) } });
  };
  const groupName = (ref: string) => groups[Number(ref.slice(1))] ?? ref;

  const setAnn = (i: number, patch: Partial<Annotation>) => set({ annotations: panel.annotations.map((a, j) => (j === i ? { ...a, ...patch } : a)) });

  return (
    <div data-testid="panel-editor">
      <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-5">
        {FAMILIES.map((fam) => (
          <button
            key={fam}
            type="button"
            onClick={() => changeFamily(fam)}
            aria-pressed={f === fam}
            className={`rounded-sm border px-2 py-1.5 text-xs ${f === fam ? "border-accent bg-accent-soft" : "border-line bg-paper-alt hover:border-accent"}`}
          >
            {FAMILY_LABEL[fam]}
          </button>
        ))}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {FAMILY_ROLES[f].map((rule) => (
          <label key={rule.role} className={label}>
            {rule.role}
            {rule.required ? "" : " (optional)"}
            <select
              aria-label={`Column for ${rule.role}`}
              className={field}
              value={panel.roles[rule.role] ?? ""}
              onChange={(e) => set({ roles: { ...panel.roles, [rule.role]: e.target.value || null } })}
            >
              <option value="">{rule.required ? "Choose a column" : "None"}</option>
              {dataset.columns
                .filter((c) => rule.dtypes.includes(c.dtype))
                .map((c) => (
                  <option key={c.name} value={c.name}>
                    {c.name}
                  </option>
                ))}
            </select>
          </label>
        ))}
      </div>

      <label className={`${label} mt-3`}>
        Panel title
        <input aria-label="Panel title" className={field} maxLength={LIMITS.text} value={panel.title} onChange={(e) => set({ title: e.target.value })} />
      </label>

      <div className="mt-3">
        <Section title="Axes" open>
          {f !== "heatmap" && <AxisFields name="X" axis={panel.x} onChange={(x) => set({ x })} />}
          {f !== "heatmap" && f !== "forest" && <AxisFields name="Y" axis={panel.y} onChange={(y) => set({ y })} />}
        </Section>

        {(f === "bar" || f === "line" || f === "histogram") && (
          <Section title="Summary">
            <div className="flex flex-wrap items-end gap-3">
              {(f === "bar" || f === "line") && (
                <>
                  <label className={label}>
                    Bar height / line point
                    <select aria-label="Statistic" className={field} value={panel.stat} onChange={(e) => set({ stat: e.target.value as Panel["stat"] })}>
                      {STATS.map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                  </label>
                  <label className={label}>
                    Error
                    <select aria-label="Error type" className={field} value={panel.errorType} onChange={(e) => set({ errorType: e.target.value as Panel["errorType"] })}>
                      {ERROR_TYPES.filter((t) => t !== "column" || f === "bar").map((t) => (
                        <option key={t} value={t}>
                          {t === "ci95" ? "95% CI" : t === "column" ? "from a column" : t.toUpperCase()}
                        </option>
                      ))}
                    </select>
                  </label>
                </>
              )}
              {f === "bar" && (
                <>
                  <label className="flex items-center gap-1.5 text-sm">
                    <input type="checkbox" checked={panel.stacked} onChange={(e) => set({ stacked: e.target.checked })} />
                    Stacked
                  </label>
                  <label className="flex items-center gap-1.5 text-sm">
                    <input
                      type="checkbox"
                      checked={panel.horizontal}
                      onChange={(e) =>
                        set(
                          e.target.checked
                            ? { horizontal: true, layers: [], stats: { ...panel.stats, test: null }, annotations: panel.annotations.map((a) => ({ ...a, xGroup: null })) }
                            : { horizontal: false },
                        )
                      }
                    />
                    Horizontal (no overlays or tests)
                  </label>
                </>
              )}
              {f === "histogram" && <NumField name="Bins" value={panel.bins} step={1} onChange={(bins) => set({ bins: bins === null ? null : Math.min(LIMITS.bins[1], Math.max(LIMITS.bins[0], Math.round(bins))) })} />}
            </div>
          </Section>
        )}

        {CATEGORY_FAMILIES.includes(f) && (
          <Section title="Group order">
            <label className={label}>
              Order
              <select
                aria-label="Group order"
                className={`${field} w-48`}
                value={panel.order.mode}
                onChange={(e) => set({ order: { mode: e.target.value as Panel["order"]["mode"], explicit: [] } })}
              >
                {ORDER_MODES.map((m) => (
                  <option key={m} value={m}>
                    {{ "as-is": "As in the file", alpha: "Alphabetical", "value-asc": "By value, ascending", "value-desc": "By value, descending", explicit: "Custom" }[m]}
                  </option>
                ))}
              </select>
            </label>
            {panel.order.mode === "explicit" && (
              <ol className="flex flex-col gap-1 text-sm">
                {orderRefs.map((r, i) => (
                  <li key={r} className="flex items-center gap-2">
                    <span className="w-40 truncate">{groupName(r)}</span>
                    <button type="button" aria-label={`Move ${groupName(r)} up`} disabled={i === 0} onClick={() => move(i, -1)} className="px-1 disabled:opacity-30">
                      ↑
                    </button>
                    <button type="button" aria-label={`Move ${groupName(r)} down`} disabled={i === orderRefs.length - 1} onClick={() => move(i, 1)} className="px-1 disabled:opacity-30">
                      ↓
                    </button>
                  </li>
                ))}
              </ol>
            )}
          </Section>
        )}

        {layerKinds.length > 0 && (
          <Section title="Overlays">
            {layerKinds.map((kind) => {
              const layer = panel.layers.find((l) => l.kind === kind);
              return (
                <div key={kind} className="flex flex-wrap items-end gap-3">
                  <label className="flex w-44 items-center gap-1.5 text-sm">
                    <input type="checkbox" checked={!!layer} onChange={(e) => toggleLayer(kind, e.target.checked)} />
                    {LAYER_LABEL[kind]}
                  </label>
                  {layer && kind === "points" && (
                    <NumField name="Opacity" value={layer.alpha} step={0.1} onChange={(alpha) => set({ layers: panel.layers.map((l) => (l === layer ? { ...l, alpha } : l)) })} />
                  )}
                  {layer && kind === "regression" && (
                    <label className="flex items-center gap-1.5 text-sm">
                      <input type="checkbox" checked={layer.ci} onChange={(e) => set({ layers: panel.layers.map((l) => (l === layer ? { ...l, ci: e.target.checked } : l)) })} />
                      95% CI band
                    </label>
                  )}
                </div>
              );
            })}
          </Section>
        )}

        {tests.length > 0 && (
          <Section title="Statistics">
            <div className="flex flex-wrap items-end gap-3">
              <label className={label}>
                Test
                <select
                  aria-label="Test"
                  className={field}
                  value={panel.stats.test ?? ""}
                  onChange={(e) => set({ stats: { ...panel.stats, test: (e.target.value || null) as Test | null } })}
                >
                  <option value="">None</option>
                  {tests.map((t) => (
                    <option key={t} value={t}>
                      {TEST_LABEL[t]}
                    </option>
                  ))}
                </select>
              </label>
              {CATEGORY_FAMILIES.includes(f) && panel.stats.test && !["anova", "kruskal"].includes(panel.stats.test) && (
                <>
                  <label className={label}>
                    Compare
                    <select aria-label="Comparisons" className={field} value={panel.stats.pairs} onChange={(e) => set({ stats: { ...panel.stats, pairs: e.target.value as Panel["stats"]["pairs"] } })}>
                      {PAIRS.map((p) => (
                        <option key={p} value={p}>
                          {{ all: "Every pair", "vs-first": "Each against the first", "vs-reference": "Each against…", explicit: "Chosen pairs" }[p]}
                        </option>
                      ))}
                    </select>
                  </label>
                  {panel.stats.pairs === "vs-reference" && (
                    <label className={label}>
                      Reference group
                      <select aria-label="Reference group" className={field} value={panel.stats.reference ?? "#0"} onChange={(e) => set({ stats: { ...panel.stats, reference: e.target.value } })}>
                        {groups.map((g, i) => (
                          <option key={i} value={`#${i}`}>
                            {g}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  <label className={label}>
                    Show
                    <select aria-label="P-value display" className={field} value={panel.stats.display} onChange={(e) => set({ stats: { ...panel.stats, display: e.target.value as Panel["stats"]["display"] } })}>
                      {P_DISPLAY.map((d) => (
                        <option key={d} value={d}>
                          {{ stars: "Stars (*, **, ***)", p: "p-values", both: "Both" }[d]}
                        </option>
                      ))}
                    </select>
                  </label>
                </>
              )}
            </div>
            {CATEGORY_FAMILIES.includes(f) && panel.stats.test && panel.stats.pairs === "explicit" && (
              <div className="text-sm">
                <ul className="flex flex-col gap-1">
                  {panel.stats.explicit.map((p, i) => (
                    <li key={i} className="flex items-center gap-2">
                      {groupName(p.a)} vs {groupName(p.b)}
                      <button type="button" className="text-xs text-accent" onClick={() => set({ stats: { ...panel.stats, explicit: panel.stats.explicit.filter((_, j) => j !== i) } })}>
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
                <div className="mt-2 flex items-center gap-2">
                  {[
                    [pairA, setPairA],
                    [pairB, setPairB],
                  ].map(([v, setV], k) => (
                    <select key={k} aria-label={k ? "Second group" : "First group"} className={field} value={v as string} onChange={(e) => (setV as (s: string) => void)(e.target.value)}>
                      {groups.map((g, i) => (
                        <option key={i} value={`#${i}`}>
                          {g}
                        </option>
                      ))}
                    </select>
                  ))}
                  <button
                    type="button"
                    disabled={pairA === pairB || panel.stats.explicit.length >= LIMITS.explicit}
                    onClick={() => set({ stats: { ...panel.stats, explicit: [...panel.stats.explicit, { a: pairA, b: pairB }] } })}
                    className="rounded-sm border border-line bg-paper-alt px-2 py-1 text-xs hover:border-accent disabled:opacity-50"
                  >
                    Add pair
                  </button>
                </div>
              </div>
            )}
            <p className="text-xs text-ink-soft">Computed on this device. The first test loads a statistics library (about 14 MB, once).</p>
          </Section>
        )}

        {f !== "heatmap" && (
          <Section title={`Annotations (${panel.annotations.length})`}>
            {panel.annotations.map((a, i) => (
              <div key={i} className="flex flex-wrap items-end gap-2 border-l-2 border-line pl-2">
                <label className={label}>
                  Kind
                  <select aria-label="Annotation kind" className={field} value={a.kind} onChange={(e) => setAnn(i, { kind: e.target.value as Annotation["kind"] })}>
                    {ANNOTATION_KINDS.map((k) => (
                      <option key={k}>{k}</option>
                    ))}
                  </select>
                </label>
                {(a.kind === "text" || a.kind === "arrow") && (
                  <label className={label}>
                    Text
                    <input aria-label="Annotation text" className={field} maxLength={LIMITS.text} value={a.text} onChange={(e) => setAnn(i, { text: e.target.value })} />
                  </label>
                )}
                {groups.length > 0 && a.kind !== "hline" && a.kind !== "hspan" && (
                  <label className={label}>
                    At group
                    <select aria-label="Annotation group" className={field} value={a.xGroup ?? ""} onChange={(e) => setAnn(i, { xGroup: e.target.value || null })}>
                      <option value="">— use x —</option>
                      {groups.map((g, j) => (
                        <option key={j} value={`#${j}`}>
                          {g}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {a.kind !== "hline" && a.kind !== "hspan" && !a.xGroup && <NumField name="x" value={a.x} onChange={(x) => setAnn(i, { x })} />}
                {a.kind !== "vline" && a.kind !== "vspan" && <NumField name="y" value={a.y} onChange={(y) => setAnn(i, { y })} />}
                {(a.kind === "arrow" || a.kind === "vspan") && <NumField name="x2" value={a.x2} onChange={(x2) => setAnn(i, { x2 })} />}
                {(a.kind === "arrow" || a.kind === "hspan") && <NumField name="y2" value={a.y2} onChange={(y2) => setAnn(i, { y2 })} />}
                <button type="button" className="pb-1 text-xs text-accent" onClick={() => set({ annotations: panel.annotations.filter((_, j) => j !== i) })}>
                  Remove
                </button>
              </div>
            ))}
            <button
              type="button"
              disabled={panel.annotations.length >= LIMITS.annotations}
              onClick={() => set({ annotations: [...panel.annotations, { kind: "hline", text: "", x: null, y: 0, x2: null, y2: null, xGroup: null }] })}
              className="self-start rounded-sm border border-line bg-paper-alt px-2 py-1 text-xs hover:border-accent disabled:opacity-50"
            >
              Add annotation
            </button>
          </Section>
        )}

        <Section title="Panel options">
          <div className="flex flex-wrap items-end gap-4 text-sm">
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={panel.legend} onChange={(e) => set({ legend: e.target.checked })} />
              Legend
            </label>
            {f === "km" && (
              <>
                <label className="flex items-center gap-1.5">
                  <input type="checkbox" checked={panel.atRiskTable} onChange={(e) => set({ atRiskTable: e.target.checked })} />
                  Numbers-at-risk table
                </label>
                <label className="flex items-center gap-1.5">
                  <input type="checkbox" checked={panel.censorTicks} onChange={(e) => set({ censorTicks: e.target.checked })} />
                  Censoring ticks
                </label>
              </>
            )}
            <NumField name="Columns spanned" value={panel.colSpan} step={1} onChange={(v) => set({ colSpan: Math.max(1, Math.round(v ?? 1)) })} />
          </div>
        </Section>
      </div>
    </div>
  );
}
