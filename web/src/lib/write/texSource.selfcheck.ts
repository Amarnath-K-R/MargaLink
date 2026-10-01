// Runnable check for texSource.ts: the LaTeX-source helpers the workspace's
// toolbar, status bar and review window use. Run: node src/lib/write/texSource.selfcheck.ts
import assert from "node:assert/strict";
import { bibEntries, bibKeys, figureSnippet, tableSnippet, findQuoteInTex, nextFigurePath, paperFiles, texInputs, texLabels, texOutline, texWordCount } from "./texSource.ts";

// 1. word count: comments, the preamble, commands and citations don't count; brace contents do
{
  const tex = `\\documentclass{article}
\\usepackage{graphicx}
\\begin{document}
% a comment with several words in it
\\section{Intro}

Some \\textbf{bold words} appear here \\cite{rao2024}.
\\end{document}`;
  assert.equal(texWordCount(tex), 6); // Intro Some bold words appear here
  assert.equal(texWordCount("\\section{Methods}\nWe did things."), 4); // a section file has no preamble
  assert.equal(texWordCount("$x = 1$ and \\[ y = 2 \\] \\begin{equation} z = 3 \\end{equation}"), 1); // "and"
  assert.equal(texWordCount(""), 0);
}

// 2. bib keys: both bracket styles, no duplicates, no @comment/@string/@preamble
{
  const bib = `@article{k1,
  title = {One}}
@Book(k2, title = {Two})
@comment{this is not an entry}
@string{jn = "Journal"}
@preamble{"x"}
@misc{k1, note = {again}}`;
  assert.deepEqual(bibKeys(bib), ["k1", "k2"]);
  assert.deepEqual(bibKeys(""), []);
}

// 3. labels: unique, not from comments
{
  const tex = `\\section{A}\\label{sec:a}
% \\label{sec:hidden}
\\begin{figure}\\label{fig:one}\\end{figure}
See \\label{sec:a} again.`;
  assert.deepEqual(texLabels(tex), ["sec:a", "fig:one"]);
}

// 4. finding a reviewer's quote in the source (best effort, 1-based line)
{
  const tex = `\\section{Results}
Nitrate pulses now arrive \\emph{eleven days} earlier \\cite{rao2024} than before.
Earlier snowmelt is changing when nitrogen
leaves mountain catchments.
% the hidden sentence lives only in a comment
The final sentence of the paragraph ends with these exact closing words.`;
  assert.equal(findQuoteInTex(tex, "pulses now arrive eleven days earlier than before"), 2); // through \emph and \cite
  assert.equal(findQuoteInTex(tex, "snowmelt is changing when nitrogen leaves mountain catchments"), 3); // wraps onto the next line
  assert.equal(findQuoteInTex(tex, "nothing like this appears anywhere"), null);
  assert.equal(findQuoteInTex(tex, "the hidden sentence lives only in a comment"), null);
  assert.equal(findQuoteInTex(tex, "Some totally different opening phrase words but ends with these exact closing words"), 6); // first six miss, last six hit
  assert.equal(findQuoteInTex(tex, ""), null);
  // short words ("of", "for") sit in the source too — the needle and the haystack must drop them alike
  assert.equal(findQuoteInTex("\\documentclass{IEEEtran}\n\\title{Bare Demo of IEEEtran.cls for IEEE Journals}", "Bare Demo of IEEEtran.cls for IEEE Journals"), 2);
}

// 5. figure snippets and the next free figure path
{
  assert.ok(figureSnippet("figures/my plot.pdf").includes("\\label{fig:my-plot}"));
  assert.ok(figureSnippet("figures/my plot.pdf").includes("\\includegraphics[width=\\linewidth]{figures/my plot.pdf}"));
  assert.equal(nextFigurePath([]), "figures/figure.pdf");
  assert.equal(nextFigurePath(["figures/figure.pdf", "main.tex"]), "figures/figure-2.pdf");
  assert.equal(nextFigurePath(["figures/figure.pdf", "figures/figure-2.pdf"]), "figures/figure-3.pdf");
}

// 6. the outline: sectioning commands in order, levels by command, starred and [short] forms, titles unwrapped, comments ignored
{
  const tex = `\\documentclass{article}
\\begin{document}
\\section{Introduction}
% \\section{Commented out}
\\subsection*{Background and aims}
\\section[Short]{A long title with \\emph{emphasis} and {braces}}
\\paragraph{A note.}
\\chapter{Ch}
\\end{document}`;
  assert.deepEqual(texOutline(tex), [
    { level: 2, title: "Introduction", line: 3 },
    { level: 3, title: "Background and aims", line: 5 },
    { level: 2, title: "A long title with emphasis and braces", line: 6 },
    { level: 5, title: "A note.", line: 7 },
    { level: 1, title: "Ch", line: 8 },
  ]);
  assert.deepEqual(texOutline("no sections here"), []);
}

// 7. inputs: \input and \include with braces, .tex added when missing, not from comments
{
  assert.deepEqual(texInputs("\\input{sections/intro}\n% \\input{old}\n\\include{methods.tex}\n\\input{sections/intro}"), ["sections/intro.tex", "methods.tex"]);
}

// 8. the paper's files: main, then what it inputs (depth first, in order), existing files only, no loops
{
  const sources = { "main.tex": "\\input{a}\n\\input{missing}\n\\include{b}", "a.tex": "\\input{c}\n\\input{main}", "b.tex": "", "c.tex": "" };
  assert.deepEqual(paperFiles("main.tex", sources), ["main.tex", "a.tex", "c.tex", "b.tex"]);
  assert.deepEqual(paperFiles("gone.tex", sources), []);
}

// 9. bib entries with their titles (for suggestions): braces and quotes, nested braces dropped, no title → null
{
  const bib = `@article{rao2024,
  title = {Soil {Microbial} Communities},
  year = 2024
}
@comment{ignore me}
@book{lee, title="Quoted Title"}
@misc{notitle,
  year = 1999 }`;
  assert.deepEqual(bibEntries(bib), [
    { key: "rao2024", title: "Soil Microbial Communities" },
    { key: "lee", title: "Quoted Title" },
    { key: "notitle", title: null },
  ]);
}

// 10. a table of a chosen size: one column spec letter per column, a header row, and the body rows
{
  const t = tableSnippet(3, 2);
  assert.ok(t.includes("\\begin{tabular}{ll}"));
  assert.equal((t.match(/\\\\$/gm) ?? []).length, 3); // three rows end in \\
  assert.ok(t.includes("Column 1 & Column 2 \\\\"));
  assert.ok(t.includes("\\caption{Caption.}") && t.includes("\\label{tab:"));
}

console.log("texSource.selfcheck: OK");
