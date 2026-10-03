import type { ReactNode } from "react";

// A titled section of the legal pages (contact, terms, refunds).
export default function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-line pt-5">
      <h2 className="mb-2 font-serif text-xl font-medium text-ink">{title}</h2>
      {children}
    </section>
  );
}
