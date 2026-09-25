import Link from "next/link";

// Transparent over the hero; once the page scrolls it becomes a paper-toned
// bar with a hairline, so headlines never run underneath the brand.
export default function SiteHeader({ scrolled, onOpenTools }: { scrolled: boolean; onOpenTools: () => void }) {
  return (
    <header className={`site-header${scrolled ? " scrolled" : ""}`}>
      <button className="brand" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} aria-label="MargaLink — back to top">
        <span className="brand-mark" aria-hidden="true">
          M
        </span>
        <span>MargaLink</span>
      </button>
      <nav className="header-nav" aria-label="Main">
        <Link href="/journals">Journals</Link>
        <Link href="/match">Match</Link>
        <Link href="/write">Write</Link>
        <button className="header-cta" onClick={onOpenTools}>
          All tools
        </button>
      </nav>
    </header>
  );
}
