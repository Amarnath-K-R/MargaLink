import type { MetadataRoute } from "next";
import { getPrerenderedJournals } from "@/lib/journals/journalsServer";
import { journalHref } from "@/lib/journals/journalUrl";
import { SITE_URL } from "@/lib/site";

// Required for static export — the built-in sitemap convention still needs
// this explicit opt-in under output: "export" (verified via a real build:
// omitting it fails with "force-static not configured").
export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  // Only the journals with a page of their own (the rest open inline on /journals).
  const journalUrls = getPrerenderedJournals().map((j) => ({
    url: `${SITE_URL}${journalHref(j.id)}`,
    changeFrequency: "monthly" as const,
    priority: 0.6,
  }));

  return [
    { url: SITE_URL, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/home`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${SITE_URL}/match`, changeFrequency: "weekly", priority: 0.9 },
    { url: `${SITE_URL}/review`, changeFrequency: "weekly", priority: 0.7 },
    { url: `${SITE_URL}/figures`, changeFrequency: "weekly", priority: 0.7 },
    { url: `${SITE_URL}/journals`, changeFrequency: "weekly", priority: 0.7 },
    { url: `${SITE_URL}/write`, changeFrequency: "weekly", priority: 0.7 },
    { url: `${SITE_URL}/guide`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE_URL}/architecture`, changeFrequency: "monthly", priority: 0.3 },
    { url: `${SITE_URL}/privacy`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/pricing`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE_URL}/terms`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${SITE_URL}/refunds`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${SITE_URL}/contact`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${SITE_URL}/team`, changeFrequency: "monthly", priority: 0.3 },
    ...journalUrls,
  ];
}
