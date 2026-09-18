import { ImageResponse } from "next/og";

export const dynamic = "force-static"; // same static-export requirement as sitemap.ts
export const alt = "MargaLink — get your paper ready to submit";
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
        <div style={{ fontSize: 64, fontWeight: 600, lineHeight: 1.15, display: "flex" }}>
          Get your paper ready to submit.
        </div>
        <div style={{ fontSize: 32, color: "#565B66", marginTop: 28, display: "flex" }}>
          Match it to a journal, check its format — never leaving your device.
        </div>
      </div>
    ),
    { ...size }
  );
}
