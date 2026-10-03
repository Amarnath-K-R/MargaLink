// Runnable check for docSaveState.ts. Run directly: node src/lib/write/docSaveState.selfcheck.ts
// The Word editor's record of what's stored, with documents as plain objects
// (the editor's are immutable: a new object is a new document) and Folio's own
// "has pending changes" passed in, since every save wipes it.
import assert from "node:assert/strict";
import { docSaveState } from "./docSaveState.ts";

const opened = { v: 0 };
const typed = { v: 1 };
const typedMore = { v: 2 };

// Before any save, only Folio's record counts: opening and tidying the document isn't an edit.
{
  const s = docSaveState<object>();
  assert.equal(s.changed(opened, false), false);
  assert.equal(s.changed(opened, true), true);
}

// An edit made while a save runs, which Folio reports only after its save wiped
// the record: still unstored, and the save that ends says to save again.
{
  const s = docSaveState<object>();
  s.saving();
  assert.equal(s.written(typed, typedMore), true, "the stored bytes are of the document as the save began");
  assert.equal(s.changed(typedMore, false), true, "the later edit is still unstored, though Folio's record says none");
}

// A save whose bytes never reach the disk (a full disk) leaves its edits unstored, to be tried again.
{
  const s = docSaveState<object>();
  s.saving();
  assert.equal(s.changed(typed, false), true);
}

// A save stored with nothing typed meanwhile: nothing unstored, until the document changes.
{
  const s = docSaveState<object>();
  s.saving();
  assert.equal(s.written(typed, typed), false);
  assert.equal(s.changed(typed, false), false);
  assert.equal(s.changed(typedMore, false), true, "a different document since: unstored");
}

// The editor reported an edit: unstored until a save of it is stored.
{
  const s = docSaveState<object>();
  s.edited();
  assert.equal(s.changed(typed, false), true);
  s.saving();
  s.written(typed, typed);
  assert.equal(s.changed(typed, false), false);
}

console.log("docSaveState.selfcheck: OK");
