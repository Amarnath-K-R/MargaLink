"use client";

import { useEffect, useRef } from "react";
import { IntlProvider } from "use-intl";
import { DocxEditor, insertImageFromFile, insertPageBreakInView, insertTableInView, type DocxEditorRef } from "@stll/folio-react";
import { getFolioMessages } from "@stll/folio-react/messages";
// Scoped to the editor, but Next keeps a stylesheet once loaded:
// folioCss.selfcheck.ts proves this one can't restyle the rest of the site.
import "@stll/folio-react/standalone.css";
import { findQuoteInTex } from "@/lib/write/texSource";

// The Word editor: Folio (Apache-2.0, a fork of Eigenpal's docx-editor),
// which edits the .docx itself and saves only what changed, so a journal
// template's styles, headers, page setup and columns come back as they were.
// Loaded only when a Word project opens (next/dynamic, ssr: false): it is
// most of a megabyte. Everything happens in the browser; it makes no
// requests of its own (fonts are bundled). The workspace drives it through
// `handleRef`.
export type DocHandle = {
  save(): Promise<Uint8Array>; // the document as it is now, a .docx
  text(): string; // the body's text, one line per paragraph (for the word count and the review's quotes)
  insertImage(png: Uint8Array, dpi: number): Promise<void>; // at the cursor, at the size it was drawn for
  showQuote(quote: string): boolean; // select and scroll to a passage; false when it isn't found
  focus(): void;
};

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
  onSaveNow,
  handleRef,
}: {
  bytes: Uint8Array; // the document as opened; never fed back while editing
  readOnly: boolean; // another tab holds the project
  onEdit: () => void; // the document changed (not just the selection)
  onSaveNow: () => void; // Ctrl+S
  handleRef: React.MutableRefObject<DocHandle | null>;
}) {
  const ref = useRef<DocxEditorRef>(null);
  const picker = useRef<HTMLInputElement>(null);
  const view = (): View | null => {
    ref.current?.ensureEditorView();
    return ref.current?.getEditorRef()?.getView() ?? null;
  };
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
        const out = await ref.current?.save();
        if (!out) throw new Error("The document couldn't be saved.");
        return new Uint8Array(out);
      },
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
        const line = findQuoteInTex(list.map((b) => b.text).join("\n"), quote);
        const block = line ? list[line - 1] : undefined;
        const editor = ref.current?.getEditorRef();
        if (!block || !editor) return false;
        editor.setSelection(block.pos + 1, block.pos + 1 + block.text.length);
        editor.scrollToPosition(block.pos + 1);
        return true;
      },
      focus: () => ref.current?.focus(),
    };
    return () => {
      handleRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the handle reads the editor through refs
  }, [handleRef]);

  return (
    <IntlProvider locale="en" messages={MESSAGES} timeZone="UTC">
      <DocxEditor
        ref={ref}
        documentBuffer={bytes}
        mode="editing"
        readOnly={readOnly}
        showReviewControls={false}
        showPrintButton={false}
        keyboardShortcuts="editor"
        // Only real edits count: Folio also reports changes that need no save.
        onChange={() => ref.current?.hasPendingChanges() && onEdit()}
        onSave={onSaveNow}
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
