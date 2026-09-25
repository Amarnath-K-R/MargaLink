// Runnable check for texLog.ts: real TeX log excerpts → line-anchored
// diagnostics for the editor. Run directly: node src/lib/texLog.selfcheck.ts
import assert from "node:assert/strict";
import { parseTexLog } from "./texLog.ts";

// 1. an undefined command in main.tex, with its l.N line
{
  const log = `This is pdfTeX, Version 3.141592653
(./main.tex
LaTeX2e <2023-11-01>
(/usr/share/texlive/texmf-dist/tex/latex/base/article.cls
Document Class: article 2023/05/17 v1.4n Standard LaTeX document class
(/usr/share/texlive/texmf-dist/tex/latex/base/size10.clo))
! Undefined control sequence.
l.42 \\undefinedcommand

? `;
  const d = parseTexLog(log);
  assert.deepEqual(d[0], { kind: "error", file: "main.tex", line: 42, message: "Undefined control sequence" });
}

// 2. a missing package names the data pack that provides it
{
  const d = parseTexLog(`(./main.tex
! LaTeX Error: File \`siunitx.sty' not found.

Type X to quit or <RETURN> to proceed,
l.5 \\usepackage
                {booktabs}^^M`);
  assert.equal(d[0].kind, "missing-package");
  assert.equal(d[0].message, "siunitx.sty not found");
  assert.equal(d[0].pack, "science");
  assert.equal(d[0].line, 5);
}

// 3. an undefined citation warning carries its input line
{
  const d = parseTexLog(`(./main.tex
LaTeX Warning: Citation \`smith2020' on page 3 undefined on input line 88.
)`);
  assert.deepEqual(d[0], { kind: "warning", file: "main.tex", line: 88, message: "Citation 'smith2020' on page 3 undefined" });
}

// 4. an overfull box warning points at the first line of its paragraph
{
  const d = parseTexLog(`(./main.tex
Overfull \\hbox (12.3pt too wide) in paragraph at lines 10--12
[]\\OT1/cmr/m/n/10 Some text|
)`);
  assert.equal(d[0].kind, "warning");
  assert.equal(d[0].line, 10);
  assert.equal(d[0].message, "Overfull \\hbox (12.3pt too wide)");
}

// 5. the file is tracked through nested includes: the error is in sections/intro.tex
{
  const d = parseTexLog(`(./main.tex (/usr/share/texlive/texmf-dist/tex/latex/amsmath/amsmath.sty
Package: amsmath 2023/05/13 v2.17o AMS math features
) (./sections/intro.tex
Chapter 1.
! Missing $ inserted.
<inserted text>
                $
l.7 The value x_
                1 is small.`);
  assert.deepEqual(d[0], { kind: "error", file: "sections/intro.tex", line: 7, message: "Missing $ inserted" });
}

// 6. a closed include pops back to the parent file
{
  const d = parseTexLog(`(./main.tex (./sections/intro.tex
Intro text.
) (./figures/fig.tex)
! Undefined control sequence.
l.20 \\foo`);
  assert.equal(d[0].file, "main.tex", "after intro.tex and fig.tex close, the error is back in main.tex");
}

// 7. an emergency stop is an error even without l.N
{
  const d = parseTexLog(`(./main.tex
! Emergency stop.
<*> main.tex

*** (job aborted, no legal \\end found)`);
  assert.equal(d[0].kind, "error");
  assert.equal(d[0].message, "Emergency stop");
}

// 8. parentheses inside messages don't confuse the file tracker
{
  const d = parseTexLog(`(./main.tex
Package hyperref Warning: Token not allowed in a PDF string (Unicode):
(hyperref)                removing \`math shift' on input line 12.
! Undefined control sequence.
l.30 \\bar`);
  const err = d.find((x) => x.kind === "error")!;
  assert.equal(err.file, "main.tex");
  assert.equal(err.line, 30);
}

// 9. empty log, and a cap
assert.deepEqual(parseTexLog(""), []);
assert.equal(parseTexLog(Array.from({ length: 300 }, (_, i) => `LaTeX Warning: Reference \`r${i}' on page 1 undefined on input line ${i}.`).join("\n")).length, 200);

console.log("texLog.selfcheck: OK");
