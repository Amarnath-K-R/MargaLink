import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import AccountButton from "@/components/AccountButton";

// No scroll-progress props — unlike every other homepage section, the
// header's own appearance never changes with scroll. Its one way in is the
// dashboard (/home), where the guide and the workspace start; beside it,
// Sign in, or the M coin balance once signed in.
export default function SiteHeader() {
  return (
    <header className="site-header">
      <button className="brand" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} aria-label="Back to top">
        <span className="brand-mark">M</span>
        <span>MargaLink</span>
      </button>
      <div className="header-meta">
        <span className="mono header-note">PRIVATE BY DEFAULT</span>
        <AccountButton variant="landing" />
        <Link href="/home" className="header-cta">
          Dashboard <ArrowUpRight size={15} strokeWidth={1.8} />
        </Link>
      </div>
    </header>
  );
}
