// What a Word project's editor has stored (DocEditor.tsx). Folio's own record
// of edits ("has pending changes") is wiped by every save, edits made while
// the save ran included, and by a save whose bytes never reached the disk, so
// it can't say alone whether everything is stored. This also keeps the
// document the last stored save was taken from (the editor's documents are
// immutable: a different object is a different document) and whether an edit
// is known to be unstored.
export function docSaveState<D>() {
  let stored: D | null = null; // the document the last stored save began from
  let unstored = false;
  return {
    /** Edits not stored: Folio's record, an edit known unstored, or a different document since the last stored save. */
    changed: (doc: D | undefined, folioPending: boolean) => folioPending || unstored || (stored !== null && doc !== stored),
    /** The editor reported an edit. */
    edited: () => void (unstored = true),
    /** A save begins: unstored until its bytes are stored. */
    saving: () => void (unstored = true),
    /** That save's bytes are stored: true when the document changed while it ran (save again). */
    written: (from: D | undefined, now: D | undefined): boolean => {
      stored = from ?? null;
      unstored = now !== undefined && now !== from;
      return unstored;
    },
  };
}
