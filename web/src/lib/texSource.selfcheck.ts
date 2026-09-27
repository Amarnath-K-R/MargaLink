// Runnable check for texSource.ts: the LaTeX-source helpers the workspace's
// toolbar, status bar and review window use. Run: node src/lib/texSource.selfcheck.ts
import assert from "node:assert/strict";
import { bibKeys, figureSnippet, findQuoteInTex, nextFigurePath, texLabels, texWordCount } from "./texSource.ts";

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
}

// 5. figure snippets and the next free figure path
{
  assert.ok(figureSnippet("figures/my plot.pdf").includes("\\label{fig:my-plot}"));
  assert.ok(figureSnippet("figures/my plot.pdf").includes("\\includegraphics[width=\\linewidth]{figures/my plot.pdf}"));
  assert.equal(nextFigurePath([]), "figures/figure.pdf");
  assert.equal(nextFigurePath(["figures/figure.pdf", "main.tex"]), "figures/figure-2.pdf");
  assert.equal(nextFigurePath(["figures/figure.pdf", "figures/figure-2.pdf"]), "figures/figure-3.pdf");
}

console.log("texSource.selfcheck: OK");
