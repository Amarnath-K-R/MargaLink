// Runnable check for latexText.ts. Run directly: node src/lib/writing/latexText.selfcheck.ts
// proseMask: the spelling checker reads LaTeX as prose, so markup is blanked to
// spaces in a copy of the same length, and a mark's position in the copy is its
// position in the source.
import assert from "node:assert/strict";
import { fromPassage, proseMask, toPassage, type Passage } from "./latexText.ts";

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
// citation, reference and glossary keys under any of their commands aren't words
assert.equal(
  visible("\\Citet{smth} and \\textcite{x} \\citenum{y} \\subref{fig:slep} \\bibitem{zhang} \\gls{psg} \\Glspl{psg} \\acrshort{osa} \\ac{osa} \\definecolor{mygren}{rgb}{0,1,0} \\newtheorem{thm}{Theorem} \\lstinline|x = y| \\lstinline{y} \\href{https://x.org}{the link}"),
  "and the link",
);
// a word with an accent command is one word, read whole or not at all
assert.equal(visible("Schr\\\"odinger and M\\\"uller met in Ko\\v{s}ice at a caf\\'e."), "and met in at a .");
same("caf\\'e \\\"");

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

// --- Rewrite's passage: what isn't prose travels as numbered placeholders, kept exactly
const P = (n: number) => `\u27e6${n}\u27e7`;
const doc = [
  "\\section{Intro}",
  "Sleep was \\emph{short}~\\cite[p.~3]{smith2019} after surgery ($n = 412$).",
  "% a note to self",
  "See Figure~\\ref{fig:a} and \\href{https://x.org}{the registry}.",
  "\\begin{equation}",
  "E = mc^2",
  "\\end{equation}",
  "It recovered \\verb|x| by day 90 \\begin{itemize}\\item fast\\end{itemize}",
].join("\n");
const passage = (from: number, to: number) => {
  const p = toPassage(doc, from, to);
  assert.ok(typeof p !== "string", `a passage: ${p}`);
  return p as Passage;
};
const from = doc.indexOf("Sleep");
const to = doc.indexOf("registry}.") + "registry}.".length;
const p = passage(from, to);
assert.equal(p.passage, `Sleep was \\emph{short}~${P(1)} after surgery (${P(2)}).\n${P(3)}\nSee Figure~${P(4)} and ${P(5)}{the registry}.`, "formatting commands stay in the text");
assert.deepEqual(p.parts, ["\\cite[p.~3]{smith2019}", "$n = 412$", "% a note to self", "\\ref{fig:a}", "\\href{https://x.org}"]);
assert.deepEqual([p.from, p.to], [from, to]);
assert.equal(fromPassage(p.passage, p.parts), doc.slice(from, to), "the round trip is exact");
assert.equal(fromPassage(`After surgery (${P(2)}) sleep was \\emph{brief}~${P(1)}.\n${P(3)}\nFigure~${P(4)} and ${P(5)}{the registry} show it.`, p.parts),
  "After surgery ($n = 412$) sleep was \\emph{brief}~\\cite[p.~3]{smith2019}.\n% a note to self\nFigure~\\ref{fig:a} and \\href{https://x.org}{the registry} show it.", "parts go back by number");
// a comment runs to the end of its line: text an answer put after one goes to the next line (seen live)
assert.equal(fromPassage(`One. ${P(3)} Two.`, p.parts), "One. % a note to self\nTwo.");
assert.equal(fromPassage(`One. ${P(3)}\nTwo.`, p.parts), "One. % a note to self\nTwo.");
assert.equal(fromPassage(`One. ${P(3)}`, p.parts), "One. % a note to self", "nothing added at the end");
// maths environments, \verb and \begin/\end travel whole
assert.deepEqual(passage(doc.indexOf("See"), doc.length).parts, ["\\ref{fig:a}", "\\href{https://x.org}", "\\begin{equation}\nE = mc^2\n\\end{equation}", "\\verb|x|", "\\begin{itemize}", "\\end{itemize}"]);
// the range is narrowed to the text: the blank lines around a selection stay where they are
const padded = passage(from - 1, to + 1);
assert.deepEqual([padded.from, padded.to], [from, to]);

// refused: a selection that cuts through markup, or already has Rewrite's brackets
const refusedAt = (f: number, t: number, why: string, text = doc) => assert.equal(typeof toPassage(text, f, t), "string", why);
refusedAt(doc.indexOf("emph"), to, "starting inside a command's name");
refusedAt(from, doc.indexOf("\\emph") + 3, "ending inside a command's name");
refusedAt(doc.indexOf("smith2019"), to, "starting inside a citation");
refusedAt(doc.indexOf("n = 412"), to, "starting inside maths");
refusedAt(from, doc.indexOf("mc^2"), "ending inside an equation");
refusedAt(doc.indexOf("note to self"), to, "starting inside a comment");
refusedAt(doc.indexOf("short}"), to, "starting inside an argument");
refusedAt(from, doc.indexOf("short}") + 2, "ending inside an argument");
refusedAt(0, 8, "a selection holding Rewrite's brackets", "A \u27e61\u27e7 b.");
refusedAt(0, 7, "maths left open", "Text $x and more");
refusedAt(0, 0, "nothing selected");

console.log("latexText.selfcheck: OK");
