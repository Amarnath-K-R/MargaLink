"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export const LOCKED_OUT = "This project is open in another tab, so it can't be changed here. Close it there, then reload this tab to edit here.";

// One open project's hold on its files, shared by the LaTeX and Word
// workspaces: one tab edits a project at a time (a Web Lock per project;
// another tab opens it read-only, so a stale copy can't save over newer
// work), whether there are unsaved edits (the browser asks before the tab
// closes), and saving what's pending when the page is hidden or the project
// closes. `flush` writes what's pending; it may change between renders.
// `unsaved` asks the editor itself, for an edit it hasn't reported yet.
export function useProjectSession(projectId: string, flush: () => Promise<void>, setError: (message: string | null) => void, unsaved: () => boolean = () => false) {
  const [lockedOut, setLockedOut] = useState(false);
  const mayWrite = useRef<Promise<boolean>>(Promise.resolve(true));
  const [dirty, setDirty] = useState(false);
  const dirtyRef = useRef(false);
  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);
  const editSeq = useRef(0); // bumped per edit; a save marks clean only if nothing was edited meanwhile
  const flushRef = useRef(flush);
  const unsavedRef = useRef(unsaved);
  useEffect(() => {
    flushRef.current = flush;
    unsavedRef.current = unsaved;
  });

  const edited = useCallback(() => {
    editSeq.current++;
    setDirty(true);
  }, []);
  const seq = useCallback(() => editSeq.current, []);
  const saved = useCallback((at: number) => {
    if (editSeq.current === at) setDirty(false);
  }, []);

  // File operations report what went wrong instead of failing silently.
  const guarded = useCallback(
    <A extends unknown[]>(fn: (...args: A) => Promise<void>) =>
      async (...args: A) => {
        setError(null);
        if (!(await mayWrite.current)) return setError(LOCKED_OUT);
        try {
          await fn(...args);
        } catch (err) {
          setError(err instanceof Error ? err.message : String(err));
        }
      },
    [setError],
  );

  useEffect(() => {
    // This mount's own release (not a shared ref: a remount must not release this one's lock, or leave it held).
    let releaseLock = () => {};
    if ("locks" in navigator) {
      const held = new Promise<void>((r) => (releaseLock = r));
      mayWrite.current = new Promise<boolean>((decide) => {
        // Waits briefly rather than giving up at once: a remount (or a reload) releases its lock a moment later.
        navigator.locks
          .request(`margalink-project-${projectId}`, { signal: AbortSignal.timeout(1500) }, () => {
            decide(true);
            return held;
          })
          .catch(() => {
            decide(false);
            setLockedOut(true);
          });
      });
    }
    // Unsaved edits: the browser asks before the tab closes (a save started on pagehide may not finish).
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current || unsavedRef.current()) e.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    const onHide = () => void flushRef.current().catch(() => {}); // a failure is shown by the saver's onError
    window.addEventListener("pagehide", onHide);
    // Hidden fires earlier than pagehide (and reliably on phones): save then.
    const onVisibility = () => document.visibilityState === "hidden" && onHide();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", onHide);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("beforeunload", onBeforeUnload);
      void flushRef.current().catch(() => {}).finally(releaseLock);
    };
  }, [projectId]);

  return { lockedOut, mayWrite, guarded, dirty, edited, seq, saved };
}
