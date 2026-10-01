// Relative with its extension: the selfcheck runs this file under plain `node`.
import { between } from "./easing.ts";
import type { CSSProperties } from "react";

// Local 0→1 progress for how far a section has scrolled into view — 0 when its
// top is at the bottom of the viewport, 1 once it's mostly arrived. Unlike a
// fraction of total page scroll, this stays correct regardless of how long the
// page is or how tall any one section ends up being.
export function localProgress(rect: DOMRect, viewportHeight: number) {
  const start = viewportHeight;
  const end = viewportHeight * 0.35;
  return Math.min(1, Math.max(0, (start - rect.top) / (start - end)));
}

// A staggered cascade for a group of `count` siblings: item `index` gets its own
// reveal window within the section's local progress, so children arrive in
// sequence rather than all at once.
export function stagger(progress: number, index: number, count: number, distance = 24, axis: "x" | "y" = "y") {
  const span = 0.55;
  const stepStart = count > 1 ? (index / (count - 1)) * (1 - span) : 0;
  const t = between(progress, stepStart, Math.min(1, stepStart + span));
  const shift = (1 - t) * distance;
  return { opacity: t, transform: axis === "x" ? `translateX(${shift}px)` : `translateY(${shift}px)` };
}

// Reduced-motion escape hatch: skip the computed transform entirely so content
// just renders at its natural position, fully visible, no scroll-linked motion.
export function motionStyle(reducedMotion: boolean, style: CSSProperties): CSSProperties {
  return reducedMotion ? {} : style;
}
