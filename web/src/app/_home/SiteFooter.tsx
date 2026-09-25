import Link from "next/link";

const TOOLS = [
  ["/journals", "Browse journals"],
  ["/match", "Match your paper"],
  ["/review", "AI review"],
  ["/write", "Write the paper"],
  ["/figures", "Make figures"],
] as const;

export default function SiteFooter() {
  return (
    <footer className="site-footer section-shell">
      <div className="footer-brand">
        <span className="brand-mark" aria-hidden="true">
          M
        </span>
        <p>Calm tools for serious papers. Your manuscript stays on your device.</p>
      </div>
      <nav aria-label="Tools" className="footer-col">
        <span className="footer-head">Tools</span>
        {TOOLS.map(([href, label]) => (
          <Link key={href} href={href}>
            {label}
          </Link>
        ))}
      </nav>
      <nav aria-label="About" className="footer-col">
        <span className="footer-head">About</span>
        <Link href="/privacy">How privacy works</Link>
        <a href="https://openalex.org" rel="noopener noreferrer" target="_blank">
          Journal data from OpenAlex
        </a>
      </nav>
      <p className="footer-legal">© 2026 MargaLink</p>
    </footer>
  );
}
