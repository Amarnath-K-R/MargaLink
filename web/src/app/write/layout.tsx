import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Write your paper — MargaLink",
  description:
    "Write a LaTeX paper in your journal's template and compile it in your browser. Your manuscript stays on your device; nothing is uploaded.",
};

export default function WriteLayout({ children }: LayoutProps<"/write">) {
  return children;
}
