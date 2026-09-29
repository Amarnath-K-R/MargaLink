import { ImageResponse } from "next/og";
import { SITE_TITLE, BRAND } from "@/lib/site";

export const dynamic = "force-static"; // same static-export requirement as sitemap.ts
export const alt = SITE_TITLE;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          background: BRAND.paper,
          color: BRAND.ink,
          padding: "80px",
        }}
      >
        {/* The logo: the mark, then the name (the ochre dot on the i needs IBM
            Plex Sans, which this renderer doesn't load, so the name is plain). */}
        <div style={{ display: "flex", alignItems: "center", gap: 18, marginBottom: 36 }}>
          <svg width="64" height="64" viewBox="0 0 100 100">
            <path d="M22 78 V32 Q22 20 31 28 L50 50 L69 28 Q78 20 78 32 V64" fill="none" stroke={BRAND.accent} strokeWidth="16" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="78" cy="86" r="9" fill={BRAND.spark} />
          </svg>
          <div style={{ display: "flex", fontSize: 44, fontWeight: 600, letterSpacing: "-0.02em" }}>
            <span>Marga</span>
            <span style={{ color: BRAND.accent }}>Link</span>
          </div>
        </div>
        <div style={{ fontSize: 64, fontWeight: 600, lineHeight: 1.15, display: "flex" }}>
          Get your paper ready to submit.
        </div>
        <div style={{ fontSize: 32, color: BRAND.inkSoft, marginTop: 28, display: "flex" }}>
          Match it to a journal and check its format, never leaving your device.
        </div>
      </div>
    ),
    { ...size }
  );
}
