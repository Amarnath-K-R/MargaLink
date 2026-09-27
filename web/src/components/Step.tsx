import type { ReactNode } from "react";

// One numbered step of a tool page, on a clay slab: a bead with the number
// (in the tool's tint), the step's title and an optional line under it.
export default function Step({
  n,
  title,
  hint,
  tint,
  className = "",
  children,
}: {
  n: number | string;
  title: ReactNode;
  hint?: ReactNode;
  tint: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={`clay p-6 sm:p-8 ${className}`}>
      <header className="mb-6 flex items-start gap-3.5">
        <span aria-hidden className="bead mt-0.5 h-8 w-8 shrink-0 font-mono text-sm" style={{ background: tint }}>
          {n}
        </span>
        <div className="min-w-0">
          <h2 className="font-serif text-xl font-medium tracking-[-0.01em]">{title}</h2>
          {hint && <div className="mt-1 max-w-2xl text-sm leading-relaxed text-ink-soft">{hint}</div>}
        </div>
      </header>
      {children}
    </section>
  );
}
