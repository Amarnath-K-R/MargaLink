import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Match your paper — MargaLink",
  description:
    "Upload a finished paper and get matching journals, plus a format check. The paper never leaves your device.",
};

export default function MatchLayout({ children }: LayoutProps<"/match">) {
  return children;
}
