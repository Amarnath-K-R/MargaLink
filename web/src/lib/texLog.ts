// Turns a TeX log into diagnostics the editor can pin to a line: errors
// ("! Undefined control sequence." + "l.42 …"), missing packages (with the
// data pack that provides them), and the warnings a writer acts on (undefined
// citations/references, overfull/underfull boxes). Pure; the raw log stays
// available behind a disclosure on the page.
import { DATA_PACKS, type DataPack } from "./texEngine.ts";

export type TexDiagnostic = {
  kind: "error" | "warning" | "missing-package";
  file: string | null;
  line: number | null;
  message: string;
  pack?: string;
};

const MAX = 200;
// A "(" opens a file only when a path follows: ./x, /x, or a name with a TeX-ish extension.
const PATH = /^(\.{0,2}\/[^\s()]+|[^\s()]+\.(?:tex|sty|cls|clo|def|cfg|fd|bbl|aux|toc|ltx|bib|bst|out|lof|lot))/;
const clean = (p: string) => p.replace(/^\.\//, "");
const tidy = (m: string) => m.replace(/`/g, "'").replace(/\.\s*$/, "").trim();

function packFor(file: string, packs: DataPack[]): string | undefined {
  const name = file.replace(/\.(sty|cls)$/, "");
  return packs.find((p) => p.provides && new RegExp(`^(?:${p.provides.source.replace(/^\\b|\\b$/g, "")})$`).test(name))?.name;
}

export function parseTexLog(log: string, packs: DataPack[] = DATA_PACKS): TexDiagnostic[] {
  const out: TexDiagnostic[] = [];
  const stack: (string | null)[] = []; // null = a parenthesis that isn't a file
  const current = () => {
    for (let i = stack.length - 1; i >= 0; i--) if (stack[i]) return stack[i];
    return null;
  };
  // Advances the file stack over one line's parentheses.
  const track = (line: string) => {
    for (let i = 0; i < line.length; i++) {
      if (line[i] === "(") {
        const m = line.slice(i + 1).match(PATH);
        stack.push(m ? clean(m[1]) : null);
        if (m) i += m[1].length;
      } else if (line[i] === ")") {
        stack.pop();
      }
    }
  };

  let pending: TexDiagnostic | null = null; // an error waiting for its l.N line
  let context = 0; // lines of error context left to skip for paren tracking
  const flush = () => {
    if (pending) out.push(pending);
    pending = null;
  };

  const lines = log.split("\n");
  for (let i = 0; i < lines.length && out.length < MAX; i++) {
    const line = lines[i];
    if (line.startsWith("!")) {
      flush();
      const body = line.slice(1).trim();
      const missing = body.match(/^LaTeX Error: File [`']([^']+)' not found/);
      if (missing) {
        pending = { kind: "missing-package", file: current(), line: null, message: `${missing[1]} not found` };
        const pack = packFor(missing[1], packs);
        if (pack) pending.pack = pack;
      } else {
        pending = { kind: "error", file: current(), line: null, message: tidy(body.replace(/^LaTeX Error:\s*/, "")) };
      }
      context = 8;
      continue;
    }
    if (pending) {
      const l = line.match(/^l\.(\d+)/);
      if (l) {
        pending.line = Number(l[1]);
        flush();
        i++; // the source-context continuation line
        context = 0;
        continue;
      }
      if (--context <= 0) flush();
      continue; // error context lines hold user text: don't track their parentheses
    }

    const cite = line.match(/^LaTeX Warning: (.*?)(?: on input line (\d+))?\.?$/);
    if (cite) {
      out.push({ kind: "warning", file: current(), line: cite[2] ? Number(cite[2]) : null, message: tidy(cite[1]) });
      continue;
    }
    const box = line.match(/^(Overfull|Underfull) (\\[hv]box) \(([^)]*)\).*?lines? (\d+)/);
    if (box) {
      out.push({ kind: "warning", file: current(), line: Number(box[4]), message: `${box[1]} ${box[2]} (${box[3]})` });
      continue;
    }
    track(line);
  }
  flush();
  return out.slice(0, MAX);
}
