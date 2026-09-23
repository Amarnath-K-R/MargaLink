// Runnable check for figureTemplates.ts and the committed gallery JSON.
//   node src/lib/figureTemplates.selfcheck.ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { checkSpecAgainstColumns, validateFigureSpec } from "./figureSpec.ts";
import { bindTemplate, type Gallery } from "./figureTemplates.ts";
import type { ColumnSchema } from "./spreadsheet.ts";

const gallery = JSON.parse(readFileSync(new URL("../../public/figure-gallery/templates.json", import.meta.url), "utf8")) as Gallery;
const byId = Object.fromEntries(gallery.templates.map((t) => [t.id, t]));

// 1. every template is a valid spec, bound correctly to its own sample, and rebinding to that sample is a no-op
assert.equal(gallery.templates.length, 14);
for (const t of gallery.templates) {
  const cols = gallery.samples[t.sample];
  assert.ok(cols, `${t.id}: unknown sample ${t.sample}`);
  assert.equal(typeof validateFigureSpec(t.spec), "object", `${t.id}: ${validateFigureSpec(t.spec)}`);
  assert.equal(checkSpecAgainstColumns(cols, t.spec), null, t.id);
  assert.deepEqual(bindTemplate(t, cols).panels.map((p) => p.roles), t.spec.panels.map((p) => p.roles), `${t.id} rebinds to itself`);
}

// 2. a user dataset with different names: roles land on compatible, distinct columns
const mine: ColumnSchema[] = [
  { name: "site", dtype: "categorical" },
  { name: "treatment", dtype: "categorical" },
  { name: "score", dtype: "numeric" },
  { name: "age", dtype: "numeric" },
];
{
  const s = bindTemplate(byId["grouped-bar"], mine);
  assert.deepEqual([s.panels[0].roles.x, s.panels[0].roles.y, s.panels[0].roles.group], ["site", "score", "treatment"]);
  assert.equal(checkSpecAgainstColumns(mine, s), null);
  const sc = bindTemplate(byId["scatter"], mine);
  assert.deepEqual([sc.panels[0].roles.x, sc.panels[0].roles.y], ["score", "age"], "x and y get distinct columns");
  assert.equal(typeof validateFigureSpec(bindTemplate(byId["compound-2"], mine)), "object");
}

// 3. a numeric-only dataset binds scatter but leaves bar.x null (and says so)
{
  const nums: ColumnSchema[] = [{ name: "a", dtype: "numeric" }, { name: "b", dtype: "numeric" }];
  assert.equal(checkSpecAgainstColumns(nums, bindTemplate(byId["scatter"], nums)), null);
  const bar = bindTemplate(byId["bar-error"], nums);
  assert.equal(bar.panels[0].roles.x, null);
  assert.match(String(checkSpecAgainstColumns(nums, bar)), /choose a column for "x"/);
}

// 4. binding never mutates the template, and clears sample-specific text
{
  const t = structuredClone(byId["box"]);
  t.spec.panels[0].title = "Sample title";
  t.spec.panels[0].y.label = "Change";
  const s = bindTemplate(t, mine);
  assert.equal(s.panels[0].title, "");
  assert.equal(s.panels[0].y.label, "");
  assert.equal(t.spec.panels[0].roles.x, "arm");
}

console.log("figureTemplates.selfcheck: OK");
