import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Browse journals — MargaLink",
  description: "Search and browse journals by name or field, without uploading a paper.",
};

export default function JournalsLayout({ children }: LayoutProps<"/journals">) {
  return children;
}
