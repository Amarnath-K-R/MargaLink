// Shared animation-math primitives. Before this, the same smoothstep
// formula was reimplemented three times: page.tsx's reveal(value, start,
// end), ThreePaperScene.tsx's between(value, start, end) (byte-for-byte
// the same function under a different name), and an inline
// `progress * progress * (3 - 2 * progress)` in ThreeIntroScene.tsx.

// Clamps to [0, 1].
export function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

// Cubic smoothstep ease. Expects an already-[0, 1] input — call clamp01()
// or between() first if the value isn't already in range.
export function smooth(value: number): number {
  return value * value * (3 - 2 * value);
}

// Local 0→1 progress for how far `value` has moved from `start` to `end`,
// eased with smooth(). Out-of-range inputs clamp to 0 or 1 rather than
// extrapolating past the ease curve.
export function between(value: number, start: number, end: number): number {
  return smooth(clamp01((value - start) / (end - start)));
}

export function lerp(from: number, to: number, amount: number): number {
  return from + (to - from) * amount;
}
