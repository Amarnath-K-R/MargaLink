import type { ReactNode } from "react";

// The step number and its name, in sentence case — the number carries the
// sequence, so the label doesn't need to shout.
export function StageLabel({ number, label }: { number: string; label: string }) {
  return (
    <p className="stage-label">
      <span className="stage-number">{number}</span>
      <span>{label}</span>
    </p>
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
