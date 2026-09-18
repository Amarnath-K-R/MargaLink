import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Static export: the whole product is client-side, no backend (see plan).
  output: "export",
  images: { unoptimized: true },
};

export default nextConfig;
