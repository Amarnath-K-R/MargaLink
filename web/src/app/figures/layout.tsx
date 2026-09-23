import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Make a figure — MargaLink",
  description:
    "Upload a CSV or Excel file and generate a publication-ready figure. Your data's values never leave your device — only column names and your chart choice do, with consent.",
};

export default function FiguresLayout({ children }: LayoutProps<"/figures">) {
  return children;
}
