"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ProjectStore, type ProjectMeta } from "@/lib/projectStore";
import { loadTemplates, starterProject, templateForJournal, type Template } from "@/lib/templateCatalog";
import { loadMeta } from "@/lib/match";
import { errorMessage } from "@/lib/errorMessage";
import { NetworkTracePanel, useNetworkTrace } from "@/components/NetworkTrace";
import PageHeader from "@/components/PageHeader";
import ErrorText from "@/components/ErrorText";
import TemplatePicker from "./_components/TemplatePicker.tsx";
import StorageBanner from "./_components/StorageBanner.tsx";
import Workspace from "./_components/Workspace.tsx";
import { downloadBytes, safeName } from "./_components/download.ts";

type Journal = { id: string; display_name: string; host: string | null };

// Write a paper in LaTeX, in the browser: start from a journal's template or
// upload one, edit, compile with TeX Live running in a worker, download the
// PDF. Projects live in this browser's own storage; nothing is uploaded.
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

  const refresh = useCallback(async (s: ProjectStore) => setProjects(await s.list()), []);

  useEffect(() => {
    ProjectStore.open().then(
      (s) => {
        setStore(s);
        void refresh(s);
      },
      (err) => setError(errorMessage(err)),
    );
    loadTemplates().then(setTemplates, (err) => setError(errorMessage(err)));
    // ?journal=<OpenAlex id> (from a match result or a journal page) preselects its template.
    const id = new URLSearchParams(window.location.search).get("journal");
    if (id) {
      void loadMeta().then((all) => {
        const j = all.find((m) => m.id === id || m.id.endsWith(`/${id}`));
        if (j) setJournal({ id: j.id, display_name: j.display_name, host: j.host_organization_name ?? null });
      });
    }
  }, [refresh]);

  const create = useCallback(
    async (t: Template) => {
      if (!store) return;
      setBusy(true);
      setError(null);
      try {
        const files = await starterProject(t, journal);
        const name = journal ? `Paper for ${journal.display_name}` : `New ${t.name} paper`;
        const meta = await store.create({ name, main: t.main, engine: t.engine, journalId: journal?.id ?? null, templateId: t.id, packs: t.packs }, files);
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

  const importZip = useCallback(
    async (file: File) => {
      if (!store) return;
      setBusy(true);
      setError(null);
      try {
        const meta = await store.importZip(file.name.replace(/\.zip$/i, ""), new Uint8Array(await file.arrayBuffer()), journal?.id ?? null);
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

  return (
    <main className="mx-auto w-full max-w-7xl px-6 py-14 sm:py-20">
      <PageHeader
        width="4xl"
        links={[
          { href: "/", label: "← Back" },
          { href: "/match", label: "Find a journal" },
          { href: "/privacy", label: "How privacy works" },
        ]}
        title="Write your paper."
        subtitle={
          <p className="mt-3 max-w-xl text-lg text-ink-soft">
            Start from your journal&apos;s LaTeX template, write, and compile to PDF — TeX runs in your browser, and your manuscript never
            leaves this device.
          </p>
        }
      />
      {error && <ErrorText>{error}</ErrorText>}

      {store && openProject ? (
        <Workspace
          store={store}
          project={openProject}
          onMeta={setOpenProject}
          onClose={() => {
            setOpenProject(null);
            void refresh(store);
          }}
        />
      ) : (
        <div className="max-w-4xl">
          <StorageBanner />
          {projects.length > 0 && (
            <section className="mt-10">
              <h2 className="mb-3 text-sm font-medium text-accent">Your projects</h2>
              <ul data-testid="project-list" className="divide-y divide-line border-y border-line">
                {projects.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
                    <button type="button" onClick={() => setOpenProject(p)} className="font-medium hover:underline">
                      {p.name}
                    </button>
                    <span className="text-xs text-ink-soft">edited {new Date(p.updatedAt).toLocaleString()}</span>
                    <span className="ml-auto flex gap-3 text-xs">
                      <button
                        type="button"
                        onClick={async () => store && downloadBytes(`${safeName(p.name)}.zip`, await store.exportZip(p.id), "application/zip")}
                        className="text-accent hover:underline"
                      >
                        Download backup
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          if (!store || !window.confirm(`Delete "${p.name}" from this browser? This can't be undone.`)) return;
                          await store.remove(p.id);
                          void refresh(store);
                        }}
                        className="text-ink-soft hover:text-ink"
                      >
                        Delete
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <section className="mt-10">
            <h2 className="mb-3 text-sm font-medium text-accent">Start a new paper</h2>
            <TemplatePicker
              templates={templates}
              recommended={recommended}
              journalName={journal?.display_name ?? null}
              busy={busy || !store}
              onPick={(t) => void create(t)}
              onUpload={() => upload.current?.click()}
            />
            <p className="mt-4 text-sm">
              <button type="button" onClick={() => upload.current?.click()} disabled={!store} className="text-accent hover:underline disabled:opacity-60">
                Import a .zip
              </button>{" "}
              <span className="text-ink-soft">— a publisher&apos;s template, an Overleaf download, or a MargaLink backup.</span>
            </p>
            <input
              ref={upload}
              type="file"
              accept=".zip,application/zip"
              aria-label="Import a zip"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) void importZip(f);
              }}
            />
          </section>
        </div>
      )}

      <NetworkTracePanel calls={calls}>
        These fetch the template list and template files. The TeX engine and its packages are fetched by the compile worker — public
        files only. Nothing from your paper is ever sent.
      </NetworkTracePanel>

      <footer className="mt-20 border-t border-line pt-6 text-sm text-ink-soft">
        <Link href="/privacy" className="text-accent hover:underline">
          How privacy works
        </Link>
      </footer>
    </main>
  );
}
