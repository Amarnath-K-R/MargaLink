import { snippetCompletion, type Completion, type CompletionContext, type CompletionResult } from "@codemirror/autocomplete";

// Suggestions while typing LaTeX, from the project's own files (nothing is
// fetched): .bib keys inside \cite{…} (several, comma-separated), labels
// inside \ref{…}, environments after \begin{ (the matching \end is
// written too), and common commands after a backslash, as snippets whose
// fields Tab moves through.
export type CompletionData = { entries: { key: string; title: string | null }[]; labels: string[] };

const ENVIRONMENTS = [
  "abstract", "align", "align*", "center", "description", "enumerate", "equation", "equation*", "figure", "figure*",
  "gather", "itemize", "lemma", "minipage", "multline", "proof", "quote", "table", "table*", "tabular", "theorem", "verbatim",
];

const COMMANDS: Completion[] = [
  snippetCompletion("\\section{${Title}}", { label: "\\section", detail: "heading" }),
  snippetCompletion("\\subsection{${Title}}", { label: "\\subsection", detail: "heading" }),
  snippetCompletion("\\subsubsection{${Title}}", { label: "\\subsubsection", detail: "heading" }),
  snippetCompletion("\\paragraph{${Title}}", { label: "\\paragraph", detail: "heading" }),
  snippetCompletion("\\textbf{${text}}", { label: "\\textbf", detail: "bold" }),
  snippetCompletion("\\textit{${text}}", { label: "\\textit", detail: "italic" }),
  snippetCompletion("\\emph{${text}}", { label: "\\emph", detail: "emphasis" }),
  snippetCompletion("\\texttt{${text}}", { label: "\\texttt", detail: "monospace" }),
  snippetCompletion("\\underline{${text}}", { label: "\\underline" }),
  snippetCompletion("\\cite{${key}}", { label: "\\cite", detail: "citation" }),
  snippetCompletion("\\citep{${key}}", { label: "\\citep", detail: "citation (natbib)" }),
  snippetCompletion("\\citet{${key}}", { label: "\\citet", detail: "citation (natbib)" }),
  snippetCompletion("\\ref{${label}}", { label: "\\ref", detail: "cross-reference" }),
  snippetCompletion("\\eqref{${label}}", { label: "\\eqref", detail: "equation reference" }),
  snippetCompletion("\\label{${label}}", { label: "\\label" }),
  snippetCompletion("\\footnote{${text}}", { label: "\\footnote" }),
  snippetCompletion("\\url{${address}}", { label: "\\url" }),
  snippetCompletion("\\href{${address}}{${text}}", { label: "\\href" }),
  snippetCompletion("\\includegraphics[width=\\linewidth]{${figures/file.pdf}}", { label: "\\includegraphics", detail: "figure file" }),
  snippetCompletion("\\caption{${Caption.}}", { label: "\\caption" }),
  snippetCompletion("\\frac{${a}}{${b}}", { label: "\\frac", detail: "maths" }),
  snippetCompletion("\\sqrt{${x}}", { label: "\\sqrt", detail: "maths" }),
  snippetCompletion("\\input{${file}}", { label: "\\input", detail: "another .tex file" }),
  snippetCompletion("\\usepackage{${package}}", { label: "\\usepackage" }),
  { label: "\\item", detail: "list item", apply: "\\item " },
  { label: "\\centering" },
  { label: "\\maketitle" },
  { label: "\\hline", detail: "table rule" },
  { label: "\\noindent" },
  { label: "\\newpage" },
  { label: "\\clearpage" },
];

const envCompletion = (env: string): Completion => ({
  label: env,
  type: "type",
  // "\begin{" usually has an auto-closed "}" after the cursor: swallow it.
  apply: (view, _c, from, to) => {
    const close = view.state.sliceDoc(to, to + 1) === "}" ? 1 : 0;
    const line = view.state.doc.lineAt(from);
    const indent = /^\s*/.exec(line.text)?.[0] ?? "";
    const insert = `${env}}\n${indent}  \n${indent}\\end{${env}}`;
    const cursor = from + env.length + 2 + indent.length + 2;
    view.dispatch({ changes: { from, to: to + close, insert }, selection: { anchor: cursor } });
  },
});

export function latexCompletions(data: () => CompletionData) {
  return (ctx: CompletionContext): CompletionResult | null => {
    const before = ctx.state.sliceDoc(Math.max(0, ctx.pos - 300), ctx.pos);
    const cite = /\\(?:no|paren|text|auto|foot)?cite(?:[tp]|author|year)?\*?(?:\[[^\]]*\])*\{([^{}]*)$/.exec(before);
    if (cite) {
      const typed = cite[1].slice(cite[1].lastIndexOf(",") + 1).trimStart();
      return {
        from: ctx.pos - typed.length,
        options: data().entries.map((e) => ({ label: e.key, detail: e.title ?? undefined, type: "text" })),
        validFor: /^[^,}\s]*$/,
      };
    }
    const ref = /\\(?:ref|eqref|autoref|cref|Cref|pageref|nameref)\{([^{}]*)$/.exec(before);
    if (ref) return { from: ctx.pos - ref[1].length, options: data().labels.map((l) => ({ label: l, type: "variable" })), validFor: /^[^}\s]*$/ };
    const begin = /\\begin\{([A-Za-z*]*)$/.exec(before);
    if (begin) return { from: ctx.pos - begin[1].length, options: ENVIRONMENTS.map(envCompletion), validFor: /^[A-Za-z*]*$/ };
    const cmd = ctx.matchBefore(/\\[A-Za-z]*$/);
    if (cmd && (cmd.to - cmd.from > 1 || ctx.explicit)) return { from: cmd.from, options: COMMANDS, validFor: /^\\[A-Za-z]*$/ };
    return null;
  };
}
