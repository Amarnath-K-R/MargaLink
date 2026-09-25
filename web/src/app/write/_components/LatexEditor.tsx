"use client";

import { useEffect, useRef } from "react";
import { EditorView, basicSetup } from "codemirror";
import { EditorState } from "@codemirror/state";
import { keymap } from "@codemirror/view";
import { StreamLanguage } from "@codemirror/language";
import { stex } from "@codemirror/legacy-modes/mode/stex";
import { lintGutter, setDiagnostics, type Diagnostic } from "@codemirror/lint";

export type EditorHandle = { goto(line: number): void; insert(text: string): void };
export type LineMark = { line: number; message: string; severity: "error" | "warning" };

// The LaTeX source editor: CodeMirror 6 with the stex mode, a gutter marker on
// every line the compiler complained about, Ctrl/Cmd+S to save and compile.
// Mount it once the file's text is loaded, keyed by path: a new file is a new
// editor (and its own undo history).
export default function LatexEditor({
  text,
  marks,
  onChange,
  onSave,
  handleRef,
}: {
  text: string;
  marks: LineMark[];
  onChange: (text: string) => void;
  onSave: () => void;
  handleRef: React.MutableRefObject<EditorHandle | null>;
}) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const cbRef = useRef({ onChange, onSave });
  useEffect(() => {
    cbRef.current = { onChange, onSave };
  });

  const extensions = () => [
    basicSetup,
    StreamLanguage.define(stex),
    lintGutter(),
    EditorView.lineWrapping,
    keymap.of([{ key: "Mod-s", preventDefault: true, run: () => (cbRef.current.onSave(), true) }]),
    EditorView.updateListener.of((u) => {
      if (u.docChanged) cbRef.current.onChange(u.state.doc.toString());
    }),
    EditorView.theme({ "&": { height: "100%", fontSize: "13px" }, ".cm-scroller": { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" } }),
  ];

  useEffect(() => {
    if (!host.current) return;
    const v = new EditorView({ parent: host.current, state: EditorState.create({ doc: text, extensions: extensions() }) });
    view.current = v;
    handleRef.current = {
      goto(line) {
        const doc = v.state.doc;
        const l = doc.line(Math.min(Math.max(1, line), doc.lines));
        v.dispatch({ selection: { anchor: l.from }, scrollIntoView: true });
        v.focus();
      },
      insert(snippet) {
        const at = v.state.selection.main.head;
        v.dispatch({ changes: { from: at, insert: snippet }, selection: { anchor: at + snippet.length } });
        v.focus();
      },
    };
    return () => {
      v.destroy();
      view.current = null;
      handleRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- created once; `text` is only the initial document
  }, []);

  useEffect(() => {
    const v = view.current;
    if (!v) return;
    const doc = v.state.doc;
    const diags: Diagnostic[] = marks
      .filter((m) => m.line >= 1 && m.line <= doc.lines)
      .map((m) => ({ from: doc.line(m.line).from, to: doc.line(m.line).to, severity: m.severity, message: m.message }));
    v.dispatch(setDiagnostics(v.state, diags));
  }, [marks]);

  return <div ref={host} data-testid="latex-editor" className="h-full min-h-[24rem] overflow-hidden rounded-sm border border-line bg-white" />;
}
