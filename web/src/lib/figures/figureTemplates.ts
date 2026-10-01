// Gallery templates: specs written against the sample datasets (see
// web/figurelib/render_gallery.py, which also renders the thumbnails), and
// the rebinding that points a template at the user's own columns.
import { FAMILY_ROLES, type FigureSpec } from "./figureSpec.ts";
import type { ColumnSchema } from "./spreadsheet.ts";

export type Template = { id: string; title: string; description: string; sample: string; spec: FigureSpec };
export type Gallery = { samples: Record<string, ColumnSchema[]>; templates: Template[] };

export async function loadTemplates(): Promise<Template[]> {
  const res = await fetch("/figure-gallery/templates.json");
  if (!res.ok) throw new Error(`Couldn't load the figure templates (HTTP ${res.status}).`);
  return ((await res.json()) as Gallery).templates;
}

// Rebinds every role the template uses to a column of a compatible type:
// the same-named column if the dataset has one, otherwise the first
// compatible column not already used in that panel. A role nothing fits is
// left null, so checkSpecAgainstColumns names it for the user. Text and
// group references belong to the sample data, so they're cleared.
export function bindTemplate(template: Template, columns: ColumnSchema[]): FigureSpec {
  const spec: FigureSpec = structuredClone(template.spec);
  for (const p of spec.panels) {
    const used = new Set<string>();
    for (const rule of FAMILY_ROLES[p.family]) {
      const wanted = p.roles[rule.role];
      if (!wanted) continue;
      const fits = columns.filter((c) => rule.dtypes.includes(c.dtype) && !used.has(c.name));
      const pick = fits.find((c) => c.name === wanted) ?? fits[0] ?? null;
      p.roles[rule.role] = pick?.name ?? null;
      if (pick) used.add(pick.name);
    }
    p.title = "";
    for (const axis of [p.x, p.y]) Object.assign(axis, { label: "", unit: "", min: null, max: null });
    p.order = { mode: p.order.mode === "explicit" ? "as-is" : p.order.mode, explicit: [] };
    p.stats = { ...p.stats, explicit: [], reference: null, pairs: p.stats.pairs === "explicit" ? "all" : p.stats.pairs };
    p.annotations = [];
  }
  return spec;
}
