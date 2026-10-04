"use client";

import { useEffect, useRef } from "react";
import { EditorView, basicSetup } from "codemirror";
import { EditorSelection, EditorState, Prec, StateEffect, StateField, type Text } from "@codemirror/state";
import { keymap } from "@codemirror/view";
import { isolateHistory, toggleComment } from "@codemirror/commands";
import { latexCompletions, type CompletionData } from "./latexCompletions.ts";
import { StreamLanguage } from "@codemirror/language";
import { stex } from "@codemirror/legacy-modes/mode/stex";
import { forEachDiagnostic, forceLinting, lintGutter, linter, setDiagnostics, type Action, type Diagnostic } from "@codemirror/lint";
import { checkProse, grammarEngine, type Issue } from "@/lib/writing/grammar";
import { proseMask } from "@/lib/writing/latexText";
import type { Spelling } from "@/lib/writing/spelling";
import type { Box } from "./placeCard.ts";

export type EditorHandle = {
  // Puts the cursor on a line mid-screen; with `near`, on the closest line
  // (within 40) that contains that text, in case lines moved since `line` was read.
  goto(line: number, near?: string): void;
  insert(text: string): void;
  focus(): void;
  // Wraps the selection (or a selected placeholder) in `before`…`after`.
  wrap(before: string, after: string, placeholder: string): void;
  // Inserts `text` on lines of its own at the cursor, selecting `select` inside it.
  insertBlock(text: string, select?: string): void;
  comment(): void;
  // Rewrite: the selection and the whole file; a range held while Claude
  // works (it moves with edits around it); that range replaced, as one undo
  // step, only if its text is still `original`; and where it is on screen.
  selection(): { from: number; to: number; doc: string } | null;
  hold(from: number, to: number): void;
  heldText(): string | null;
  replaceHeld(original: string, text: string): boolean;
  around(): { sel: Box; editor: Box } | null;
};

// The range Rewrite is working on, mapped through every edit made meanwhile.
const holdRange = StateEffect.define<{ from: number; to: number }>();
const heldRange = StateField.define<{ from: number; to: number } | null>({
  create: () => null,
  update(range, tr) {
    for (const e of tr.effects) if (e.is(holdRange)) return e.value;
    return range && tr.docChanged ? { from: tr.changes.mapPos(range.from, 1), to: tr.changes.mapPos(range.to, -1) } : range;
  },
});

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

// "Check again now": new compiler marks or spelling settings change no text,
// and a forced check only runs when one is pending, so this makes one pending.
const recheck = StateEffect.define<null>();
// A spelling or grammar mark (told apart by its class: a source would be printed under each mark).
const isSpelling = (d: Diagnostic) => d.markClass === "cm-spell" || d.markClass === "cm-grammar";
const compilerMarks = (doc: Text, marks: LineMark[]): Diagnostic[] =>
  marks.filter((m) => m.line >= 1 && m.line <= doc.lines).map((m) => ({ from: doc.line(m.line).from, to: doc.line(m.line).to, severity: m.severity, message: m.message }));
function checkAgain(v: EditorView) {
  v.dispatch({ effects: recheck.of(null) });
  forceLinting(v);
}

