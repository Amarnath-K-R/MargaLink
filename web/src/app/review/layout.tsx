import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Get it reviewed — MargaLink",
  description:
    "Upload a paper, choose a journal, and get an AI review checked against that journal's guidelines. Opt-in only — see exactly what's sent before anything leaves your device.",
};

export default function ReviewLayout({ children }: LayoutProps<"/review">) {
  return children;
}
