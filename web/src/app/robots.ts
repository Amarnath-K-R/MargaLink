import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

// Same static-export requirement as sitemap.ts — see the comment there.
export const dynamic = "force-static";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
