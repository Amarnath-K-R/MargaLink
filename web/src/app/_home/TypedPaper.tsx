"use client";

import { useEffect, useState } from "react";

import { PAPER_PARTS as PARTS, PAPER_TOTAL as TOTAL, TYPE_CHARS_PER_SECOND as CHARS_PER_SECOND } from "@/components/three/paperText";

// Phones: the paper as an HTML page that writes itself once `write` turns
// true. (On wider screens the landing's 3D sheet is the paper and writes
// itself in place — see clayDesk.ts.)
export default function TypedPaper({ write, reducedMotion }: { write: boolean; reducedMotion: boolean }) {
  const [typed, setTyped] = useState(0);

  useEffect(() => {
    if (!write || reducedMotion) return;
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const n = Math.min(TOTAL, Math.floor(((now - t0) / 1000) * CHARS_PER_SECOND));
      setTyped(n);
      if (n < TOTAL) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [write, reducedMotion]);

  const shown = reducedMotion ? TOTAL : typed;
  // How much of each part is typed; the caret follows the last typed character.
  const lines: { key: string; text: string; caret: boolean }[] = [];
  let left = shown;
  let caretDone = false;
  for (const p of PARTS) {
    const n = Math.max(0, Math.min(p.text.length, left));
    left -= n;
    const caret = !caretDone && (n < p.text.length || p.key === "keywords");
    if (caret) caretDone = true;
    lines.push({ key: p.key, text: p.text.slice(0, n), caret });
  }
  return (
    <div className="typed-paper" aria-label="An example manuscript page">
      {lines.map((l) => (
        <p key={l.key} className={`tp-${l.key}`}>
          {l.text}
          {l.caret && <span className="tp-caret" aria-hidden="true" />}
        </p>
      ))}
    </div>
  );
}
