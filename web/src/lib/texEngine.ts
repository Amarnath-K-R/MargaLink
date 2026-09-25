// Where /write's TeX engine lives and which of its TeX Live data packs a
// paper needs. The engine is BusyTeX (MIT; TeX Live compiled to WebAssembly),
// unmodified, uploaded to our R2 bucket by scripts/publish_busytex.sh — too
// big for public/ (Cloudflare Pages' 25 MB file cap). Only public files are
// fetched from there; a paper never is.

export const ENGINE_RELEASE = "2024-02-16";
export const ENGINE_BASE_URL = `https://pub-fef44153e53d45fbaf08ca670aa565e3.r2.dev/busytex/${ENGINE_RELEASE}`;
export const ENGINE_FILES = ["busytex.js", "busytex.wasm", "busytex_worker.js", "busytex_pipeline.js"];

export type DataPack = { name: string; js: string; data: string; mb: number; always: boolean; provides: RegExp | null };

// Sizes from the release (MB, .data files). Order matters: packsFor returns names in this order.
// Package → pack follows Ubuntu's TeX Live split (siunitx is in texlive-science, not latex-extra).
export const DATA_PACKS: DataPack[] = [
  { name: "texlive-basic", js: "texlive-basic.js", data: "texlive-basic.data", mb: 104.6, always: true, provides: null },
  { name: "latex-base", js: "ubuntu-texlive-latex-base.js", data: "ubuntu-texlive-latex-base.data", mb: 5.7, always: true, provides: null },
  {
    name: "latex-recommended",
    js: "ubuntu-texlive-latex-recommended.js",
    data: "ubuntu-texlive-latex-recommended.data",
    mb: 9.1,
    always: false,
    provides: /\b(geometry|graphicx|hyperref|booktabs|caption|natbib|xcolor|amsmath)\b/,
  },
  {
    name: "latex-extra",
    js: "ubuntu-texlive-latex-extra.js",
    data: "ubuntu-texlive-latex-extra.data",
    mb: 49.5,
    always: false,
    provides: /\b(cleveref|todonotes|multirow|algorithm2e|tikz|pgfplots|listings|enumitem|subcaption)\b/,
  },
  { name: "science", js: "ubuntu-texlive-science.js", data: "ubuntu-texlive-science.data", mb: 9.3, always: false, provides: /\b(siunitx|physics|chemfig|mhchem)\b/ },
  {
    name: "fonts-recommended",
    js: "ubuntu-texlive-fonts-recommended.js",
    data: "ubuntu-texlive-fonts-recommended.data",
    mb: 10.3,
    always: false,
    provides: /\b(times|helvet|courier|mathptmx|txfonts|lmodern|fontenc)\b/,
  },
];

// The package names a source loads (\usepackage / \RequirePackage, with
// [options] and comma lists), ignoring commented-out lines.
function usedPackages(tex: string): string[] {
  const live = tex
    .split("\n")
    .map((l) => l.replace(/(^|[^\\])%.*$/, "$1"))
    .join("\n");
  const out: string[] = [];
  for (const m of live.matchAll(/\\(?:usepackage|RequirePackage)\s*(?:\[[^\]]*\])?\s*\{([^}]*)\}/g)) {
    out.push(...m[1].split(",").map((p) => p.trim()).filter(Boolean));
  }
  return out;
}

// The packs beyond the always-loaded ones that a paper's packages need.
export function packsFor(tex: string): string[] {
  const pkgs = usedPackages(tex);
  return DATA_PACKS.filter((p) => !p.always && p.provides && pkgs.some((pkg) => p.provides!.test(pkg))).map((p) => p.name);
}
