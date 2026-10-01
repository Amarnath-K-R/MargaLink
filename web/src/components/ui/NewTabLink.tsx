import type { ReactNode } from "react";

// A link that opens in a new tab, so a loaded paper or a half-done checkout stays put.
export default function NewTabLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener" className="text-accent hover:underline">
      {children}
    </a>
  );
}
