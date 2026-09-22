// Single source of truth for site-wide metadata — used by layout.tsx (page
// title/description/OG tags), opengraph-image.tsx, sitemap.ts, and robots.ts.
// No domain is registered yet (see journal-finder-plan.md §13) — set
// NEXT_PUBLIC_SITE_URL once one is.
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://example-placeholder.margalink.invalid";

export const SITE_NAME = "MargaLink";
export const SITE_TITLE = "MargaLink — match, check, and review your paper without it leaving your device";
export const SITE_DESCRIPTION =
  "Match your paper to a journal, check its format, and get it reviewed — all without your paper ever leaving your device.";

// Mirrors globals.css's :root color tokens. Duplicated, not imported: this
// feeds opengraph-image.tsx's satori-rendered image, which can't resolve
// CSS custom properties — these are the literal hex values, kept alongside
// the description above so the OG image text and its colors stay in sync
// with each other, at least, even if not with the CSS.
export const BRAND = {
  paper: "#F0EFEA",
  ink: "#1B1F27",
  inkSoft: "#565B66",
  accent: "#2C5F6F",
} as const;
