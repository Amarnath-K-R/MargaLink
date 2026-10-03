"use client";

import { useEffect, useRef, useState } from "react";
import { getFolioCaretViewportRect, setAISuggestionsMeta } from "@stll/folio-react";
import type { EditorView } from "prosemirror-view";
import { checkProse, grammarEngine, type Issue } from "@/lib/writing/grammar";
import { docProse, docRange } from "@/lib/writing/docText";
import type { Spelling } from "@/lib/writing/spelling";
import SpellingCard from "./SpellingCard.tsx";

type Mark = { id: string; from: number; to: number; word: string; message: string; replacements: string[]; kind: Issue["kind"] };

// Spelling and grammar in a Word document (on this device, grammar.ts): the
// paragraphs are checked half a second after the document changes, the marks
// painted with Folio's suggestion layer (spelling and grammar underlined in
// their own colours), and the fixes offered in a card when the caret sits in
// a marked word, since that layer doesn't take clicks. Painting the marks is
// a transaction that changes nothing in the document, so it's never saved.
export function useDocSpelling(
  view: () => EditorView | null,
  opts: { spelling: Spelling | null; readOnly: boolean; onAddWord?: (word: string) => void; onSpellCount?: (marks: number | null) => void },
) {
  const optsRef = useRef(opts);
  useEffect(() => {
    optsRef.current = opts;
  });
  const marks = useRef<Mark[]>([]);
  const ignored = useRef(new Set<string>()); // "Ignore", for this session: the word and what was said about it
  const checked = useRef<unknown>(null); // the document as last checked
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
  };

  const check = async () => {
    const v = view();
    if (!v) return;
    const { spelling, onSpellCount } = optsRef.current;
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
      if (!now || now.state.doc !== doc) return; // edited meanwhile: the next check has it
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
      onSpellCount?.(null); // the checker didn't load: no marks
    }
  };
  const later = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void check(), 500);
  };
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);
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
    const mark = from === to ? marks.current.find((m) => m.from <= from && from <= m.to) : undefined;
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

  const replace = (m: Mark, text: string) => {
    const v = view();
    setCard(null);
    if (!v || v.state.doc.textBetween(m.from, m.to) !== m.word) return void check(); // the text moved since: check again
    v.dispatch(text ? v.state.tr.insertText(text, m.from, m.to) : v.state.tr.delete(m.from, m.to));
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
      onAdd={card.mark.kind === "spelling" && /^[\p{L}\p{M}'’-]+$/u.test(card.mark.word) && opts.onAddWord ? () => (setCard(null), opts.onAddWord?.(card.mark.word)) : null}
      onIgnore={() => {
        ignored.current.add(`${card.mark.word}\u0000${card.mark.message}`);
        setCard(null);
        checked.current = null;
        void check();
      }}
      onClose={() => setCard(null)}
    />
  );
  // A change to the document (not the marks being painted): check again soon.
  const onDocumentChange = () => {
    if (view()?.state.doc !== checked.current) later();
  };
  return { onDocumentChange, onCaret, element };
}
