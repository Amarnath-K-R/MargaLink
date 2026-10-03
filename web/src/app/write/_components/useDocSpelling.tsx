"use client";

import { useEffect, useRef, useState } from "react";
import { getFolioCaretViewportRect, setAISuggestionsMeta } from "@stll/folio-react";
import type { EditorView } from "prosemirror-view";
import { checkProse, grammarEngine, type Issue } from "@/lib/writing/grammar";
import { docProse, docRange, fixWord } from "@/lib/writing/docText";
import type { Spelling } from "@/lib/writing/spelling";
import SpellingCard from "./SpellingCard.tsx";

type Mark = { id: string; from: number; to: number; word: string; message: string; replacements: string[]; kind: Issue["kind"] };

// Spelling and grammar in a Word document (on this device, grammar.ts): the
// paragraphs are checked half a second after the document changes, the marks
// painted with Folio's suggestion layer (spelling and grammar underlined in
// their own colours), and the fixes offered in a card when the caret sits in
// a marked word, since that layer doesn't take clicks (Alt+Enter moves to it
// from the keyboard). Painting the marks is a transaction that changes
// nothing in the document, so it's never saved.
export function useDocSpelling(
  view: () => EditorView | null,
  opts: { spelling: Spelling | null; readOnly: boolean; onAddWord?: (word: string) => void; onSpellCount?: (marks: number | "failed" | null) => void },
) {
  const optsRef = useRef(opts);
  useEffect(() => {
    optsRef.current = opts;
  });
  const marks = useRef<Mark[]>([]);
  const ignored = useRef(new Set<string>()); // "Ignore", for this session: the word and what was said about it
  const checked = useRef<unknown>(null); // the document as last checked
  const painted = useRef<unknown>(null); // the document the marks were painted on
  const run = useRef(0); // the latest check: an older one finishing later is dropped
  const caret = useRef(-1); // where the caret last was, so a repaint alone doesn't open a card
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [card, setCard] = useState<{ mark: Mark; left: number; top: number } | null>(null);

  const paint = (v: EditorView, list: Mark[]) => {
    const meta = setAISuggestionsMeta(
      list.map((m) => ({
        id: m.id,
        topic: m.kind,
        severity: m.kind === "spelling" ? "typo" : "style",
        range: { from: m.from, to: m.to },
        originalText: m.word,
        suggestedText: m.replacements[0] ?? m.word,
        contextBefore: "",
        contextAfter: "",
        rationale: m.message,
        status: "pending",
      })),
    );
    v.dispatch(v.state.tr.setMeta(meta.key, meta.payload));
    painted.current = v.state.doc;
  };

  const check = async () => {
    const v = view();
    if (!v) return;
    const { spelling, onSpellCount } = optsRef.current;
    const mine = ++run.current;
    if (!spelling || spelling.dialect === "off") {
      checked.current = null;
      marks.current = [];
      paint(v, []);
      setCard(null);
      onSpellCount?.(null);
      return;
    }
    const doc = v.state.doc;
    checked.current = doc;
    try {
      const prose = docProse(doc);
      const issues = await checkProse(await grammarEngine(), prose.prose, prose.source, spelling);
      const now = view();
      if (mine !== run.current || !now || now.state.doc !== doc) return; // edited, or the settings changed, meanwhile: the next check has it
      const found: Mark[] = [];
      for (const i of issues) {
        const word = prose.source.slice(i.from, i.to);
        if (ignored.current.has(`${word}\u0000${i.message}`)) continue;
        const at = docRange(prose, i.from, i.to);
        if (at) found.push({ id: `spelling-${found.length}`, ...at, word, message: i.message, replacements: i.replacements, kind: i.kind });
      }
      marks.current = found;
      paint(now, found);
      onSpellCount?.(found.length);
    } catch {
      if (mine === run.current) onSpellCount?.("failed"); // the checker didn't load: it's tried again after the next edit
    }
  };
  const later = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void check(), 500);
  };
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);
  // A click: the caret's next place opens a card even if it's where it was.
  useEffect(() => {
    const clicked = () => void (caret.current = -1);
    window.addEventListener("pointerdown", clicked, true);
    return () => window.removeEventListener("pointerdown", clicked, true);
  }, []);
  // The paper's English or words changed: check again now.
  const settingsKey = opts.spelling ? `${opts.spelling.dialect}:${opts.spelling.words.join(",")}` : "none";
  useEffect(() => {
    checked.current = null;
    void check();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reads the editor and settings through refs
  }, [settingsKey]);

  // The caret in a marked word opens its card, once the caret is painted
  // (Folio draws it a frame or two after the selection changes).
  const onCaret = ({ from, to }: { from: number; to: number }) => {
    if (from === caret.current && to === from) return; // the caret didn't move (marks were painted, say)
    caret.current = to === from ? from : -1;
    const v = view();
    const mark = from === to && v?.state.doc === painted.current ? marks.current.find((m) => m.from <= from && from < m.to) : undefined;
    if (!mark) return setCard(null);
    let frames = 0;
    const place = () => {
      const v = view();
      const rect = v && getFolioCaretViewportRect(v);
      if (rect) setCard({ mark, left: rect.left, top: rect.bottom + 6 });
      else if (++frames < 12) requestAnimationFrame(place);
    };
    place();
  };

  // Done with the card: back to the editor, where the caret was.
  const close = () => {
    setCard(null);
    view()?.focus();
  };
  const replace = (m: Mark, text: string) => {
    const v = view();
    close();
    const tr = v && fixWord(v.state, m, text);
    if (!tr) return void check(); // the text moved since: check again
    marks.current = marks.current.filter((x) => x !== m);
    v.dispatch(tr);
  };
  const element = card && (
    <SpellingCard
      left={card.left}
      top={card.top}
      message={card.mark.message}
      kind={card.mark.kind}
      replacements={card.mark.replacements}
      readOnly={opts.readOnly}
      onReplace={(text) => replace(card.mark, text)}
      onAdd={card.mark.kind === "spelling" && /^[\p{L}\p{M}'’-]+$/u.test(card.mark.word) && opts.onAddWord ? () => (close(), opts.onAddWord?.(card.mark.word)) : null}
      onIgnore={() => {
        ignored.current.add(`${card.mark.word}\u0000${card.mark.message}`);
        close();
        checked.current = null;
        void check();
      }}
      onClose={close}
    />
  );
  // A change to the document (not the marks being painted): check again soon.
  const onDocumentChange = () => {
    if (view()?.state.doc !== checked.current) later();
  };
  return { onDocumentChange, onCaret, element };
}
