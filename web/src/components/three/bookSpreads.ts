// The homepage book: one spread per tool, showcase-level only (a name, one
// line, a link) — the details live on the tool pages. Shared by the 3D book
// (book.ts, bookPages.ts) and the page's caption (page.tsx), with the scroll
// timing both read, so the caption always names the spread on screen.

export const SPREADS = [
  { n: "03", tool: "Review", lead: "Get it", cut: "reviewed.", line: "A second read before you submit.", href: "/review", art: "review" },
  { n: "04", tool: "Write", lead: "Write it in their", cut: "template.", line: "Your journal's format, from the first draft.", href: "/write", art: "write" },
  { n: "05", tool: "Figures", lead: "Make the", cut: "figures.", line: "Publication-ready, straight from your data.", href: "/figures", art: "figures" },
] as const;

export type Spread = (typeof SPREADS)[number];

// Fractions of the book's pinned scroll (0 → 1): the camera tips to look down
// over the first/last `tilt`; each page turns over its window; the checkpoint
// pin drops onto the book once the last spread is open.
export const BOOK_TIMING = {
  tilt: 0.1,
  turns: [
    [0.3, 0.45],
    [0.6, 0.75],
  ],
  pin: [0.8, 0.9],
} as const;

// Which spread is open at a point of the pinned scroll (switches mid-turn).
export const spreadAt = (p: number) => (p < 0.375 ? 0 : p < 0.675 ? 1 : 2);
