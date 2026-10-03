// LaTeX read as prose, for the spelling and grammar checker (grammar.ts),
// which has no LaTeX mode. Pure; latexText.selfcheck.ts runs it.

// Commands whose arguments aren't prose: citations, references, labels,
// files, URLs and set-up. Each is blanked with its arguments.
const NOT_PROSE = new Set([
  "cite", "citep", "citet", "citealp", "citealt", "citeauthor", "citeyear", "nocite", "parencite", "textcite", "autocite", "footcite", "fullcite",
  "ref", "eqref", "autoref", "cref", "Cref", "pageref", "nameref", "vref", "label",
  "url", "includegraphics", "input", "include", "includeonly", "bibliography", "bibliographystyle", "addbibresource", "printbibliography",
  "usepackage", "documentclass", "graphicspath", "hypersetup", "newcommand", "renewcommand", "providecommand", "def", "let",
  "setlength", "addtolength", "setcounter", "vspace", "hspace", "includepdf", "lstinputlisting", "newenvironment", "renewenvironment",
  "bibitem", "definecolor", "newtheorem", "lstinline", "index",
]);
// ... and any citation or reference command (\Citet, \citenum, \subref), and glossary and acronym entries (\gls, \acrshort, \ac).
const notProse = (name: string) => NOT_PROSE.has(name) || (/cite|ref$|refrange$/i.test(name) && name !== "href") || /^(gls\w*|acr\w*|ac[slf]?p?)$/i.test(name);
// Accent commands: a word with one in it (Schr\"odinger, Ko\v{s}ice) is read whole or not at all.
const ACCENT = /^\\(?:["'`^~=.]|(?:[vuHcdbtrk]|ss|o|O|ae|AE|oe|OE|aa|AA|l|L|i|j)(?![A-Za-z]))/;
// Environments whose contents aren't prose: maths, code and drawings. Blanked whole.
const MATH = /^(equation|align|alignat|flalign|gather|multline|eqnarray|displaymath|math|split)\*?$/;
const CODE = /^(verbatim|Verbatim|lstlisting|minted|comment|tikzpicture|pgfpicture|picture|axis|semilogxaxis|semilogyaxis|loglogaxis|polaraxis)\*?$/;
// Environments with a set-up argument (a column spec, a width) after \begin{…}.
const SPEC_ARGS: Record<string, number> = { tabular: 1, "tabular*": 2, tabularx: 2, array: 1, longtable: 1, minipage: 1, wrapfigure: 2 };

// The runs of markup in LaTeX source. "hidden": what isn't prose and must
// be kept exactly (comments, maths, code, \verb, the notProse commands
// with their arguments, \begin and \end with their set-up, an \href's URL);
// "command": any other command's name and options (\emph, \section[short]),
// whose {text} is prose; "escape": \% and the like; "symbol": \\, \, and
// the like; "accent": a whole word with an accent command in it; TeX's
// quotes and dashes; "mark": a brace, tie or alignment mark.
type Run = "hidden" | "command" | "escape" | "symbol" | "accent" | "open-quote" | "close-quote" | "dash" | "mark";

function scan(tex: string, start: number, visit: (run: Run, from: number, to: number) => void): void {
  // the index after a {…} group starting at i (nested, escapes skipped), or i if there's none
  const group = (i: number, open = "{", close = "}") => {
    let j = i;
    while (tex[j] === " ") j++;
    if (tex[j] !== open) return i;
    let depth = 0;
    for (; j < tex.length; j++) {
      if (tex[j] === "\\") j++;
      else if (tex[j] === open) depth++;
      else if (tex[j] === close && --depth === 0) return j + 1;
    }
    return tex.length;
  };
  const options = (i: number) => {
    let j = i;
    for (let next = group(j, "[", "]"); next !== j; next = group(j, "[", "]")) j = next;
    return j;
  };
  // the whole word around an accent command at i: where it starts and ends
  const accented = (i: number) => {
    let a = i;
    while (a > 0 && /[A-Za-z{}]/.test(tex[a - 1])) a--;
    let b = i;
    for (;;) {
      const n = ACCENT.exec(tex.slice(b, b + 4))?.[0].length ?? 0;
      if (n) b += n;
      else if (/[A-Za-z{}]/.test(tex[b] ?? "")) b++;
      else break;
    }
    return [a, b];
  };
  // where `end` next occurs at or after i (its end), or the end of the text
  const until = (i: number, end: string) => {
    const at = tex.indexOf(end, i);
    return at < 0 ? tex.length : at + end.length;
  };

  let i = start;
  while (i < tex.length) {
    const at = i;
    const c = tex[i];
    if (c === "%") {
      const eol = tex.indexOf("\n", i);
      i = eol < 0 ? tex.length : eol;
      visit("hidden", at, i);
    } else if (c === "\\" && ACCENT.test(tex.slice(i, i + 4))) {
      const [a, b] = accented(i);
      i = b;
      visit("accent", a, b);
    } else if (c === "\\") {
      const name = /^[A-Za-z@]+\*?/.exec(tex.slice(i + 1, i + 40))?.[0];
      if (!name) {
        const next = tex[i + 1];
        if (next === "(" || next === "[") {
          i = until(i + 2, next === "(" ? "\\)" : "\\]");
          visit("hidden", at, i);
        } else {
          i = Math.min(i + 2, tex.length);
          visit(next !== undefined && "%&$#_{}".includes(next) ? "escape" : "symbol", at, i);
        }
        continue;
      }
      const after = i + 1 + name.length;
      if (name === "begin" || name === "end") {
        const argEnd = group(after);
        const env = tex.slice(after, argEnd).replace(/^\s*\{|\}$/g, "");
        if (name === "begin" && (MATH.test(env) || CODE.test(env))) i = until(argEnd, `\\end{${env}}`);
        else {
          i = argEnd;
          if (name === "begin") {
            i = options(i);
            for (let n = SPEC_ARGS[env] ?? 0; n > 0; n--) i = group(i);
          }
        }
        visit("hidden", at, i);
      } else if (name === "verb" || name === "verb*" || (name === "lstinline" && !"{[".includes(tex[after]))) {
        const delim = tex[after];
        const close = delim ? tex.indexOf(delim, after + 1) : -1;
        i = close < 0 ? tex.length : close + 1;
        visit("hidden", at, i);
      } else if (notProse(name.replace(/\*$/, ""))) {
        i = options(after);
        for (let next = group(i); next !== i; next = options(group(i))) i = next;
        visit("hidden", at, i);
      } else if (name === "href") {
        i = group(after); // the URL; the link text is prose
        visit("hidden", at, i);
      } else {
        i = options(after); // \section[short]{Long}: the command and its options; the {text} is prose
        visit("command", at, i);
      }
    } else if (c === "$") {
      const display = tex[i + 1] === "$";
      i = tex.length;
      for (let j = at + (display ? 2 : 1); j < tex.length; j++) {
        if (tex[j] === "\\") j++;
        else if (tex[j] === "$" && (!display || tex[j + 1] === "$")) {
          i = j + (display ? 2 : 1);
          break;
        }
      }
      visit("hidden", at, i);
    } else if ((c === "`" || c === "'") && tex[i + 1] === c) {
      i += 2;
      visit(c === "`" ? "open-quote" : "close-quote", at, i);
    } else if (c === "-" && tex[i + 1] === "-") {
      i += tex[i + 2] === "-" ? 3 : 2; // -- and ---: LaTeX's dashes, not text
      visit("dash", at, i);
    } else {
      i++;
      if (c === "{" || c === "}" || c === "~" || c === "&") visit("mark", at, i);
    }
  }
}

/**
 * A copy of LaTeX source with everything that isn't prose blanked to spaces:
 * the preamble, commands, citations and their keys, maths, code, comments,
 * braces, ties and alignment marks. The text of \emph{…}, \section{…},
 * \caption{…} and the like stays where it is, and line breaks are kept, so
 * any position in the copy is the same position in the source.
 */
export function proseMask(tex: string): string {
  const out = tex.split("");
  const blank = (from: number, to: number) => {
    for (let k = Math.max(0, from); k < Math.min(to, tex.length); k++) if (out[k] !== "\n") out[k] = " ";
  };
  let start = 0;
  const begin = tex.indexOf("\\begin{document}");
  if (begin >= 0) {
    start = begin + "\\begin{document}".length;
    blank(0, start);
  }
  scan(tex, start, (run, from, to) => {
    if (run === "escape") blank(from, from + 1); // an escaped character is that character
    else if (run === "open-quote") out.splice(from, 2, " ", '"');
    else if (run === "close-quote") out.splice(from, 2, '"', " ");
    else blank(from, to);
  });
  const end = tex.indexOf("\\end{document}");
  if (end >= 0) blank(end, tex.length);
  return out.join("");
}

export type Passage = { passage: string; parts: string[]; from: number; to: number };
const CUT = "Select whole sentences: this selection starts or ends inside a command, maths, a comment or an argument.";

/**
 * Rewrite's passage for the selection [from, to) of `doc`: what isn't prose
 * (the "hidden" runs above) replaced by placeholders ⟦1⟧…⟦k⟧ in order, its
 * source kept in `parts`; formatting commands stay in the text, where the
 * answer's check (rewrite.ts) guards them. The range is narrowed past the
 * whitespace at its ends. Refused when the selection cuts through markup.
 */
export function toPassage(doc: string, from: number, to: number): Passage | string {
  while (from < to && /\s/.test(doc[from])) from++;
  while (to > from && /\s/.test(doc[to - 1])) to--;
  if (from >= to) return "Select some text to rewrite.";
  const sel = doc.slice(from, to);
  if (/[⟦⟧]/.test(sel)) return "This selection holds ⟦ or ⟧, which Rewrite uses itself.";
  const parts: string[] = [];
  let passage = "";
  let at = from;
  let cut = false;
  scan(doc, 0, (run, a, b) => {
    if ((a < from && from < b) || (a < to && to < b)) cut = true;
    else if (run === "hidden" && from <= a && b <= to) {
      passage += `${doc.slice(at, a)}⟦${parts.length + 1}⟧`;
      parts.push(doc.slice(a, b));
      at = b;
    }
  });
  passage += doc.slice(at, to);
  if (cut) return CUT;
  let depth = 0;
  for (const c of passage.replace(/\\[{}]/g, "")) if ((depth += c === "{" ? 1 : c === "}" ? -1 : 0) < 0) return CUT;
  return depth ? CUT : { passage, parts, from, to };
}

/**
 * A checked answer with each placeholder's source put back. A comment runs to
 * the end of its line, so text an answer put after one on the same line
 * starts the next line instead of being commented out.
 */
export function fromPassage(text: string, parts: string[]): string {
  return text.replace(/\u27e6(\d+)\u27e7([ \t]*)(?=([\s\S]?))/g, (_, n: string, space: string, next: string) => {
    const part = parts[Number(n) - 1];
    return part.startsWith("%") && next !== "" && next !== "\n" ? `${part}\n` : part + space;
  });
}
