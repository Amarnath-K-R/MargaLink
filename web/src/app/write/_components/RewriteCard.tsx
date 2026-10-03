"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { diffWordSegments } from "@stll/folio-core/ai-edits/word-diff";
import { placeCard, type Box } from "./placeCard.ts";

// Rewrite's card, by the selection: the consent the first time in a paper,
// then the rewrite as a word diff (removed struck through, added
// underlined), Clarity's notes, and Replace / Try again / Discard kept in
// view at its foot; or what went wrong, with what to do. Non-modal: the
// editor stays usable, Escape or × closes it. Each step takes the keyboard
// (its first control, or the card), so it's usable without a mouse;
// closing gives it back to the editor.
export default function RewriteCard({
  sel,
  editor,
  focusKey,
  onClose,
  footer,
  children,
}: {
  sel: Box; // the selection, in the viewport
  editor: Box; // the editor's visible area
  focusKey: string; // a new step: the keyboard moves into it
  onClose: () => void;
  footer?: ReactNode; // the step's buttons, kept in view
  children: ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const first = box.current?.querySelector<HTMLElement>("input, [role=menuitem]:not([disabled]), [data-primary], a[href]");
    (first ?? box.current)?.focus();
  }, [focusKey]);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);
  const { left, width, top, bottom, maxHeight } = placeCard(sel, editor, { width: window.innerWidth, height: window.innerHeight });
  return (
    <div
      ref={box}
      tabIndex={-1}
      data-testid="rewrite-card"
      role="dialog"
      aria-label="Rewrite"
      className="clay fixed z-[60] flex flex-col overflow-hidden rounded-3xl text-sm outline-none"
      style={{ left, width, top, bottom, maxHeight }}
    >
      <div className="flex items-center justify-between gap-3 px-5 pb-1 pt-3.5">
        <span className="text-xs font-medium text-ink-soft">Rewrite with Claude</span>
        <button type="button" onClick={onClose} aria-label="Close" title="Close (Esc)" className="grid h-7 w-7 place-items-center rounded-full text-ink-soft hover:bg-black/5 hover:text-ink">
          ×
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4">{children}</div>
      {footer && <div className="flex flex-wrap items-center gap-2 border-t border-line/60 px-5 py-3">{footer}</div>}
    </div>
  );
}

/** The rewrite against what was selected, word by word; screen readers hear "removed" and "added". */
export function RewriteDiff({ before, after }: { before: string; after: string }) {
  return (
    <p data-testid="rewrite-diff" data-generator="claude" className="whitespace-pre-wrap leading-relaxed text-ink">
      {diffWordSegments(before, after).map((s, i) =>
        s.type === "equal" ? (
          <span key={i}>{s.text}</span>
        ) : s.type === "del" ? (
          <del key={i} className="text-ink-soft decoration-away/70">
            <span className="sr-only">removed: </span>
            {s.text}
          </del>
        ) : (
          <ins key={i} className="bg-accent-soft/60 text-ink no-underline [text-decoration:underline_var(--accent)]">
            <span className="sr-only">added: </span>
            {s.text}
          </ins>
        ),
      )}
    </p>
  );
}
