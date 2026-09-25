import { ArrowUpRight } from "lucide-react";

// No scroll-progress props — unlike every other homepage section, the
// header's own appearance never changes with scroll.
export default function SiteHeader({ onOpenTools }: { onOpenTools: () => void }) {
  return (
    <header className="site-header">
      <button className="brand" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} aria-label="Back to top">
        <span className="brand-mark">M</span>
        <span>MargaLink</span>
      </button>
      <div className="header-meta">
        <span className="mono header-note">PRIVATE BY DEFAULT</span>
        <button className="header-cta" onClick={onOpenTools}>
          Explore tools <ArrowUpRight size={15} strokeWidth={1.8} />
        </button>
      </div>
    </header>
  );
}
