import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import AccountButton from "@/components/account/AccountButton";
import BetaTag from "@/components/layout/BetaTag";
import { LogoMark, Wordmark } from "@/components/layout/Logo";

// No scroll-progress props — unlike every other homepage section, the
// header's own appearance never changes with scroll. Its one way in is the
// dashboard (/home), where the guide and the workspace start; beside it,
// Sign in, or the M coin balance once signed in.
export default function SiteHeader() {
  return (
    <header className="site-header">
      <button className="brand" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} aria-label="Back to top">
        <LogoMark className="h-7 w-7" />
        <Wordmark className="text-[17px]" />
        <BetaTag />
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
