// Runnable check for latexText.ts. Run directly: node src/lib/writing/latexText.selfcheck.ts
// proseMask: the spelling checker reads LaTeX as prose, so markup is blanked to
// spaces in a copy of the same length, and a mark's position in the copy is its
// position in the source.
import assert from "node:assert/strict";
import { proseMask } from "./latexText.ts";

// What's left readable, with the blanked runs squeezed (positions checked separately).
const visible = (tex: string) => proseMask(tex).replace(/\s+/g, " ").trim();
// The mask keeps every character's place: same length, same line breaks.
function same(tex: string) {
  const m = proseMask(tex);
  assert.equal(m.length, tex.length, `same length: ${JSON.stringify(tex)}`);
  for (let i = 0; i < tex.length; i++) if (tex[i] === "\n") assert.equal(m[i], "\n", "line breaks kept");
  return m;
}
// A word in the mask sits exactly where it is in the source.
function at(tex: string, word: string) {
  const m = same(tex);
  const i = tex.indexOf(word);
  assert.equal(m.slice(i, i + word.length), word, `"${word}" kept in place`);
}

// prose passes through
at("Sleep was shorter after surgery.", "shorter");

// the preamble is markup; a file without one (an \input'd section) is all body
assert.equal(visible("\\documentclass{article}\n\\usepackage{graphicx}\n\\title{Slep}\n\\begin{document}\nHello wrld.\n\\end{document}"), "Hello wrld.");
at("\\documentclass{article}\n\\begin{document}\nHello wrld.\n\\end{document}", "wrld");
assert.equal(visible("Just a sectin of text."), "Just a sectin of text.");

// citations, references, labels, graphics, inputs and URLs: their arguments aren't prose
assert.equal(visible("We cite \\cite{misspeled} and \\citep[p.~3]{smth2019} here."), "We cite and here.");
assert.equal(visible("See Figure~\\ref{fig:slep} and \\eqref{eq:1}, \\label{sec:intro}"), "See Figure and ,");
assert.equal(visible("\\includegraphics[width=3cm]{figures/plot.png} \\input{sections/methds} \\url{https://exmple.org}"), "");
assert.equal(visible("\\href{https://exmple.org}{the registry}"), "the registry");

// formatting and sectioning: the command goes, its text stays, in place
at("An \\emph{importnt} result.", "importnt");
at("\\section{Introducton}\nText.", "Introducton");
at("\\textbf{Bold \\textit{nestd} words}", "nestd");
at("\\footnote{A side remrk.}", "remrk");
at("\\caption{Readmisson by group.}", "Readmisson");

// maths, inline and displayed, and maths environments: blanked whole
assert.equal(visible("Where $x = teh$ and $$y$$ and \\(z\\) and \\[w\\] hold."), "Where and and and hold.");
assert.equal(visible("\\begin{equation}\nE = mc^2\n\\end{equation}\nAfter."), "After.");
// LaTeX's dashes are markup for the typeset dash; a hyphen is text
assert.equal(visible("Pages 1--8 were read---twice, a well-known rule."), "Pages 1 8 were read twice, a well-known rule.");
same("a--b---c");
assert.equal(visible("\\begin{align*}\na &= b \\\\\nc &= d\n\\end{align*}"), "");

// verbatim stays out: code isn't prose
assert.equal(visible("Run \\verb|mispelt --flag| now. \\begin{verbatim}\nwrng code\n\\end{verbatim}"), "Run now.");

// comments go; an escaped percent sign is a percent sign
assert.equal(visible("Sleep fell. % TODO chek this\nNext line."), "Sleep fell. Next line.");
at("Rose by 26\\% overall.", "%");
assert.equal(visible("Rose by 26\\% overall."), "Rose by 26 % overall.");

// ties, line breaks, alignment and TeX quotes read as the prose they stand for
assert.equal(visible("Figure~3 is \\\\ here & there."), "Figure 3 is here there.");
assert.equal(visible("``Quoted words''"), '"Quoted words"');

// environments' names aren't prose, their contents are
assert.equal(visible("\\begin{itemize}\n\\item First pont.\n\\end{itemize}"), "First pont.");

// broken LaTeX never throws and keeps its length
for (const broken of ["\\emph{unclosed", "}{ stray", "$ unclosed maths", "\\", "\\begin{equation} no end", "%"]) same(broken);

console.log("latexText.selfcheck: OK");
