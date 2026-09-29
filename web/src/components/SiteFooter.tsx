import Link from "next/link";
import { LogoMark, Wordmark } from "./Logo";
import BetaTag from "./BetaTag";
import { OPERATOR } from "@/lib/site";

// The site's footer (on the dashboard): the logo and what MargaLink is, the
// links people look for at the bottom of a page, and the copyright.
const GROUPS: { title: string; links: { href: string; label: string }[] }[] = [
  {
    title: "Tools",
    links: [
      { href: "/journals", label: "Journals" },
      { href: "/match", label: "Match" },
      { href: "/review", label: "Review" },
      { href: "/figures", label: "Figures" },
      { href: "/write", label: "Write" },
    ],
  },
  {
    title: "Help",
    links: [
      { href: "/guide", label: "Guide" },
      { href: "/architecture", label: "How it's built" },
      { href: "/contact", label: "Contact and support" },
    ],
  },
  {
    title: "MargaLink",
    links: [
      { href: "/team", label: "Our team" },
      { href: "/pricing", label: "Pricing" },
    ],
  },
  {
    title: "Legal",
    links: [
      { href: "/privacy", label: "Privacy" },
      { href: "/terms", label: "Terms" },
      { href: "/refunds", label: "Refunds" },
    ],
  },
];

export default function SiteFooter() {
  return (
    <footer className="clay mb-6 rounded-[28px] px-7 pb-6 pt-8 sm:px-10">
      <div className="grid grid-cols-2 gap-x-6 gap-y-8 md:grid-cols-[minmax(0,1.5fr)_repeat(4,minmax(0,1fr))] md:gap-10">
        <div className="col-span-2 md:col-span-1">
          <Link href="/" aria-label="MargaLink, home" className="inline-flex items-center gap-2">
            <LogoMark className="h-8 w-8" />
            <Wordmark className="text-[1.15rem]" />
            <BetaTag />
          </Link>
          <p className="mt-3 max-w-xs text-sm leading-relaxed text-ink-soft">
            Find the journal that fits your paper, check it against the journal&apos;s rules and write it in its template, with your manuscript
            staying in your browser.
          </p>
        </div>
        {GROUPS.map((g) => (
          <nav key={g.title} aria-label={g.title}>
            <p className="text-xs font-medium text-ink">{g.title}</p>
            <ul className="mt-3 space-y-2 text-sm">
              {g.links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="text-ink-soft transition-colors hover:text-ink">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-line/80 pt-5 text-xs text-ink-soft">
        <p>
          © {new Date().getFullYear()} MargaLink. All rights reserved.{OPERATOR ? ` MargaLink is run by ${OPERATOR}, India.` : ""}
        </p>
        <a href="#content" className="transition-colors hover:text-ink">
          Back to top
        </a>
      </div>
    </footer>
  );
}
