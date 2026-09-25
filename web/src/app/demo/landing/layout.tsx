import type { Metadata } from "next";

// Design demos for choosing the landing direction — not linked, not indexed.
export const metadata: Metadata = { title: "Landing demos — MargaLink", robots: { index: false, follow: false } };

export default function DemoLayout({ children }: LayoutProps<"/demo/landing">) {
  return children;
}
