"use client";

import Link from "next/link";
import { useState } from "react";
import { ProjectStore, type ProjectMeta } from "@/lib/projectStore";
import ErrorText from "@/components/ErrorText";

const snippet = (path: string, label: string) =>
  `\\begin{figure}[t]\n  \\centering\n  \\includegraphics[width=\\linewidth]{${path}}\n  \\caption{Caption.}\n  \\label{fig:${label}}\n\\end{figure}\n`;

// Puts the figure (as a 300 dpi PDF) into one of this browser's /write
// projects, under figures/, and copies the LaTeX that includes it. Nothing
// leaves the device: both live in the browser's own storage.
export default function AddToPaper({ disabled, getPdf }: { disabled: boolean; getPdf: () => Promise<Uint8Array> }) {
  const [store, setStore] = useState<ProjectStore | null>(null);
  const [projects, setProjects] = useState<ProjectMeta[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ project: string; path: string; copied: boolean; tex: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function open() {
    setError(null);
    setDone(null);
    try {
      const s = store ?? (await ProjectStore.open());
      setStore(s);
      setProjects(await s.list());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function add(p: ProjectMeta) {
    if (!store) return;
    setBusy(true);
    setError(null);
    try {
      const existing = new Set(await store.files(p.id));
      let label = "figure";
      for (let n = 2; existing.has(`figures/${label}.pdf`); n++) label = `figure-${n}`;
      const path = `figures/${label}.pdf`;
      await store.write(p.id, path, await getPdf());
      const tex = snippet(path, label);
      const copied = await navigator.clipboard.writeText(tex).then(
        () => true,
        () => false,
      );
      setDone({ project: p.name, path, copied, tex });
      setProjects(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div data-testid="add-to-paper" className="text-sm">
      <button
        type="button"
        onClick={() => void open()}
        disabled={disabled || busy}
        className="rounded-sm border border-line bg-paper-alt px-4 py-1.5 hover:border-accent disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy ? "Adding…" : "Add to a paper"}
      </button>
      {projects &&
        (projects.length === 0 ? (
          <p className="mt-2 text-ink-soft">
            No papers in this browser yet —{" "}
            <Link href="/write" className="text-accent hover:underline">
              start one
            </Link>
            .
          </p>
        ) : (
          <ul className="mt-2 space-y-1">
            {projects.map((p) => (
              <li key={p.id}>
                <button type="button" onClick={() => void add(p)} disabled={busy} className="text-accent hover:underline">
                  {p.name}
                </button>
              </li>
            ))}
          </ul>
        ))}
      {done && (
        <div className="mt-2 text-ink-soft" role="status">
          Added to {done.project} as <code className="font-mono text-xs">{done.path}</code>.{" "}
          {done.copied ? "The LaTeX to include it is on your clipboard." : "Paste this where it goes:"}
          {!done.copied && <pre className="mt-1 overflow-x-auto rounded-sm border border-line p-2 font-mono text-xs">{done.tex}</pre>}
        </div>
      )}
      {error && <ErrorText>{error}</ErrorText>}
    </div>
  );
}
