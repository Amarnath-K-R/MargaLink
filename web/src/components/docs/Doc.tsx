import type { ReactNode } from "react";
import shots from "@/app/guide/shots.json";

// The building blocks of the two documentation pages (/guide, /architecture),
// in the clay theme: a sticky contents list beside the text, sections with a
// bead, screenshots with numbered markers, option tables, and asides.
// Server components only — nothing here runs in the browser.

export type TocItem = { id: string; label: string; tint?: string };

export function DocBody({ toc, children }: { toc: TocItem[]; children: ReactNode }) {
  return (
    <div className="grid gap-10 lg:grid-cols-[13.5rem_minmax(0,1fr)]">
      <aside className="hidden lg:block">
        <nav aria-label="On this page" className="clay sticky top-24 p-3 text-sm">
          <p className="px-2 pb-2 text-xs font-medium text-ink-soft">On this page</p>
          <ol className="space-y-0.5">
            {toc.map((t) => (
              <li key={t.id}>
                <a href={`#${t.id}`} className="flex items-center gap-2.5 rounded-xl px-2 py-1.5 text-ink-soft transition-colors hover:bg-white/70 hover:text-ink">
                  <span aria-hidden className="h-2 w-2 shrink-0 rounded-full shadow-[inset_0_-1px_1px_rgba(58,44,28,.2)]" style={{ background: t.tint ?? "#ebe8df" }} />
                  {t.label}
                </a>
              </li>
            ))}
          </ol>
        </nav>
      </aside>
      <div className="min-w-0">
        <nav aria-label="On this page" className="clay-well mb-10 rounded-2xl p-4 text-sm lg:hidden">
          <p className="mb-2 text-xs font-medium text-ink-soft">On this page</p>
          <ol className="flex flex-wrap gap-2">
            {toc.map((t) => (
              <li key={t.id}>
                <a href={`#${t.id}`} className="clay-chip">
                  {t.label}
                </a>
              </li>
            ))}
          </ol>
        </nav>
        <div className="space-y-20">{children}</div>
      </div>
    </div>
  );
}

export function DocSection({
  id,
  title,
  lead,
  tint,
  icon,
  art,
  children,
}: {
  id: string;
  title: string;
  lead?: ReactNode;
  tint?: string;
  icon?: ReactNode;
  art?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-28">
      <header className={`mb-8 grid items-center gap-6 ${art ? "md:grid-cols-[minmax(0,1fr)_16rem]" : ""}`}>
        <div className="flex items-start gap-4">
          {icon && (
            <span aria-hidden className="bead mt-1 h-11 w-11 shrink-0" style={{ background: tint ?? "#ebe8df" }}>
              {icon}
            </span>
          )}
          <div className="min-w-0">
            <h2 className="font-serif text-3xl font-medium tracking-[-0.015em]">{title}</h2>
            {lead && <div className="mt-2 max-w-2xl text-base leading-relaxed text-ink-soft">{lead}</div>}
          </div>
        </div>
        {art && <div className="hidden md:block">{art}</div>}
      </header>
      <div className="space-y-10">{children}</div>
    </section>
  );
}

// A sub-part of a section: a serif heading and prose.
export function DocPart({ id, title, children }: { id?: string; title: string; children: ReactNode }) {
  return (
    <div id={id} className="scroll-mt-28">
      <h3 className="mb-3 font-serif text-xl font-medium tracking-[-0.01em]">{title}</h3>
      <div className="max-w-3xl space-y-3 text-[15px] leading-relaxed text-ink-soft [&_strong]:font-medium [&_strong]:text-ink">{children}</div>
    </div>
  );
}

type ShotData = { w: number; h: number; callouts: ({ x: number; y: number } | null)[] };
const SHOTS = shots as Record<string, ShotData>;

