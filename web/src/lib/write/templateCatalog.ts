// The /write template catalogue: bundled LaTeX classes (LPPL, from TeX Live)
// and link-only entries for publishers that distribute their templates only
// from their own sites. public/templates/templates.json is the one list; a
// journal's publisher (meta.json's host_organization_name) picks its entry.
import type { ZipEntry } from "./zip.ts";

export type Template = {
  id: string;
  name: string;
  publisher: string;
  engine: "pdftex" | "xetex";
  main: string;
  licence: string;
  source: string;
  bundled: boolean;
  publisherUrl: string | null;
  hosts: string[]; // regexes over host_organization_name
  packs: string[]; // ["all"] when the class needs files the main .tex doesn't name
  files: string[];
  note: string;
};

export async function loadTemplates(fetchImpl: typeof fetch = fetch): Promise<Template[]> {
  const res = await fetchImpl("/templates/templates.json");
  if (!res.ok) throw new Error("Couldn't load the template list.");
  return (await res.json()) as Template[];
}

export function templateForJournal(host: string | null, templates: Template[]): Template | null {
  if (!host) return null;
  return templates.find((t) => t.hosts.some((h) => new RegExp(h).test(host))) ?? null;
}

export function escapeTex(s: string): string {
  return s.replace(/[\\&%$#_{}~^]/g, (c) =>
    c === "~" ? "\\textasciitilde{}" : c === "^" ? "\\textasciicircum{}" : c === "\\" ? "\\textbackslash{}" : `\\${c}`,
  );
}

// A new project's files from a bundled template, with the chosen journal named
// in main.tex (a comment, and elsarticle's \journal{} line).
export async function starterProject(
  t: Template,
  journal: { id: string; display_name: string } | null,
  fetchImpl: typeof fetch = fetch,
): Promise<ZipEntry[]> {
  if (!t.bundled) throw new Error(`Download the ${t.publisher} template from the publisher's site, then upload the zip.`);
  const files = await Promise.all(
    t.files.map(async (path) => {
      const res = await fetchImpl(`/templates/${t.id}/${path}`);
      if (!res.ok) throw new Error(`Couldn't load ${path} of the ${t.name} template.`);
      return { path, data: new Uint8Array(await res.arrayBuffer()) };
    }),
  );
  if (!journal) return files;
  return files.map((f) => {
    if (f.path !== t.main) return f;
    const text = new TextDecoder().decode(f.data).replace("\\journal{Journal name}", `\\journal{${escapeTex(journal.display_name)}}`);
    return { path: f.path, data: new TextEncoder().encode(`% Journal: ${journal.display_name}\n${text}`) };
  });
}
