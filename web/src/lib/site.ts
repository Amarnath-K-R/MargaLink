// Single source of truth for the deployed site's URL, used by sitemap.ts,
// robots.ts, and anywhere else that needs an absolute URL. No domain is
// registered yet (see plan §13) — set NEXT_PUBLIC_SITE_URL once one is.
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://example-placeholder.margalink.invalid";
