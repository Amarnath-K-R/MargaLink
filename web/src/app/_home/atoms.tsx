import type { ReactNode } from "react";

// Shared by SiteHeader, HeroSection, and PathwaysSection's workflow links —
// every homepage in-page nav jump goes through this one function.
export function scrollToId(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
}

export function StageLabel({ number, label }: { number: string; label: string }) {
  return (
    <div className="stage-label">
      <span>{number}</span>
      <span>{label}</span>
    </div>
  );
}

export function PrivacyPill({ children }: { children: ReactNode }) {
  return (
    <span className="privacy-pill">
      <span className="privacy-dot" />
      {children}
    </span>
  );
}
