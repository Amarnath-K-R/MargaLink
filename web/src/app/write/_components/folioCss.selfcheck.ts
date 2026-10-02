// Runnable check that the Word editor's stylesheet (Folio's standalone.css,
// imported by DocEditor.tsx) can't restyle the rest of the site. Next never
// removes a stylesheet once loaded, so after someone opens a Word project its
// rules stay for every page they visit next. Today it is safe: its reset and
// utilities are scoped under .folio-root, its own classes (.docx-*, .layout-*,
// .ProseMirror …) appear nowhere else, and the Tailwind theme variables it
// sets on :root are Tailwind's defaults, the same values our site uses. A
// Folio upgrade that breaks any of that fails here.
//   node src/app/write/_components/folioCss.selfcheck.ts
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import postcss, { type AtRule, type Declaration, type Node } from "postcss";

const web = new URL("../../../../", import.meta.url).pathname;
const css = readFileSync(join(web, "node_modules/@stll/folio-react/dist/standalone.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

// 1. no stylesheet, font or image fetched from anywhere but our own origin
assert.deepEqual(css.match(/url\(\s*["']?(?:https?:)?\/\//g) ?? [], [], "an off-origin url() in Folio's CSS");
assert.deepEqual(css.match(/@import\s+(?:url\()?["']?(?:https?:)?\/\//g) ?? [], [], "an off-origin @import");

// 2. the variables it sets on the whole page equal Tailwind's (or are its own, unused by us)
const rootVars = [...css.matchAll(/:root,:host\{([^}]*)\}/g)].flatMap((m) => [...m[1].matchAll(/(--[\w-]+):([^;]+)/g)].map((v) => [v[1], v[2]] as const));
assert.ok(rootVars.length > 0, "found Folio's :root variables (the check is reading the right thing)");
const tailwind = Object.fromEntries([...readFileSync(join(web, "node_modules/tailwindcss/theme.css"), "utf8").matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2]]));
// Same value however it's written: "0.25rem" and ".25rem", "150ms" and ".15s".
const norm = (v: string) =>
  v
    .replace(/\s+/g, "")
    .replace(/"/g, "'")
    .replace(/(^|[^\d.])0+\./g, "$1.")
    .replace(/(\d*\.?\d+)ms/g, (_, n) => `${Number(n) / 1000}s`)
    .replace(/(^|[^\d])0?\.(\d)/g, "$1.$2")
    .toLowerCase();
const FOLIOS_OWN = new Set(["--color-primary", "--color-border"]); // Folio's palette; our classes never use these names
const ours = new Set<string>();
const walk = (dir: string) => {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(tsx?|css)$/.test(f) && !f.endsWith(".selfcheck.ts")) for (const m of readFileSync(p, "utf8").matchAll(/\b(?:bg|text|border|ring|fill|stroke|from|to|via|outline|decoration|accent|caret|divide|placeholder|shadow)-(primary|border)\b/g)) ours.add(m[1]);
  }
};
walk(join(web, "src"));
for (const [name, value] of rootVars) {
  if (FOLIOS_OWN.has(name)) {
    assert.ok(![...ours].some((c) => name === `--color-${c}`), `${name} is Folio's, but our classes use it too`);
    continue;
  }
  assert.ok(name in tailwind, `${name} is set on :root by Folio but isn't a Tailwind default: it could change the rest of the site`);
  assert.equal(norm(value), norm(tailwind[name]), `${name}: Folio sets ${value}, Tailwind's default is ${tailwind[name]}`);
}

// 3. no rule reaches beyond the editor: every selector is scoped to Folio's own
// classes and attributes, except Tailwind's property fallbacks (only --tw-*
// variables) and two rules on any contenteditable, which only CodeMirror (the
// LaTeX editor) is elsewhere: it hides the native caret and selection and draws
// its own, so a caret colour, outline:none and a transparent ::selection
// change nothing there (check_write_docx confirms it on screen).
const SCOPED = /^(?::where\(\.folio-[\w-]+[^)]*\)|\.(?:folio|docx|layout|paged|hf|prosemirror|ProseMirror|image)[\w-]*|\.dark\s+\.(?:folio|docx|layout|ProseMirror)|(?:li|img)\.ProseMirror|\[data-(?:folio|tc-author)[\w-]*|\.dark\s+\[contenteditable)/;
const ANY_CONTENTEDITABLE = new Set(["[contenteditable=true]", "[contenteditable=true]::selection", "[contenteditable=true] ::selection"]);
// The selectors in a stylesheet that could match outside the editor, read by
// a CSS parser: every rule, after an @import, inside @media or @layer. A rule
// nested in another is scoped by its outer rule, which is checked itself.
function outsideSelectors(sheet: string): string[] {
  const outside = new Set<string>();
  postcss.parse(sheet).walkRules((rule) => {
    for (let up: Node | undefined = rule.parent; up; up = up.parent) {
      if (up.type === "rule") return;
      if (up.type === "atrule" && /keyframes$/.test((up as AtRule).name)) return; // keyframe steps
    }
    const decls = (rule.nodes ?? []).filter((n): n is Declaration => n.type === "decl");
    const onlyTwVars = decls.length > 0 && decls.every((d) => d.prop.startsWith("--tw-"));
    for (const raw of rule.selectors) {
      const s = raw.trim();
      if (/^(?:\*|:before|:after|::backdrop)$/.test(s) && onlyTwVars) continue; // Tailwind's own variable fallbacks
      if (/^(?::root|:host)$/.test(s) || ANY_CONTENTEDITABLE.has(s)) continue; // checked in 2; above
      if (!SCOPED.test(s)) outside.add(s);
    }
  });
  return [...outside].sort();
}
// The check reads every rule: after an @import, nested, inside @media.
assert.deepEqual(outsideSelectors('@import "./x.css";\n.leak{color:red}\n.folio-root{.inner{color:red}}\n@media (min-width:1px){p{color:red}}\n@keyframes k{from{opacity:0}}'), [".leak", "p"]);
const outside = outsideSelectors(css);
assert.deepEqual(outside, [], "selectors in Folio's CSS that could match outside the editor");

// 4. and its class names aren't ours too
const clash = /className=[^>]*\b(?:docx-|layout-page|paged-editor|hf-editor|ProseMirror)/;
const clashes: string[] = [];
const scan = (dir: string) => {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) scan(p);
    else if (/\.tsx$/.test(f) && clash.test(readFileSync(p, "utf8"))) clashes.push(p);
  }
};
scan(join(web, "src"));
assert.deepEqual(clashes, [], "our own components use Folio's class names");

console.log("folioCss.selfcheck: OK");
