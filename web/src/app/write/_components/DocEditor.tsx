"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { IntlProvider } from "use-intl";
import { DocxEditor, getFolioSelectionViewportRect, insertImageFromFile, insertPageBreakInView, insertTableInView, type DocxEditorRef } from "@stll/folio-react";
import { getFolioMessages } from "@stll/folio-react/messages";
// Scoped to the editor, but Next keeps a stylesheet once loaded:
// folioCss.selfcheck.ts proves this one can't restyle the rest of the site.
import "@stll/folio-react/standalone.css";
import { findQuoteInText } from "@/lib/write/texSource";
import { docSaveState } from "@/lib/write/docSaveState";
import type { Spelling } from "@/lib/writing/spelling";
import { useDocSpelling } from "./useDocSpelling.tsx";
import { applyDocRewrite, docPassage, passageFresh } from "@/lib/writing/docText";
import { useRewrite, type RewriteTarget } from "./useRewrite.tsx";
import { RewriteButton } from "./RewriteMenu.tsx";

// The Word editor: Folio (Apache-2.0, a fork of Eigenpal's docx-editor),
// which edits the .docx itself: a save rewrites the document's text from the
// editor and carries the rest over, so a journal template's styles,
// numbering, theme, fonts, headers and page setup come back byte for byte
// (scripts/smoke/check_docx_fidelity.mjs holds it to that).
// Loaded only when a Word project opens (next/dynamic, ssr: false): it is
// most of a megabyte. Everything happens in the browser; it makes no
// requests of its own (fonts are bundled). The workspace drives it through
// `handleRef`.
export type DocHandle = {
  // The document as it is now, a .docx; `written()` once those bytes are stored.
  save(): Promise<{ bytes: Uint8Array; written: () => void }>;
  pending(): boolean; // edits not yet stored (known at once, before the editor reports the change)
  text(): string; // the body's text, one line per paragraph (for the word count and the review's quotes)
  insertImage(png: Uint8Array, dpi: number): Promise<void>; // at the cursor, at the size it was drawn for
  showQuote(quote: string): boolean; // select and scroll to a passage; false when it isn't found
  focus(): void;
  rewriteMenu(): void; // Rewrite's tools, by the selection
};

// Rewrite's item in the editor's right-click menu (with a selection only).
const REWRITE_ITEM = [{ id: "rewrite", label: "Rewrite with Claude…", requiresSelection: true }] as const;
// A placeholder's object as the rewrite shows it: a citation as its text, a
// footnote mark raised as Word shows it, a mark for a picture or an equation.
const SUPERSCRIPT = "\u2070\u00b9\u00b2\u00b3\u2074\u2075\u2076\u2077\u2078\u2079";
const shownObject = (text: string) =>
  text === "" ? "\u25aa" : /^\s$/.test(text) ? " " : /^\[\^\d+\]$/.test(text) ? text.replace(/\D/g, "").replace(/\d/g, (d) => SUPERSCRIPT[Number(d)]) : text;

// Folio's English labels, with "a — b" written "a. B" (no em dashes in what the site shows).
const MESSAGES = (function noDashes<T>(o: T): T {
  if (typeof o === "string") return o.replace(/\s—\s(\w)/g, (_, c: string) => `. ${c.toUpperCase()}`) as T;
  if (o && typeof o === "object") return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, noDashes(v)])) as T;
  return o;
})(getFolioMessages("en"));

type View = NonNullable<ReturnType<NonNullable<ReturnType<DocxEditorRef["getEditorRef"]>>["getView"]>>;

