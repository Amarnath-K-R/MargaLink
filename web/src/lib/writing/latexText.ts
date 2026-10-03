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
  "bibitem", "definecolor", "newtheorem", "lstinline",
]);
// ... and any citation or reference command (\Citet, \citenum, \subref), and glossary and acronym entries (\gls, \acrshort, \ac).
const notProse = (name: string) => NOT_PROSE.has(name) || (/cite|ref$/i.test(name) && name !== "href") || /^(gls\w*|acr\w*|ac[slf]?p?)$/i.test(name);
// Accent commands: a word with one in it (Schr\"odinger, Ko\v{s}ice) is read whole or not at all.
const ACCENT = /^\\(?:["'`^~=.]|(?:[vuHcdbtrk]|ss|o|O|ae|AE|oe|OE|aa|AA|l|L|i|j)(?![A-Za-z]))/;
// Environments whose contents aren't prose: maths and code. Blanked whole.
const MATH = /^(equation|align|alignat|flalign|gather|multline|eqnarray|displaymath|math|split)\*?$/;
const CODE = /^(verbatim|Verbatim|lstlisting|minted|comment)\*?$/;
// Environments with a set-up argument (a column spec, a width) after \begin{…}.
const SPEC_ARGS: Record<string, number> = { tabular: 1, "tabular*": 2, tabularx: 2, array: 1, longtable: 1, minipage: 1, wrapfigure: 2 };

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
  // the whole word around an accent command at i (its end)
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
    blank(a, b);
    return b;
  };
  // where `end` next occurs at or after i (its end), or the end of the text
  const until = (i: number, end: string) => {
    const at = tex.indexOf(end, i);
    return at < 0 ? tex.length : at + end.length;
  };

  let i = 0;
  const begin = tex.indexOf("\\begin{document}");
  if (begin >= 0) {
    i = begin + "\\begin{document}".length;
    blank(0, i);
  }
  while (i < tex.length) {
    const c = tex[i];
    if (c === "%") {
      const eol = tex.indexOf("\n", i);
      const to = eol < 0 ? tex.length : eol;
      blank(i, to);
      i = to;
    } else if (c === "\\" && ACCENT.test(tex.slice(i, i + 4))) {
      i = accented(i);
    } else if (c === "\\") {
      const name = /^[A-Za-z@]+\*?/.exec(tex.slice(i + 1, i + 40))?.[0];
      if (!name) {
        const next = tex[i + 1];
        if (next === "(" || next === "[") {
          const to = until(i + 2, next === "(" ? "\\)" : "\\]");
          blank(i, to);
          i = to;
        } else if (next !== undefined && "%&$#_{}".includes(next)) {
          blank(i, i + 1); // an escaped character is that character
          i += 2;
        } else {
          blank(i, i + 2); // \\, \, \; \' and the like
          i += 2;
        }
        continue;
      }
      const after = i + 1 + name.length;
      if (name === "begin" || name === "end") {
        const argEnd = group(after);
        const env = tex.slice(after, argEnd).replace(/^\s*\{|\}$/g, "");
        if (name === "begin" && (MATH.test(env) || CODE.test(env))) {
          const to = until(argEnd, `\\end{${env}}`);
          blank(i, to);
          i = to;
          continue;
        }
        let to = argEnd;
        if (name === "begin") {
          to = options(to);
          for (let n = SPEC_ARGS[env] ?? 0; n > 0; n--) to = group(to);
        }
        blank(i, to);
        i = to;
      } else if (name === "verb" || name === "verb*" || (name === "lstinline" && !"{[".includes(tex[after]))) {
        const delim = tex[after];
        const close = delim ? tex.indexOf(delim, after + 1) : -1;
        const to = close < 0 ? tex.length : close + 1;
        blank(i, to);
        i = to;
      } else if (notProse(name.replace(/\*$/, ""))) {
        let to = options(after);
        for (let next = group(to); next !== to; next = options(group(to))) to = next;
        blank(i, to);
        i = to;
      } else if (name === "href") {
        const to = group(after); // the URL; the link text stays
        blank(i, to);
        i = to;
      } else {
        const to = options(after); // \section[short]{Long}: the command and its options go, the {text} stays
        blank(i, to);
        i = to;
      }
    } else if (c === "$") {
      const display = tex[i + 1] === "$";
      let to = tex.length;
      for (let j = i + (display ? 2 : 1); j < tex.length; j++) {
        if (tex[j] === "\\") j++;
        else if (tex[j] === "$" && (!display || tex[j + 1] === "$")) {
          to = j + (display ? 2 : 1);
          break;
        }
      }
      blank(i, to);
      i = to;
    } else if (c === "`" && tex[i + 1] === "`") {
      out[i] = " ";
      out[i + 1] = '"';
      i += 2;
    } else if (c === "'" && tex[i + 1] === "'") {
      out[i] = '"';
      out[i + 1] = " ";
      i += 2;
    } else if (c === "-" && tex[i + 1] === "-") {
      const to = tex[i + 2] === "-" ? i + 3 : i + 2; // -- and ---: LaTeX's dashes, not text
      blank(i, to);
      i = to;
    } else {
      if (c === "{" || c === "}" || c === "~" || c === "&") out[i] = " ";
      i++;
    }
  }
  const end = tex.indexOf("\\end{document}");
  if (end >= 0) blank(end, tex.length);
  return out.join("");
}