// A screenshot of the real UI (made by scripts/docs/guide_shots.mjs, which also
// measures where each numbered marker goes), on a paper sheet, with its
// numbered notes under it. A shot the script hasn't made yet says so.
// `narrow`: a small region (a card, a panel) shown near its real size
// rather than stretched across the column.
export function Shot({ name, alt, notes = [], caption, narrow = false }: { name: string; alt: string; notes?: ReactNode[]; caption?: ReactNode; narrow?: boolean }) {
  const s = SHOTS[name];
  return (
    <figure className={`space-y-4 ${narrow ? "max-w-xl" : ""}`}>
      <div className="sheet relative bg-[#f3f1ea] p-2 sm:p-3">
        {s ? (
          <div className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element -- a static screenshot; images are unoptimized in this static export */}
            <img src={`/guide/${name}.jpg`} alt={alt} width={s.w} height={s.h} loading="lazy" className="h-auto w-full rounded-lg shadow-[0_0_0_1px_rgba(58,44,28,.08)]" />
            {s.callouts.map(
              (c, i) =>
                c &&
                i < notes.length && (
                  <span
                    key={i}
                    aria-hidden
                    className="absolute grid h-6 w-6 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-accent font-mono text-[11px] font-medium text-white shadow-[0_0_0_3px_rgba(251,250,246,.95),0_4px_10px_-2px_rgba(44,95,111,.6)]"
                    style={{ left: `${c.x}%`, top: `${c.y}%` }}
                  >
                    {i + 1}
                  </span>
                ),
            )}
          </div>
        ) : (
          <p className="p-10 text-center text-sm text-ink-soft">Screenshot not generated yet. Run scripts/docs/guide_shots.mjs.</p>
        )}
      </div>
      {(notes.length > 0 || caption) && (
        <figcaption className="space-y-3">
          {caption && <p className="text-sm leading-relaxed text-ink-soft">{caption}</p>}
          {notes.length > 0 && (
            <ol className="grid gap-x-8 gap-y-2.5 text-sm leading-relaxed sm:grid-cols-2">
              {notes.map((n, i) => (
                <li key={i} className="flex gap-3">
                  <span aria-hidden className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-accent font-mono text-[10px] text-white">
                    {i + 1}
                  </span>
                  <span className="text-ink-soft [&_strong]:font-medium [&_strong]:text-ink">{n}</span>
                </li>
              ))}
            </ol>
          )}
        </figcaption>
      )}
    </figure>
  );
}

export type Option = { name: ReactNode; what: ReactNode; def?: ReactNode; away?: boolean };

// Every option of a control group: what it's called on screen, what it
// does, its default. A row that sends something off the device is marked
// in the app's "leaves this device" colour.
export function OptionTable({ title, rows }: { title?: string; rows: Option[] }) {
  return (
    <div className="sheet overflow-hidden">
      {title && <p className="border-b border-line/70 px-5 py-3 text-xs font-medium text-accent">{title}</p>}
      <dl className="divide-y divide-line/70 text-sm">
        {rows.map((r, i) => (
          <div key={i} className="grid gap-1 px-5 py-3 sm:grid-cols-[11rem_minmax(0,1fr)_8rem] sm:gap-4">
            <dt className="font-medium text-ink">
              {r.away && <span aria-label="Sends something off this device" className="mr-2 inline-block h-2 w-2 rounded-full bg-away align-middle" />}
              {r.name}
            </dt>
            <dd className="leading-relaxed text-ink-soft">{r.what}</dd>
            <dd className="text-xs text-ink-soft sm:text-right">{r.def ?? ""}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

// A short note beside the text: a tip, or something that leaves the device.
export function Aside({ tone = "tip", title, children }: { tone?: "tip" | "away"; title: string; children: ReactNode }) {
  return (
    <div className={`clay-well max-w-3xl rounded-2xl p-5 text-sm leading-relaxed ${tone === "away" ? "border-l-4 border-away" : ""}`}>
      <p className={`mb-1.5 flex items-center gap-2 font-medium ${tone === "away" ? "text-away" : "text-accent"}`}>
        <span aria-hidden className={`h-2 w-2 rounded-full ${tone === "away" ? "bg-away" : "bg-accent"}`} />
        {title}
      </p>
      <div className="space-y-2 text-ink-soft [&_strong]:font-medium [&_strong]:text-ink">{children}</div>
    </div>
  );
}

// Keys as small keycaps.
export function Keys({ children }: { children: string }) {
  return (
    <span className="inline-flex gap-1 align-middle">
      {children.split("+").map((k) => (
        <kbd key={k} className="clay-key h-6 min-w-6 cursor-default px-1.5 text-[11px] text-ink">
          {k}
        </kbd>
      ))}
    </span>
  );
}
