"use client";

import { useRef, type ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { TAG_TINT, type Update } from "../updates.ts";

const when = (date: string) => new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

// What's new as a timeline you move along — newest on the left, a card per
// update under its date — so it fits one screen however long it grows. The
// arrows (or a sideways scroll) move a card at a time; `heading` sits beside
// them. A card is as tall as its text, and scrolls inside only if the window
// is shorter than that.
export default function NewsRail({ updates, heading }: { updates: Update[]; heading: ReactNode }) {
  const rail = useRef<HTMLOListElement>(null);
  const move = (dir: 1 | -1) => {
    const el = rail.current;
    const card = el?.querySelector("li");
    el?.scrollBy({ left: dir * ((card?.getBoundingClientRect().width ?? 352) + 20), behavior: "smooth" });
  };
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-6 flex items-end justify-between gap-4">
        {/* the page's heading, in a wrapper of its own: an element from a server component
            is then a single child rather than one entry of a children array */}
        <div className="min-w-0">{heading}</div>
        <span className="flex shrink-0 gap-2">
          <button type="button" onClick={() => move(-1)} aria-label="Newer updates" className="clay-btn h-9 w-9 justify-center p-0">
            <ArrowLeft size={15} strokeWidth={2} />
          </button>
          <button type="button" onClick={() => move(1)} aria-label="Older updates" className="clay-btn h-9 w-9 justify-center p-0">
            <ArrowRight size={15} strokeWidth={2} />
          </button>
        </span>
      </div>
      <ol
        ref={rail}
        className="-mx-6 flex min-h-0 flex-1 snap-x snap-mandatory items-start gap-5 overflow-x-auto scroll-px-6 px-6 pb-5 pt-1 [mask-image:linear-gradient(to_right,black_calc(100%-4rem),transparent)]"
      >
        {updates.map((u, i) => {
          const firstOfDay = i === 0 || updates[i - 1].date !== u.date;
          return (
            <li key={u.title} className="flex max-h-full w-[19rem] shrink-0 snap-start flex-col sm:w-[21rem]">
              <div className="mb-4 flex h-6 items-center gap-2.5" aria-hidden={!firstOfDay}>
                {firstOfDay ? (
                  <>
                    <span className="h-3 w-3 shrink-0 rounded-full bg-accent shadow-[0_0_0_4px_rgba(44,95,111,.15)]" />
                    <time dateTime={u.date} className="shrink-0 font-mono text-xs text-ink-soft">
                      {when(u.date)}
                    </time>
                    {i === 0 && <span className="shrink-0 rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-medium text-accent">Latest</span>}
                  </>
                ) : (
                  <span className="h-2 w-2 shrink-0 rounded-full bg-line" />
                )}
                <span className="-mr-5 h-px flex-1 bg-line" />
              </div>
              <article className="clay min-h-0 overflow-y-auto p-5">
                <span className="self-start rounded-full px-2.5 py-0.5 text-xs font-medium text-ink shadow-[inset_0_1px_0_rgba(255,255,255,.6),0_1px_2px_rgba(58,44,28,.15)]" style={{ background: TAG_TINT[u.tag] }}>
                  {u.tag}
                </span>
                <h3 className="mt-3 font-serif text-xl font-medium leading-snug tracking-[-0.01em]">{u.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-soft">{u.summary}</p>
                {u.points && (
                  <ul className="mt-3 space-y-1.5 text-sm text-ink-soft">
                    {u.points.map((p) => (
                      <li key={p} className="flex gap-2.5">
                        <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent/60" />
                        {p}
                      </li>
                    ))}
                  </ul>
                )}
                {u.href && (
                  <div className="pt-4">
                    <Link href={u.href} className="clay-chip">
                      {u.cta ?? "Try it"} <ArrowRight size={13} strokeWidth={2} />
                    </Link>
                  </div>
                )}
              </article>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
