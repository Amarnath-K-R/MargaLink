// Single source of truth for site-wide metadata — used by layout.tsx (page
// title/description/OG tags), opengraph-image.tsx, sitemap.ts, and robots.ts.
// No domain is registered yet (see journal-finder-plan.md §13) — set
// NEXT_PUBLIC_SITE_URL once one is.
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://example-placeholder.margalink.invalid";

// Where people write about their account or their data (the privacy page
// and the terms name it). Set NEXT_PUBLIC_CONTACT_EMAIL with the domain;
// accounts shouldn't open without it.
export const CONTACT_EMAIL = process.env.NEXT_PUBLIC_CONTACT_EMAIL || null;

// Who runs MargaLink, as the privacy notice and the terms name them (for
// example "Jane Doe, Kochi, India"). Unset: "an individual in India".
export const OPERATOR = process.env.NEXT_PUBLIC_OPERATOR || null;

export const SITE_NAME = "MargaLink";
export const SITE_TITLE = "MargaLink: match, check, and review your paper without it leaving your device";
export const SITE_DESCRIPTION =
  "Match your paper to a journal, check its format, and get it reviewed, all without your paper ever leaving your device.";

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
