"use client";

import { useEffect, useState } from "react";

// The paper the landing's desk morphs into: a manuscript page that writes
// itself — title, authors, abstract, keywords — once `write` turns true.
// An illustration, not a real paper.
const PARTS = [
  { key: "title", text: "Seasonal nitrate flux in headwater streams under shifting snowmelt" },
  { key: "authors", text: "Asha Rao¹, Mikael Lindqvist², Tobi Okafor¹" },
  { key: "affil", text: "¹ Department of Earth Sciences   ² Institute for Hydrology" },
  { key: "label", text: "Abstract" },
  {
    key: "abstract",
    text: "Earlier snowmelt is changing when nitrogen leaves mountain catchments. From six years of high-frequency sensor records in 14 streams, we find that spring nitrate pulses now arrive 11 days earlier and carry 23% more of the annual load, most strongly below 1,200 m.",
  },
  { key: "keywords", text: "Keywords: nitrate · snowmelt · headwater streams · high-frequency sensing" },
] as const;

const TOTAL = PARTS.reduce((n, p) => n + p.text.length, 0);
const CHARS_PER_SECOND = 95;

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
