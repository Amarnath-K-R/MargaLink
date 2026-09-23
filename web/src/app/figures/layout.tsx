import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Make a figure — MargaLink",
  description:
    "Upload a CSV or Excel file and generate a publication-ready figure. Figures are drawn on your device and your data's values never leave it — asking Claude for help sends only column names, types and your request, with consent.",
};

export default function FiguresLayout({ children }: LayoutProps<"/figures">) {
  return children;
}
