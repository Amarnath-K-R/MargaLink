"use client";

import { useState } from "react";

// Clears everything MargaLink keeps in this browser: local and session
// storage (settings, the intro flag, notices seen), IndexedDB and Cache
// Storage (downloaded models and runtimes), and the private file system
// (writing projects). Two clicks, since projects can't be brought back. The
// sign-in cookie can't be read by scripts: Sign out ends it.
export default function ResetSiteData() {
  const [phase, setPhase] = useState<"idle" | "confirm" | "busy" | "done">("idle");
  async function reset() {
    setPhase("busy");
    const quietly = async (f: () => unknown) => {
      try {
        await f();
      } catch {
        // one store failing mustn't stop the others
      }
    };
    await quietly(() => localStorage.clear());
    await quietly(() => sessionStorage.clear());
    await quietly(async () => Promise.all((await indexedDB.databases()).map((d) => d.name && indexedDB.deleteDatabase(d.name))));
    await quietly(async () => Promise.all((await caches.keys()).map((k) => caches.delete(k))));
    await quietly(async () => {
      const root = await navigator.storage.getDirectory();
      for await (const name of (root as unknown as { keys(): AsyncIterable<string> }).keys()) await root.removeEntry(name, { recursive: true });
    });
    setPhase("done");
  }
  if (phase === "done") return <p className="text-sm text-accent" aria-live="polite">Done. This browser now holds nothing from MargaLink except a sign-in, if you have one.</p>;
  return (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      {phase === "idle" ? (
        <button type="button" onClick={() => setPhase("confirm")} className="clay-btn h-10 px-5">
          Reset site data
        </button>
      ) : (
        <>
          <span className="text-away">This deletes your writing projects in this browser too. Download backups first if you need them.</span>
          <button type="button" disabled={phase === "busy"} onClick={() => void reset()} className="clay-btn h-10 px-5 font-medium text-away">
            {phase === "busy" ? "Clearing…" : "Delete it all"}
          </button>
          <button type="button" onClick={() => setPhase("idle")} className="clay-btn h-10 px-5">
            Cancel
          </button>
        </>
      )}
    </div>
  );
}