// The LaTeX source editor: CodeMirror 6 with the stex mode, a gutter marker on
// every line the compiler complained about, Ctrl/Cmd+S to save and compile,
// and the prose's spelling and grammar marked (on this device, grammar.ts),
// each mark with its fixes in its hover card.
// Mount it once the file's text is loaded, keyed by path: a new file is a new
// editor (and its own undo history).
export default function LatexEditor({
  text,
  readOnly = false,
  marks,
  onChange,
  onSave,
  handleRef,
  completions,
  spelling = null,
  onAddWord,
  onSpellCount,
  ignored,
}: {
  text: string;
  readOnly?: boolean; // shown, selectable and copyable, not editable (set at mount: the editor is keyed on it)
  marks: LineMark[];
  onChange: (text: string) => void;
  onSave: () => void;
  handleRef: React.MutableRefObject<EditorHandle | null>;
  completions: CompletionData; // the project's .bib entries and labels, read when a suggestion list opens
  spelling?: Spelling | null; // the paper's spelling settings; null: not prose (a .bib, a .cls)
  onAddWord?: (word: string) => void; // "Add to dictionary"
  onSpellCount?: (marks: number | "failed" | null) => void; // how many spelling and grammar marks are showing (null: none checked)
  ignored: Set<string>; // "Ignore", for this session and every file of the paper: the word and what was said about it
}) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const cbRef = useRef({ onChange, onSave, completions, marks, spelling, onAddWord, onSpellCount });
  useEffect(() => {
    cbRef.current = { onChange, onSave, completions, marks, spelling, onAddWord, onSpellCount };
  });
  const run = useRef(0); // the latest check: an older one finishing later is dropped

  const extensions = () => {
    // A spelling or grammar mark, with its fixes (none in a read-only tab but Ignore).
    const spellingMark = (i: Issue, text: string): Diagnostic => {
      const word = text.slice(i.from, i.to);
      const actions: Action[] = [];
      if (!readOnly) {
        for (const r of i.replacements.slice(0, 3)) actions.push({ name: r || "Remove", apply: (v, from, to) => v.dispatch({ changes: { from, to, insert: r } }) });
        if (i.kind === "spelling" && /^[\p{L}\p{M}'’-]+$/u.test(word)) actions.push({ name: "Add to dictionary", apply: () => cbRef.current.onAddWord?.(word) });
      }
      actions.push({
        name: "Ignore",
        apply: (v) => {
          ignored.add(`${word}\u0000${i.message}`);
          checkAgain(v);
        },
      });
      return { from: i.from, to: i.to, severity: "info", markClass: i.kind === "spelling" ? "cm-spell" : "cm-grammar", message: i.message, actions };
    };
    // One lint source for both kinds of mark: the compiler's (from props) and
    // the prose's (checked here). Two would each replace the other's.
    const marksAndSpelling = linter(
      async (v) => {
        const doc = v.state.doc;
        const mine = ++run.current;
        const { spelling: settings, onSpellCount: count } = cbRef.current;
        if (!settings || settings.dialect === "off") {
          count?.(null);
          return compilerMarks(doc, cbRef.current.marks);
        }
        const text = doc.toString();
        let issues: Issue[] | null = null;
        try {
          issues = await checkProse(await grammarEngine(), proseMask(text), text, settings);
        } catch {
          // the checker didn't load: the compiler's marks alone; it's tried again after the next edit
        }
        // A newer check started meanwhile (new settings, say): its marks stand, these never arrive.
        if (mine !== run.current) return new Promise<Diagnostic[]>(() => {});
        const tex = compilerMarks(doc, cbRef.current.marks); // as they are now: a compile may have ended meanwhile
        if (!issues) {
          count?.("failed");
          return tex;
        }
        const shown = issues.filter((i) => !ignored.has(`${text.slice(i.from, i.to)}\u0000${i.message}`));
        count?.(shown.length);
        return [...tex, ...shown.map((i) => spellingMark(i, text))];
      },
      { delay: 500, needsRefresh: (u) => u.transactions.some((tr) => tr.effects.some((e) => e.is(recheck))) },
    );
    // One source for the editor's life: autocompletion tells sources apart by identity, so a
    // fresh function per lookup would restart every query and never show a list.
    const suggest = latexCompletions(() => cbRef.current.completions);
    return [
      basicSetup,
      EditorState.readOnly.of(readOnly),
      StreamLanguage.define(stex),
      marksAndSpelling,
      heldRange,
      lintGutter({ markerFilter: (diagnostics) => diagnostics.filter((d) => !isSpelling(d)) }), // the gutter: the compiler's marks only
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
        // Spelling (clay red) and grammar (teal): a wavy underline, not CodeMirror's info dots.
        ".cm-lintRange.cm-spell, .cm-lintRange.cm-grammar": { backgroundImage: "none", textDecorationLine: "underline", textDecorationStyle: "wavy", textUnderlineOffset: "3px", textDecorationThickness: "1px" },
        ".cm-lintRange.cm-spell": { textDecorationColor: "#b5523a" },
        ".cm-lintRange.cm-grammar": { textDecorationColor: "#2c5f6f" },
        ".cm-diagnostic-info": { borderLeft: "3px solid #2c5f6f" },
        ".cm-diagnosticAction": { backgroundColor: "#dde6e6", color: "#2c5f6f", borderRadius: "999px", padding: "1px 10px", marginRight: "6px", fontFamily: "var(--font-sans)" },
      }),
    ];
  };

  useEffect(() => {
    if (!host.current) return;
    const v = new EditorView({ parent: host.current, state: EditorState.create({ doc: text, extensions: extensions() }) });
    view.current = v;
    handleRef.current = {
      goto(line, near) {
        const doc = v.state.doc;
        let n = Math.min(Math.max(1, line), doc.lines);
        if (near) {
          for (let d = 0; d <= 40; d++) {
            const hit = [n - d, n + d].find((k) => k >= 1 && k <= doc.lines && doc.line(k).text.includes(near));
            if (hit) {
              n = hit;
              break;
            }
          }
        }
        const l = doc.line(n);
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
      selection() {
        const { from, to } = v.state.selection.main;
        return from === to ? null : { from, to, doc: v.state.doc.toString() };
      },
      hold(from, to) {
        v.dispatch({ effects: holdRange.of({ from, to }) });
      },
      heldText() {
        const range = v.state.field(heldRange);
        return range ? v.state.sliceDoc(range.from, range.to) : null;
      },
      replaceHeld(original, text) {
        const range = v.state.field(heldRange);
        if (!range || v.state.sliceDoc(range.from, range.to) !== original) return false;
        v.dispatch({ changes: { from: range.from, to: range.to, insert: text }, selection: { anchor: range.from, head: range.from + text.length }, annotations: isolateHistory.of("full"), userEvent: "input.rewrite" });
        v.focus();
        return true;
      },
      around() {
        const sel = v.state.selection.main;
        const range = sel.empty ? (v.state.field(heldRange) ?? sel) : sel; // by the selection; else by the rewrite it's working on
        const start = v.coordsAtPos(range.from);
        const end = v.coordsAtPos(range.to) ?? start;
        if (!start || !end) return null;
        // Across, the editor's lines (so a card beside it is never on text); down, the selection.
        const lines = v.contentDOM.getBoundingClientRect();
        const area = v.scrollDOM.getBoundingClientRect();
        return {
          sel: { left: lines.left, right: lines.right, top: start.top, bottom: end.bottom },
          editor: { left: area.left, right: area.right, top: area.top, bottom: area.bottom },
        };
      },
    };
    return () => {
      v.destroy();
      view.current = null;
      handleRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- created once; `text` is only the initial document
  }, []);

  // New compiler marks show at once, beside the spelling marks as they stand
  // (where the text has moved them since). Keyed on what they say: the
  // workspace hands over a new list each render, and re-setting the marks
  // closes an open hover card.
  const marksKey = JSON.stringify(marks);
  useEffect(() => {
    const v = view.current;
    if (!v) return;
    const spellingMarks: Diagnostic[] = [];
    forEachDiagnostic(v.state, (d, from, to) => void (isSpelling(d) && spellingMarks.push({ ...d, from, to })));
    v.dispatch(setDiagnostics(v.state, [...compilerMarks(v.state.doc, cbRef.current.marks), ...spellingMarks]));
  }, [marksKey]);
  // New spelling settings (the paper's English, a word added): check again now.
  const settingsKey = spelling ? `${spelling.dialect}:${spelling.words.join(",")}` : "none";
  useEffect(() => {
    if (view.current) checkAgain(view.current);
  }, [settingsKey]);

  return <div ref={host} data-testid="latex-editor" className="h-full overflow-hidden" />;
}