export default function DocEditor({
  bytes,
  readOnly,
  onEdit,
  onDocument,
  handleRef,
  spelling = null,
  onAddWord,
  onSpellCount,
  rewriting = null,
}: {
  bytes: Uint8Array; // the document as opened; never fed back while editing
  readOnly: boolean; // another tab holds the project
  onEdit: () => void; // the document changed (not just the selection)
  onDocument: () => void; // the document is laid out, or changed in any way (the word count follows it)
  handleRef: React.MutableRefObject<DocHandle | null>;
  spelling?: Spelling | null; // the paper's spelling settings
  onAddWord?: (word: string) => void; // "Add to dictionary"
  onSpellCount?: (marks: number | "failed" | null) => void; // how many spelling and grammar marks are showing (null: none checked)
  rewriting?: { dialect: Spelling["dialect"]; consented: boolean; onConsent: () => Promise<void> } | null; // Rewrite's settings; none in a read-only tab
}) {
  const ref = useRef<DocxEditorRef>(null);
  const picker = useRef<HTMLInputElement>(null);
  const frame = useRef<HTMLDivElement>(null); // Folio's own box, for placing Rewrite's card
  const onEditRef = useRef(onEdit);
  useEffect(() => {
    onEditRef.current = onEdit;
  });
  const view = (): View | null => {
    ref.current?.ensureEditorView();
    return ref.current?.getEditorRef()?.getView() ?? null;
  };
  const rewrite = useRewrite(
    (): RewriteTarget | null => {
      const v = view();
      if (!v) return null;
      return {
        format: "text",
        read: () => {
          const { from, to } = v.state.selection;
          if (from === to) return "Select the text to rewrite first.";
          const p = docPassage(v.state.doc, from, to);
          if (typeof p === "string") return p;
          const show = (t: string) => t.replace(/\u27e6(\d+)\u27e7/g, (_, n: string) => shownObject(p.objects[Number(n) - 1] ?? ""));
          // The editor's view as it is when it's needed (Folio may have made a new one meanwhile).
          const place = (t: string) => {
            const now = view();
            const done = now ? applyDocRewrite(now, p, t) : "stale";
            if (done === "applied") ref.current?.focus(); // back in the document, where Undo takes it back
            return done;
          };
          const fresh = () => {
            const now = view();
            return !!now && passageFresh(now.state.doc, p);
          };
          return { passage: p.passage, before: show(p.passage), show, keep: () => {}, fresh, place };
        },
        anchor: () => {
          const r = getFolioSelectionViewportRect(v);
          const area = frame.current?.getBoundingClientRect();
          if (!r || !area) return null;
          // The editor's area below its own bar, so the card never slides under the bar.
          const bar = frame.current?.querySelector('[role="toolbar"]')?.getBoundingClientRect();
          return { sel: { left: r.left, right: r.right, top: r.top, bottom: r.bottom }, editor: { left: area.left, right: area.right, top: bar ? bar.bottom : area.top, bottom: area.bottom } };
        },
        focus: () => ref.current?.focus(),
      };
    },
    { dialect: rewriting?.dialect ?? "us", consented: !!rewriting?.consented, onConsent: rewriting?.onConsent ?? (async () => {}), enabled: !!rewriting && !readOnly },
  );
  const spellingMarks = useDocSpelling(() => ref.current?.getEditorRef()?.getView() ?? null, { spelling, readOnly, onAddWord, onSpellCount });
  // What's stored: Folio's own record of edits doesn't survive its saves (docSaveState.ts).
  const stored = useRef(docSaveState<unknown>()).current;
  const doc = () => ref.current?.getEditorRef()?.getView()?.state.doc;
  const changed = () => stored.changed(doc(), ref.current?.hasPendingChanges() ?? false);
  // The save started as the editor closed (see the layout effect below), until it's stored.
  const closing = useRef<Promise<Uint8Array> | null>(null);
  useLayoutEffect(
    () => () => {
      // Closing without the workspace's own way out (Back, another route):
      // Folio lets go of the document right after this cleanup, before the
      // workspace's asks for a save. Start that save now, while it's here.
      if (ref.current && changed()) {
        const saving = ref.current.save({ selective: false }).then((out) => {
          if (!out) throw new Error("The document couldn't be saved.");
          return new Uint8Array(out);
        });
        saving.catch(() => {}); // a failure surfaces where it's awaited
        closing.current = saving;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once, as the editor closes; reads the editor through refs
    [],
  );
  // The body's paragraphs, in order, with where each starts.
  const blocks = () => {
    const out: { pos: number; text: string }[] = [];
    view()?.state.doc.descendants((node, pos) => {
      if (!node.isTextblock) return true;
      out.push({ pos, text: node.textContent });
      return false;
    });
    return out;
  };

  useEffect(() => {
    handleRef.current = {
      async save() {
        if (!ref.current) {
          if (!closing.current) throw new Error("The document has closed.");
          return { bytes: await closing.current, written: () => void (closing.current = null) };
        }
        const from = doc();
        stored.saving(); // until these bytes are stored: a save that never reaches the disk is tried again
        // Full saves only. A selective save patches the paragraphs changed
        // since the last save into Folio's baseline, which Folio resets to the
        // file as first opened whenever its document history changes: the
        // second save of a session dropped the first one's edits. (Mixing the
        // two modes also stored pictures twice.) See docs/word-editor-known-issues.md.
        const out = await ref.current.save({ selective: false });
        if (!out) throw new Error("The document couldn't be saved.");
        return {
          bytes: new Uint8Array(out),
          // An edit made while the save ran isn't in these bytes: save again.
          written: () => void (stored.written(from, doc()) && onEditRef.current()),
        };
      },
      pending: () => (ref.current ? changed() : closing.current !== null),
      text: () =>
        blocks()
          .map((b) => b.text)
          .join("\n"),
      async insertImage(png, dpi) {
        const v = view();
        if (!v) throw new Error("The document isn't ready yet.");
        const file = new File([png.slice()], "figure.png", { type: "image/png" });
        await insertImageFromFile(v, file, () => {});
        // Folio sizes an image by its pixels, which at 300 dpi is three times
        // the figure's real size: back to the size it was drawn at (CSS px are
        // 96 to the inch), no wider than Folio fitted it to the page.
        const { selection } = v.state;
        const at = selection.$from.nodeBefore?.type.name === "image" ? selection.from - selection.$from.nodeBefore.nodeSize : selection.from;
        const node = v.state.doc.nodeAt(at);
        if (node?.type.name !== "image" || !node.attrs.width || !node.attrs.height) return;
        const img = await createImageBitmap(new Blob([png.slice()], { type: "image/png" }));
        const width = Math.min(node.attrs.width, Math.round((img.width * 96) / dpi));
        const height = Math.round((node.attrs.height * width) / node.attrs.width);
        img.close();
        v.dispatch(v.state.tr.setNodeMarkup(at, undefined, { ...node.attrs, width, height }));
      },
      showQuote(quote) {
        const list = blocks();
        const line = findQuoteInText(list.map((b) => b.text).join("\n"), quote);
        const block = line ? list[line - 1] : undefined;
        const editor = ref.current?.getEditorRef();
        if (!block || !editor) return false;
        editor.setSelection(block.pos + 1, block.pos + 1 + block.text.length);
        editor.scrollToPosition(block.pos + 1);
        return true;
      },
      focus: () => ref.current?.focus(),
      rewriteMenu: () => rewrite.openMenu(),
    };
    // Tell the workspace once the document is laid out (Folio builds its view after parsing).
    let tries = 0;
    const ready = setInterval(() => {
      if (view() || ++tries > 100) {
        clearInterval(ready);
        onDocument();
        spellingMarks.onDocumentChange(); // the first check
      }
    }, 100);
    return () => {
      clearInterval(ready);
      handleRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the handle reads the editor through refs
  }, [handleRef]);

  return (
    <IntlProvider locale="en" messages={MESSAGES} timeZone="UTC">
      <div ref={frame} className="h-full">
      <DocxEditor
        ref={ref}
        documentBuffer={bytes}
        mode="editing"
        readOnly={readOnly}
        showReviewControls={false}
        showPrintButton={false}
        keyboardShortcuts="editor"
        // Only real edits count: Folio also reports changes that need no save.
        onChange={() => {
          onDocument();
          spellingMarks.onDocumentChange();
          if (changed()) {
            stored.edited();
            onEdit();
          }
        }}
        onSelectionTextChange={spellingMarks.onCaret}
        toolbarExtra={rewriting && !readOnly ? <RewriteButton onOpen={rewrite.openMenu} /> : undefined}
        customContextMenuItems={rewriting && !readOnly ? REWRITE_ITEM : undefined}
        onCustomContextAction={(id) => id === "rewrite" && rewrite.openMenu()}
        onInsertImage={() => picker.current?.click()}
        onInsertTable={(rows, columns) => {
          const v = view();
          if (v) insertTableInView(v, rows, columns);
        }}
        onInsertPageBreak={() => {
          const v = view();
          if (v) insertPageBreakInView(v);
        }}
        className="h-full"
      />
      </div>
      {spellingMarks.element}
      {rewrite.element}
      <input
        ref={picker}
        type="file"
        accept="image/png,image/jpeg,image/gif"
        aria-label="Insert a picture"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          const v = view();
          if (file && v) void insertImageFromFile(v, file, () => {});
        }}
      />
    </IntlProvider>
  );
}
