import { ImageResponse } from "next/og";

export const dynamic = "force-static"; // same static-export requirement as sitemap.ts
export const alt = "MargaLink — find the right journal";
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
          background: "#F0EFEA",
          color: "#1B1F27",
          padding: "80px",
        }}
      >
        <div style={{ fontSize: 32, color: "#2C5F6F", marginBottom: 24 }}>MargaLink</div>
        <div style={{ fontSize: 72, fontWeight: 600, lineHeight: 1.1, display: "flex" }}>
          Find the right journal.
        </div>
        <div style={{ fontSize: 34, color: "#565B66", marginTop: 28, display: "flex" }}>
          Nothing about your paper leaves this tab.
        </div>
      </div>
    ),
    { ...size }
  );
}
