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

// A .bib file's entries — key and title — for the editor's suggestions.
// @comment, @string and @preamble aren't entries; a repeated key counts once.
export function bibEntries(bib: string): { key: string; title: string | null }[] {
  const out: { key: string; title: string | null }[] = [];
  const heads = [...bib.matchAll(/@(\w+)\s*[({]\s*([^,\s{}()]+)\s*,/g)];
  heads.forEach((m, i) => {
    if (/^(comment|string|preamble)$/i.test(m[1]) || out.some((e) => e.key === m[2])) return;
    const body = bib.slice(m.index + m[0].length, i + 1 < heads.length ? heads[i + 1].index : bib.length);
    out.push({ key: m[2], title: bibTitle(body) });
  });
  return out;
}

function bibTitle(body: string): string | null {
  const m = /(?:^|[,\s])title\s*=\s*/i.exec(body);
  if (!m) return null;
  const at = m.index + m[0].length;
  let raw: string | null = null;
  if (body[at] === "{") raw = braceGroup(body, at)?.text ?? null;
  else if (body[at] === '"') {
    const end = body.indexOf('"', at + 1);
    raw = end > at ? body.slice(at + 1, end) : null;
  }
  return raw === null ? null : plainTitle(raw) || null;
}

// The brace group opening at s[i] ("{"): its contents and the index after it,
// or null if it never closes. Escaped braces (\{) don't count.
function braceGroup(s: string, i: number): { text: string; end: number } | null {
  if (s[i] !== "{") return null;
  let depth = 0;
  for (let j = i; j < s.length; j++) {
    const c = s[j];
    if (c === "\\") j++;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) return { text: s.slice(i + 1, j), end: j + 1 };
  }
  return null;
}

// A title as plain text: commands unwrapped (\emph{x} → x), bare commands
// and grouping braces dropped, whitespace collapsed.
function plainTitle(t: string): string {
  let s = t;
  for (let k = 0; k < 5; k++) s = s.replace(/\\[A-Za-z@]+\*?(?:\[[^\]]*\])?\{([^{}]*)\}/g, "$1");
  return s
    .replace(/\\[A-Za-z@]+\*?/g, " ")
    .replace(/~/g, " ")
    .replace(/[{}]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// The paper's sections, for the outline: every sectioning command in
// order, its level (part 0 … subparagraph 6), its title as plain text and
// its 1-based line. Starred and [short]{long} forms count (the long title
// is shown); comments don't; a title may run over lines.
export type OutlineItem = { level: number; title: string; line: number };
const LEVELS: Record<string, number> = { part: 0, chapter: 1, section: 2, subsection: 3, subsubsection: 4, paragraph: 5, subparagraph: 6 };

export function texOutline(tex: string): OutlineItem[] {
  const lines = tex.split("\n").map(uncomment);
  const starts: number[] = [];
  let at = 0;
  for (const l of lines) {
    starts.push(at);
    at += l.length + 1;
  }
  const body = lines.join("\n");
  const lineOf = (i: number) => {
    let n = 0;
    while (n + 1 < starts.length && starts[n + 1] <= i) n++;
    return n + 1;
  };
  const out: OutlineItem[] = [];
  for (const m of body.matchAll(/\\(part|chapter|section|subsection|subsubsection|paragraph|subparagraph)\*?\s*(?:\[[^\]]*\])?\s*(?=\{)/g)) {
    const g = braceGroup(body, m.index + m[0].length);
    if (g) out.push({ level: LEVELS[m[1]], title: plainTitle(g.text), line: lineOf(m.index) });
  }
  return out;
}

// The files a .tex file pulls in with \input{…} or \include{…}, in order,
// without duplicates, with .tex added when it's left off (as TeX does).
export function texInputs(tex: string): string[] {
  const out: string[] = [];
  const body = tex.split("\n").map(uncomment).join("\n");
  for (const m of body.matchAll(/\\(?:input|include)\s*\{([^}]+)\}/g)) {
    const f = m[1].trim();
    const path = /\.tex$/i.test(f) ? f : `${f}.tex`;
    if (!out.includes(path)) out.push(path);
  }
  return out;
}

// The paper as TeX reads it: the main file, then what it inputs, depth
// first, in order — only files that exist, each once (so a loop ends).
export function paperFiles(main: string, sources: Record<string, string>): string[] {
  const out: string[] = [];
  const visit = (f: string) => {
    if (out.includes(f) || !(f in sources)) return;
    out.push(f);
    for (const g of texInputs(sources[f])) visit(g);
  };
  visit(main);
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

// A table with `rows` rows (the first a header) and `cols` left-aligned
// columns, in a floating table with a caption to replace.
export function tableSnippet(rows: number, cols: number): string {
  const header = Array.from({ length: cols }, (_, i) => `Column ${i + 1}`).join(" & ");
  const body = Array.from({ length: Math.max(0, rows - 1) }, () => "    " + Array.from({ length: cols }, () => " ").join(" & ") + " \\\\");
  return [
    "\\begin{table}[t]",
    "  \\centering",
    "  \\caption{Caption.}",
    "  \\label{tab:table}",
    `  \\begin{tabular}{${"l".repeat(cols)}}`,
    "    \\hline",
    `    ${header} \\\\`,
    "    \\hline",
    ...body,
    "    \\hline",
    "  \\end{tabular}",
    "\\end{table}",
  ].join("\n");
}

export const citeSnippet = (key: string) => `\\cite{${key}}`;
export const refSnippet = (label: string) => `\\ref{${label}}`;
