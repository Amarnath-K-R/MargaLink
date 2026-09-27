// Pure helpers over LaTeX source, for the writing workspace: a rough word
// count for the status bar, the citation keys and labels the Insert menu
// offers, where a reviewer's quote sits in the source, and the snippets the
// workspace inserts. Best effort throughout — none of this parses TeX.

// Strips a line's comment (an unescaped %).
const uncomment = (line: string) => line.replace(/(^|[^\\])%.*$/, "$1");

// A rough word count of a .tex file: the preamble (when there is one),
// comments, maths, and commands that carry no prose (\cite, \ref, \label,
// \includegraphics, \begin/\end) are dropped; the contents of other commands'
// braces (\section{…}, \textbf{…}) count.
export function texWordCount(tex: string): number {
  let body = tex.split("\n").map(uncomment).join("\n");
  const start = body.indexOf("\\begin{document}");
  if (start >= 0) body = body.slice(start + "\\begin{document}".length);
  const end = body.indexOf("\\end{document}");
  if (end >= 0) body = body.slice(0, end);
  body = body
    .replace(/\\begin\{(equation|align|gather|multline|eqnarray|displaymath)\*?\}[\s\S]*?\\end\{\1\*?\}/g, " ")
    .replace(/\\\[[\s\S]*?\\\]/g, " ")
    .replace(/\$\$[\s\S]*?\$\$/g, " ")
    .replace(/\$[^$\n]*\$/g, " ")
    .replace(/\\(?:cite\w*|ref|eqref|autoref|label|includegraphics|input|include|bibliography\w*|usepackage|documentclass|begin|end)\*?(?:\[[^\]]*\])*\{[^}]*\}/g, " ")
    .replace(/\\[A-Za-z@]+\*?(?:\[[^\]]*\])*/g, " ")
    .replace(/[{}~\\]/g, " ");
  return body.split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w)).length;
}

// The citation keys defined in a .bib file, in order, without duplicates.
export function bibKeys(bib: string): string[] {
  const out: string[] = [];
  for (const m of bib.matchAll(/@(\w+)\s*[({]\s*([^,\s{}()]+)\s*,/g)) {
    if (/^(comment|string|preamble)$/i.test(m[1]) || out.includes(m[2])) continue;
    out.push(m[2]);
  }
  return out;
}

// The \label{…}s in a .tex file (outside comments), in order, without duplicates.
export function texLabels(tex: string): string[] {
  const out: string[] = [];
  for (const line of tex.split("\n")) {
    for (const m of uncomment(line).matchAll(/\\label\{([^}]*)\}/g)) if (!out.includes(m[1])) out.push(m[1]);
  }
  return out;
}

// Plain lowercase words of three letters or more (the source and the quote
// are reduced alike, so "of" and "a" can't keep them apart), with the markup
// that a PDF's text wouldn't show removed.
function plainWords(line: string): string {
  let s = uncomment(line).replace(/\\(?:cite\w*|ref|eqref|autoref|label)\*?(?:\[[^\]]*\])*\{[^}]*\}/g, " ");
  for (let i = 0; i < 5; i++) s = s.replace(/\\[A-Za-z@]+\*?(?:\[[^\]]*\])?\{([^{}]*)\}/g, "$1");
  return s
    .replace(/\\[A-Za-z@]+\*?/g, " ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((w) => w.length >= 3)
    .join(" ");
}

// Where a quote (as the reviewer saw it in the PDF's text) starts in the
// source: the 1-based line, or null. Matches on the quote's first six words
// of three letters or more, then on its last six, so a quote that runs over
// a line break or through a citation still lands on its first line.
export function findQuoteInTex(tex: string, quote: string): number | null {
  const lines = tex.split("\n").map(plainWords);
  const starts: number[] = [];
  let joined = "";
  lines.forEach((l, i) => {
    starts[i] = joined.length;
    joined += (i ? " " : "") + l;
  });
  const words = plainWords(quote).split(" ").filter(Boolean);
  if (!words.length) return null;
  for (const needle of [words.slice(0, 6).join(" "), words.slice(-6).join(" ")]) {
    const at = joined.indexOf(needle);
    if (at < 0) continue;
    let line = 0;
    while (line + 1 < starts.length && starts[line + 1] <= at) line++;
    return line + 1;
  }
  return null;
}

// The LaTeX that places a figure file from the project, labelled after it.
export function figureSnippet(path: string): string {
  const label = path.replace(/^.*\//, "").replace(/\.[^.]+$/, "").replace(/[^\w-]/g, "-");
  return `\\begin{figure}[t]\n  \\centering\n  \\includegraphics[width=\\linewidth]{${path}}\n  \\caption{Caption.}\n  \\label{fig:${label}}\n\\end{figure}\n`;
}

// The next free figures/<base>[-n].pdf among a project's files.
export function nextFigurePath(existing: string[], base = "figure"): string {
  const has = new Set(existing);
  let name = base;
  for (let n = 2; has.has(`figures/${name}.pdf`); n++) name = `${base}-${n}`;
  return `figures/${name}.pdf`;
}

export const SNIPPETS = {
  table: `\\begin{table}[t]\n  \\centering\n  \\caption{Caption.}\n  \\label{tab:label}\n  \\begin{tabular}{lcc}\n    \\hline\n    Item & A & B \\\\\n    \\hline\n    One & 1 & 2 \\\\\n    \\hline\n  \\end{tabular}\n\\end{table}\n`,
  equation: `\\begin{equation}\n  y = mx + c\n  \\label{eq:label}\n\\end{equation}\n`,
  section: `\\section{Section title}\n\n`,
} as const;

export const citeSnippet = (key: string) => `\\cite{${key}}`;
export const refSnippet = (label: string) => `\\ref{${label}}`;
