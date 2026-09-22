import Link from "next/link";
import type { ReactNode } from "react";

// The shared header shell for every non-homepage route (match, review,
// journals, privacy, journal/[id]): a MargaLink wordmark + nav links, an
// h1, and an optional subtitle. Three content-width tiers, matched to what
// each route actually renders — a real reason, not inconsistency, so this
// intentionally doesn't force one width everywhere. Each page still owns
// its own <main className="max-w-{width}">; this only sizes the header
// block itself, tied to the same tier so the two can't drift apart.
const TITLE_CLASS = {
  "2xl": "font-serif text-3xl font-medium sm:text-4xl", // privacy, a single journal
  "3xl": "font-serif text-3xl font-medium sm:text-4xl", // journals (a list)
  "4xl": "font-serif text-4xl font-medium leading-tight sm:text-5xl", // match, review (tool layouts)
} as const;

// match/review/journals rely on the header's own bottom margin for the gap
// before what follows; privacy and journal/[id] don't have one — the
// element after the header supplies its own top margin instead.
const HEADER_SPACING = {
  "2xl": "",
  "3xl": "mb-10",
  "4xl": "mb-12",
} as const;

export type PageHeaderLink = { href: string; label: string };

export default function PageHeader({
  width,
  links,
  title,
  subtitle,
}: {
  width: keyof typeof TITLE_CLASS;
  links: PageHeaderLink[];
  title: ReactNode;
  subtitle?: ReactNode;
}) {
  return (
    <header className={HEADER_SPACING[width]}>
      <div className="mb-8 flex items-baseline justify-between">
        <Link href="/" className="font-serif text-lg font-medium">
          MargaLink
        </Link>
        <nav className="flex gap-5 text-sm text-ink-soft">
          {links.map((link) => (
            <Link key={link.href} href={link.href} className="hover:text-ink">
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
      <h1 className={TITLE_CLASS[width]}>{title}</h1>
      {subtitle}
    </header>
  );
}
