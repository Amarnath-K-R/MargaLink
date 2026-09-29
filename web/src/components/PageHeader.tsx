import Link from "next/link";
import type { ReactNode } from "react";
import { BarChart3, BookOpen, CircleHelp, FileCheck2, House, PenLine, ScanSearch } from "lucide-react";
import AccountButton from "./AccountButton";
import BetaTag from "./BetaTag";
import { LogoMark, Wordmark } from "./Logo";

// The shared header for every non-homepage route: a sticky clay tray (the
// landing, Home — the dashboard — the five tools with the current one
// pressed in, the guide, and the account: Sign in, or the M coin balance;
// Privacy and the other site links are in the dashboard's footer) that is the same
// width on every page, so moving between tools feels like one app; then the
// page's h1 with its tool's bead, and an optional subtitle. The h1 keeps
// three content-width tiers, matched to what each route renders; each page
// still owns its own <main className="max-w-{width}">.
const TITLE_CLASS = {
  "2xl": "font-serif text-3xl font-medium tracking-[-0.015em] sm:text-4xl", // privacy, a single journal
  "3xl": "font-serif text-3xl font-medium tracking-[-0.015em] sm:text-4xl", // journals (a list)
  "4xl": "font-serif text-4xl font-medium leading-tight tracking-[-0.02em] sm:text-5xl", // the tools
} as const;

// match/review/journals rely on the header's own bottom margin for the gap
// before what follows; privacy and journal/[id] don't have one — the
// element after the header supplies its own top margin instead.
const HEADER_SPACING = {
  "2xl": "",
  "3xl": "mb-10",
  "4xl": "mb-12",
} as const;

// Each tool's bead is a tint from the homepage's clay palette (the writing
// workspace's toolbar uses the same ones).
export const TOOL_NAV = [
  { id: "journals", href: "/journals", label: "Journals", Icon: BookOpen, bead: "#efe3cf" },
  { id: "match", href: "/match", label: "Match", Icon: ScanSearch, bead: "#cfe0e1" },
  { id: "review", href: "/review", label: "Review", Icon: FileCheck2, bead: "#ecdcc0" },
  { id: "figures", href: "/figures", label: "Figures", Icon: BarChart3, bead: "#f1d2c2" },
  { id: "write", href: "/write", label: "Write", Icon: PenLine, bead: "#dde6e6" },
] as const;
export type ToolId = (typeof TOOL_NAV)[number]["id"];

export default function PageHeader({
  width,
  tool,
  page,
  title,
  subtitle,
}: {
  width: keyof typeof TITLE_CLASS;
  tool?: ToolId;
  page?: "home" | "guide" | "architecture" | "privacy"; // a non-tool page to show as current
  title?: ReactNode; // none: the tray only — the page draws its own heading, with id="content"
  subtitle?: ReactNode;
}) {
  // The bead beside the title: the tool's, or the house on Home.
  const current = TOOL_NAV.find((t) => t.id === tool) ?? (page === "home" ? { bead: "#fbfaf6", Icon: House } : undefined);
  return (
    <>
      {/* The first tab stop: past the tray's links, straight to the page. */}
      <a href="#content" className="clay-btn clay-primary fixed left-4 top-4 z-50 -translate-y-24 focus:translate-y-0">
        Skip to content
      </a>
      {/* Wider than the page's column: the tray is the same size on every route.
          A sibling of the <header>, not inside it, so it sticks for the whole page. */}
      <div className={`sticky top-3 z-30 mx-[calc((100%_-_min(100vw_-_1.5rem,76rem))/2)] ${title === undefined ? "mb-6" : "mb-12 sm:mb-14"}`}>
        <nav aria-label="MargaLink" className="clay flex items-center gap-1 px-2 py-2 sm:gap-1.5 sm:px-2.5">
          <Link href="/" aria-label="MargaLink, home" className="flex shrink-0 items-center gap-2 rounded-xl sm:pr-2">
            <LogoMark className="h-8 w-8" />
            <Wordmark className="hidden text-[1.1rem] md:inline" />
            <BetaTag />
          </Link>
          <div className="flex min-w-0 flex-1 items-center justify-center gap-0.5 overflow-x-auto">
            <Link href="/home" aria-current={page === "home" ? "page" : undefined} className="clay-ghost shrink-0 text-xs max-sm:px-1">
              <span className="bead" style={{ background: "#fbfaf6" }}>
                <House size={13} strokeWidth={2} />
              </span>
              <span className="sr-only sm:not-sr-only">Home</span>
            </Link>
            <span aria-hidden className="mx-1 hidden h-5 w-px bg-line sm:block" />
            {TOOL_NAV.map(({ id, href, label, Icon, bead }) => (
              <Link key={id} href={href} aria-current={id === tool ? "page" : undefined} className="clay-ghost shrink-0 text-xs max-sm:px-1">
                <span className="bead" style={{ background: bead }}>
                  <Icon size={13} strokeWidth={2} />
                </span>
                <span className="sr-only sm:not-sr-only">{label}</span>
              </Link>
            ))}
          </div>
          {/* Words from sm up; on a phone an icon each, so all five tools still fit. */}
          <Link href="/guide" aria-current={page === "guide" ? "page" : undefined} className="clay-ghost shrink-0 px-1.5 text-xs text-ink-soft sm:px-3">
            <CircleHelp size={15} strokeWidth={1.9} className="sm:hidden" />
            <span className="sr-only sm:not-sr-only">Guide</span>
          </Link>
          <AccountButton />
        </nav>
      </div>
      {title !== undefined && (
        <header id="content" className={`flex scroll-mt-24 items-start gap-5 ${HEADER_SPACING[width]}`}>
          {current && (
            <span aria-hidden className="bead mt-1.5 hidden h-12 w-12 shrink-0 sm:grid" style={{ background: current.bead }}>
              <current.Icon size={22} strokeWidth={1.8} />
            </span>
          )}
          <div className="min-w-0">
            <h1 className={TITLE_CLASS[width]}>{title}</h1>
            {subtitle}
          </div>
        </header>
      )}
    </>
  );
}
