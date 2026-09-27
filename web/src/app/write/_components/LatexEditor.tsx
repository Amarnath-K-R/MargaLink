"use client";

import { useEffect, useRef } from "react";
import { EditorView, basicSetup } from "codemirror";
import { EditorSelection, EditorState, Prec } from "@codemirror/state";
import { keymap } from "@codemirror/view";
import { toggleComment } from "@codemirror/commands";
import { latexCompletions, type CompletionData } from "./latexCompletions.ts";
import { StreamLanguage } from "@codemirror/language";
import { stex } from "@codemirror/legacy-modes/mode/stex";
import { lintGutter, setDiagnostics, type Diagnostic } from "@codemirror/lint";

export type EditorHandle = {
  goto(line: number): void;
  insert(text: string): void;
  focus(): void;
  // Wraps the selection (or a selected placeholder) in `before`…`after`.
  wrap(before: string, after: string, placeholder: string): void;
  // Inserts `text` on lines of its own at the cursor, selecting `select` inside it.
  insertBlock(text: string, select?: string): void;
  comment(): void;
};

function wrapIn(v: EditorView, before: string, after: string, placeholder: string) {
  v.dispatch(
    v.state.changeByRange((r) => {
      const inner = r.empty ? placeholder : v.state.sliceDoc(r.from, r.to);
      return {
        changes: { from: r.from, to: r.to, insert: before + inner + after },
        range: EditorSelection.range(r.from + before.length, r.from + before.length + inner.length),
      };
    }),
  );
  v.focus();
}

function blockAt(v: EditorView, text: string, select?: string) {
  const at = v.state.selection.main.head;
  const line = v.state.doc.lineAt(at);
  const lead = line.text.slice(0, at - line.from).trim() ? "\n" : "";
  const tail = line.text.slice(at - line.from).trim() ? "\n" : "";
  const insert = lead + text + tail;
  const i = select ? insert.indexOf(select) : -1;
  v.dispatch({
    changes: { from: at, insert },
    selection: i >= 0 ? EditorSelection.range(at + i, at + i + select!.length) : EditorSelection.cursor(at + insert.length),
    scrollIntoView: true,
  });
  v.focus();
}
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
  completions,
}: {
  text: string;
  marks: LineMark[];
  onChange: (text: string) => void;
  onSave: () => void;
  handleRef: React.MutableRefObject<EditorHandle | null>;
  completions: CompletionData; // the project's .bib entries and labels, read when a suggestion list opens
}) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const cbRef = useRef({ onChange, onSave, completions });
  useEffect(() => {
    cbRef.current = { onChange, onSave, completions };
  });

  const extensions = () => {
    // One source for the editor's life: autocompletion tells sources apart by identity, so a
    // fresh function per lookup would restart every query and never show a list.
    const suggest = latexCompletions(() => cbRef.current.completions);
    return [
      basicSetup,
      StreamLanguage.define(stex),
      lintGutter(),
      EditorState.languageData.of(() => [{ autocomplete: suggest }]),
      EditorView.lineWrapping,
      keymap.of([{ key: "Mod-s", preventDefault: true, run: () => (cbRef.current.onSave(), true) }]),
      // Above basicSetup's own Mod-i (select the enclosing syntax node).
      Prec.highest(
        keymap.of([
          { key: "Mod-b", preventDefault: true, run: (v) => (wrapIn(v, "\\textbf{", "}", "bold text"), true) },
          { key: "Mod-i", preventDefault: true, run: (v) => (wrapIn(v, "\\textit{", "}", "italic text"), true) },
        ]),
      ),
      EditorView.updateListener.of((u) => {
        if (u.docChanged) cbRef.current.onChange(u.state.doc.toString());
      }),
      // Sits on a paper sheet: no background of its own, a quiet gutter, a teal active line.
      EditorView.theme({
        "&": { height: "100%", fontSize: "13px", backgroundColor: "transparent" },
        "&.cm-focused": { outline: "none" },
        ".cm-scroller": { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", lineHeight: "1.6" },
        ".cm-content": { padding: "14px 0" },
        ".cm-gutters": { backgroundColor: "transparent", borderRight: "1px solid rgba(58,44,28,.07)", color: "#a3a097" },
        ".cm-activeLine": { backgroundColor: "rgba(44,95,111,.045)" },
        ".cm-activeLineGutter": { backgroundColor: "rgba(44,95,111,.08)", color: "#2c5f6f" },
        // Suggestions and hovers as small clay cards.
        ".cm-tooltip": { border: "none", borderRadius: "12px", backgroundColor: "#fbfaf6", boxShadow: "0 1px 2px rgba(58,44,28,.12), 0 12px 28px -8px rgba(58,44,28,.28)", overflow: "hidden" },
        ".cm-tooltip-autocomplete > ul": { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", maxHeight: "16em" },
        ".cm-tooltip-autocomplete > ul > li": { padding: "3px 10px" },
        ".cm-tooltip-autocomplete > ul > li[aria-selected]": { backgroundColor: "#dde6e6", color: "#2c5f6f" },
        ".cm-completionDetail": { fontStyle: "normal", color: "#565b66", marginLeft: "0.75em", fontFamily: "var(--font-sans)" },
      }),
    ];
  };

  useEffect(() => {
    if (!host.current) return;
    const v = new EditorView({ parent: host.current, state: EditorState.create({ doc: text, extensions: extensions() }) });
    view.current = v;
    handleRef.current = {
      goto(line) {
        const doc = v.state.doc;
        const l = doc.line(Math.min(Math.max(1, line), doc.lines));
        v.dispatch({ selection: { anchor: l.from }, effects: EditorView.scrollIntoView(l.from, { y: "center" }) }); // mid-screen, not at an edge
        v.focus();
      },
      insert(snippet) {
        const at = v.state.selection.main.head;
        v.dispatch({ changes: { from: at, insert: snippet }, selection: { anchor: at + snippet.length } });
        v.focus();
      },
      focus() {
        v.focus();
      },
      wrap(before, after, placeholder) {
        wrapIn(v, before, after, placeholder);
      },
      insertBlock(text, select) {
        blockAt(v, text, select);
      },
      comment() {
        toggleComment(v);
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

  return <div ref={host} data-testid="latex-editor" className="h-full overflow-hidden" />;
}
