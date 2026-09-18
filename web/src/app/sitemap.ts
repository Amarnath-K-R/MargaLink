import type { MetadataRoute } from "next";
import { getAllJournals } from "@/lib/journals-server";
import { journalHref } from "@/lib/journal-url";
import { SITE_URL } from "@/lib/site";

// Required for static export — the built-in sitemap convention still needs
// this explicit opt-in under output: "export" (verified via a real build:
// omitting it fails with "force-static not configured").
export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  const journalUrls = getAllJournals().map((j) => ({
    url: `${SITE_URL}${journalHref(j.id)}`,
    changeFrequency: "monthly" as const,
    priority: 0.6,
  }));

  return [
    { url: SITE_URL, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/match`, changeFrequency: "weekly", priority: 0.9 },
    { url: `${SITE_URL}/journals`, changeFrequency: "weekly", priority: 0.7 },
    { url: `${SITE_URL}/privacy`, changeFrequency: "yearly", priority: 0.3 },
    ...journalUrls,
  ];
}
