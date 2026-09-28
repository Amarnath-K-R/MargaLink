import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Write your paper | MargaLink",
  description:
    "Write a LaTeX paper in your journal's template and compile it in your browser; match it to journals, check its format, make figures and get it reviewed from the same page. Your manuscript stays on your device unless you ask for an AI review.",
};

export default function WriteLayout({ children }: LayoutProps<"/write">) {
  return children;
}
