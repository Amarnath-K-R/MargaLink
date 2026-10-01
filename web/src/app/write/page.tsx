"use client";

import Link from "next/link";
import { Upload } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ProjectStore, type ProjectMeta } from "@/lib/write/projectStore";
import { stopTex } from "@/lib/write/texRunner";
import { loadTexTemplates, starterProject, templateForJournal, type Template } from "@/lib/write/templateCatalog";
import { loadMeta } from "@/lib/match/match";
import { errorMessage } from "@/lib/errorMessage";
import { useNetworkTrace } from "@/app/write/_components/useNetworkTrace";
import PageHeader from "@/components/layout/PageHeader";
import ErrorText from "@/components/ui/ErrorText";
import TemplatePicker from "./_components/TemplatePicker.tsx";
import StorageBanner from "./_components/StorageBanner.tsx";
import Workspace from "./_components/Workspace.tsx";
import { downloadBytes, safeName } from "./_components/download.ts";

export type Journal = { id: string; display_name: string; host: string | null };

// Write a paper in LaTeX, in the browser: start from a journal's template or
// upload one, edit, compile with TeX Live running in a worker, download the
// PDF — and reach the other tools from windows over the workspace. Projects
// live in this browser's own storage; nothing from a paper is sent unless
// you ask for one of the two disclosed AI features. `?p=<id>` reopens a
// project; `?journal=<id>` preselects a template for a new one.
export default function WritePage() {
  const [store, setStore] = useState<ProjectStore | null>(null);
  const [projects, setProjects] = useState<ProjectMeta[]>([]);
  const [openProject, setOpenProject] = useState<ProjectMeta | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [journal, setJournal] = useState<Journal | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const upload = useRef<HTMLInputElement>(null);
  const { calls } = useNetworkTrace();

  // Leaving /write frees the TeX engine (its memory and data packs) for the next page.
  useEffect(() => () => stopTex(), []);

  const refresh = useCallback(async (s: ProjectStore) => {
    try {
      setProjects(await s.list());
    } catch (err) {
      setError(errorMessage(err));
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    ProjectStore.open().then(
      (s) => {
        setStore(s);
        void refresh(s);
        // ?p=<id> reopens a project (a reload, or a link from the figure studio).
        const pid = params.get("p");
        if (pid) s.meta(pid).then(setOpenProject, () => {});
      },
      (err) => setError(errorMessage(err)),
    );
    loadTexTemplates().then(setTemplates, (err) => setError(errorMessage(err)));
    // ?journal=<OpenAlex id> (from a match result or a journal page) preselects its template.
    const id = params.get("journal");
    if (id) {
      void loadMeta().then((all) => {
        const j = all.find((m) => m.id === id || m.id.endsWith(`/${id}`));
        if (j) setJournal({ id: j.id, display_name: j.display_name, host: j.host_organization_name ?? null });
      });
    }
  }, [refresh]);

  // The open project's id lives in the URL, so a reload comes back to it.
  const openId = openProject?.id ?? null;
  useEffect(() => {
    const url = new URL(window.location.href);
    if (openId) url.searchParams.set("p", openId);
    else if (url.searchParams.has("p")) url.searchParams.delete("p");
    else return;
    window.history.replaceState(null, "", url);
  }, [openId]);

  const create = useCallback(
    async (t: Template, j: Journal | null = journal) => {
      if (!store) return;
      setBusy(true);
      setError(null);
      try {
        const files = await starterProject(t, j);
        const name = j ? `Paper for ${j.display_name}` : `New ${t.name} paper`;
        const meta = await store.create({ name, main: t.main, engine: t.engine, journalId: j?.id ?? null, journalName: j?.display_name ?? null, templateId: t.id, packs: t.packs }, files);
        await refresh(store);
        setOpenProject(meta);
      } catch (err) {
        setError(errorMessage(err));
      } finally {
        setBusy(false);
      }
    },
    [store, journal, refresh],
  );

  // A .zip (a template, an Overleaf download, a backup) or a single .tex file.
  const importUpload = useCallback(
    async (file: File) => {
      if (!store) return;
      setBusy(true);
      setError(null);
      try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const meta = /\.tex$/i.test(file.name)
          ? await store.importTex(file.name.replace(/\.tex$/i, ""), bytes, journal?.id ?? null, journal?.display_name ?? null)
          : await store.importZip(file.name.replace(/\.zip$/i, ""), bytes, journal?.id ?? null, journal?.display_name ?? null);
        await refresh(store);
        setOpenProject(meta);
      } catch (err) {
        setError(errorMessage(err));
      } finally {
        setBusy(false);
      }
    },
    [store, journal, refresh],
  );

  const recommended = journal && templates.length ? templateForJournal(journal.host, templates) : null;

  // An open project is a full-screen app: no page header, nothing to scroll past.
  if (store && openProject) {
    return (
      <Workspace
        key={openProject.id}
        store={store}
        project={openProject}
        calls={calls}
        templates={templates}
        onCreateFromTemplate={(t, j) => void create(t, j)}
        pageError={error}
        onMeta={setOpenProject}
        onClose={() => {
          setOpenProject(null);
          void refresh(store);
        }}
      />
    );
  }

  return (
    <main className="mx-auto w-full max-w-5xl px-6 pt-3 pb-20">
      <PageHeader
        width="4xl" tool="write"
        title="Write your paper."
        subtitle={
          <p className="mt-3 max-w-xl text-lg text-ink-soft">
            Start from your journal&apos;s LaTeX template, write, and compile to PDF. TeX runs in your browser, and your manuscript never
            leaves this device.
          </p>
        }
      />
      {error && <ErrorText>{error}</ErrorText>}

      <div className="space-y-6">
        <StorageBanner />
        {projects.length > 0 && (
          <section className="clay p-6 sm:p-8">
            <h2 className="mb-5 font-serif text-xl font-medium tracking-[-0.01em]">Your projects</h2>
            <ul data-testid="project-list" className="grid gap-3 sm:grid-cols-2">
              {projects.map((p) => (
                <li key={p.id} className="sheet flex flex-col gap-3 p-5 text-sm">
                  <button type="button" onClick={() => setOpenProject(p)} className="text-left font-serif text-lg font-medium leading-snug hover:text-accent">
                    {p.name}
                  </button>
                  <span className="-mt-2 text-xs text-ink-soft">
                    {p.journalName ? `${p.journalName} · ` : ""}edited {new Date(p.updatedAt).toLocaleString()}
                  </span>
                  <span className="mt-auto flex gap-2 pt-1 text-xs">
                    <button
                      type="button"
                      onClick={async () => {
                        if (!store) return;
                        setError(null);
                        try {
                          downloadBytes(`${safeName(p.name)}.zip`, await store.exportZip(p.id), "application/zip");
                        } catch (err) {
                          setError(`The backup couldn't be made: ${errorMessage(err)}`);
                        }
                      }}
                      className="clay-chip"
                    >
                      Download backup
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        if (!store || !window.confirm(`Delete "${p.name}" from this browser? This can't be undone.`)) return;
                        setError(null);
                        try {
                          await store.remove(p.id);
                        } catch (err) {
                          setError(`"${p.name}" couldn't be deleted: ${errorMessage(err)}`);
                        }
                        void refresh(store);
                      }}
                      className="clay-chip bg-transparent text-ink-soft hover:bg-[#ebe8df]"
                    >
                      Delete
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
        <section className="clay p-6 sm:p-8">
          <h2 className="mb-5 font-serif text-xl font-medium tracking-[-0.01em]">Start a new paper</h2>
          <TemplatePicker
            templates={templates}
            recommended={recommended}
            journalName={journal?.display_name ?? null}
            busy={busy || !store}
            onPick={(t) => void create(t)}
            onUpload={() => upload.current?.click()}
          />
          <p className="mt-6 flex flex-wrap items-center gap-3 border-t border-line/70 pt-5 text-sm">
            <button type="button" onClick={() => upload.current?.click()} disabled={!store} className="clay-btn">
              <Upload size={14} strokeWidth={2} />
              Import a .zip or .tex
            </button>
            <span className="text-ink-soft">A publisher&apos;s template, an Overleaf download, a MargaLink backup, or a single .tex file.</span>
          </p>
          <input
            ref={upload}
            type="file"
            accept=".zip,application/zip,.tex"
            aria-label="Import a .zip or .tex file"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void importUpload(f);
            }}
          />
        </section>
      </div>

      <footer className="mt-16 border-t border-line/80 pt-6 text-sm text-ink-soft">
        <Link href="/privacy" className="text-accent hover:underline">
          How privacy works
        </Link>
      </footer>
    </main>
  );
}
