import type { Metadata } from "next";
import { IBM_Plex_Serif, IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import { SITE_URL } from "@/lib/site";
import "./globals.css";

const plexSerif = IBM_Plex_Serif({
  variable: "--font-serif",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const plexSans = IBM_Plex_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

const TITLE = "MargaLink — get your paper ready to submit";
const DESCRIPTION =
  "Match your paper to a journal, check its format, and soon get it reviewed — all without your paper ever leaving your device.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: SITE_URL,
    siteName: "MargaLink",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${plexSerif.variable} ${plexSans.variable} ${plexMono.variable} h-full antialiased`}
      // Browser extensions (Dark Reader, Grammarly, etc.) inject attributes
      // onto <html> after the server render — that's a real DOM difference,
      // not a bug, so this is the documented way to stop React flagging it.
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
