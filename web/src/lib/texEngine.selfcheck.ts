// Runnable check for texEngine.ts. Run directly: node src/lib/texEngine.selfcheck.ts
import assert from "node:assert/strict";
import { DATA_PACKS, ENGINE_BASE_URL, ENGINE_FILES, packsFor } from "./texEngine.ts";

// the packs a paper's \usepackage lines need, beyond the always-loaded ones, in DATA_PACKS order
assert.deepEqual(packsFor("\\usepackage{siunitx}\n\\usepackage{graphicx}"), ["latex-recommended", "science"]);
assert.deepEqual(packsFor("\\usepackage{tikz,siunitx}"), ["latex-extra", "science"]);
assert.deepEqual(packsFor("\\documentclass{article}\\begin{document}Hi\\end{document}"), [], "no packages, no extra packs");
assert.deepEqual(packsFor("\\usepackage[utf8]{inputenc}\n\\usepackage{amsmath, booktabs}"), ["latex-recommended"], "option brackets and comma lists");
assert.deepEqual(packsFor("% \\usepackage{tikz}\n\\usepackage{lmodern}"), ["fonts-recommended"], "a commented-out package doesn't count");
assert.deepEqual(packsFor("\\RequirePackage{hyperref}"), ["latex-recommended"], "RequirePackage (in .cls/.sty) counts too");

// every pack names a .js/.data pair; basic and latex-base always load
const always = DATA_PACKS.filter((p) => p.always).map((p) => p.name);
assert.deepEqual(always, ["texlive-basic", "latex-base"]);
for (const p of DATA_PACKS) assert.ok(p.js.endsWith(".js") && p.data.endsWith(".data") && p.mb > 0, p.name);
assert.ok(ENGINE_FILES.includes("busytex.wasm") && ENGINE_FILES.includes("busytex_pipeline.js"));
assert.ok(/^https:\/\//.test(ENGINE_BASE_URL) && !ENGINE_BASE_URL.endsWith("/"));

console.log("texEngine.selfcheck: OK");
