"use client";

import { useEffect, type ReactNode } from "react";
import { diffWordSegments } from "@stll/folio-core/ai-edits/word-diff";

// Rewrite's card, by the selection: the consent the first time in a paper,
// then the rewrite as a word diff (removed struck through, added
// underlined), Clarity's notes, and Replace / Try again / Discard; or what
// went wrong, with what to do. Non-modal: the editor stays usable, Escape
// closes it.
export default function RewriteCard({ left, top, above, onClose, children }: { left: number; top: number; above: number; onClose: () => void; children: ReactNode }) {
  // Under the selection when there's room, over it when there's more room there: never on it, always on screen
  // (scrolling inside when it's taller than the room).
  const roomBelow = window.innerHeight - Math.max(8, top) - 16;
  const roomAbove = above - 16;
  const place = roomBelow >= 360 || roomBelow >= roomAbove ? { top: Math.max(8, top), maxHeight: roomBelow } : { bottom: window.innerHeight - above, maxHeight: roomAbove };
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);
  return (
    <div
      data-testid="rewrite-card"
      role="dialog"
      aria-label="Rewrite"
      className="clay fixed z-40 w-[28rem] max-w-[calc(100vw-2rem)] overflow-y-auto rounded-2xl p-4 text-sm"
      style={{ left: Math.max(8, Math.min(left, window.innerWidth - 460)), ...place }}
    >
      {children}
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
