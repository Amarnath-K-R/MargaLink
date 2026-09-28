import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowDown, ArrowRight } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { GuideArt, WriteArt } from "@/components/docs/Art";
import { TAG_TINT, UPDATES, type Update } from "./updates.ts";

export const metadata: Metadata = {
  title: "Home — MargaLink",
  description: "Start writing your paper, learn your way around MargaLink, and see what's new.",
};

// The dashboard: where the landing page's Dashboard button leads. Two ways
// in — the workspace and the guide — and, further down, what's new
// (updates.ts, newest first).
export default function HomeDashboard() {
  const groups = UPDATES.reduce<{ date: string; items: Update[] }[]>((out, u) => {
    const last = out[out.length - 1];
    if (last?.date === u.date) last.items.push(u);
    else out.push({ date: u.date, items: [u] });
    return out;
  }, []);

  return (
    <main className="mx-auto w-full max-w-6xl px-6 pt-3 pb-24">
      <PageHeader
        width="4xl"
        page="home"
        title="Home"
        subtitle={<p className="mt-3 max-w-xl text-lg text-ink-soft">Pick up your paper, or learn your way around. Everything here runs in your browser.</p>}
      />

      <div className="grid gap-6 md:grid-cols-2">
        <StartCard
          href="/write"
          art={<WriteArt bare />}
          title="Write your paper"
          text="Your journal's LaTeX template, compiled in your browser — with matching, review, figures and checks a window away."
          cta="Open the workspace"
          primary
        />
        <StartCard
          href="/guide"
          art={<GuideArt bare />}
          title="Read the guide"
          text="Every tool and every option, shown on the real screens — start here if you're new."
          cta="Open the guide"
        />
      </div>

      <p className="mt-14 flex justify-center">
        <a href="#news" className="clay-chip h-9 px-4 text-sm">
          What&apos;s new <ArrowDown size={14} strokeWidth={2} />
        </a>
      </p>

      <section id="news" aria-labelledby="news-title" className="mt-14 scroll-mt-28">
        <h2 id="news-title" className="font-serif text-3xl font-medium tracking-[-0.015em]">
          What&apos;s new
        </h2>
        <p className="mt-2 text-ink-soft">New tools and changes, newest first.</p>

        <ol className="relative mt-10 space-y-12 md:before:absolute md:before:bottom-4 md:before:left-[9.25rem] md:before:top-4 md:before:w-px md:before:bg-line">
          {groups.map((g, gi) => (
            <li key={g.date} className="relative grid gap-4 md:grid-cols-[8rem_minmax(0,1fr)] md:gap-10">
              <div className="md:pt-5 md:text-right">
                <time dateTime={g.date} className="font-mono text-xs text-ink-soft">
                  {new Date(`${g.date}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}
                </time>
                {gi === 0 && <p className="mt-1.5 text-xs font-medium text-accent md:ml-auto">Latest</p>}
                <span aria-hidden className="absolute left-[9.25rem] top-6 hidden h-3 w-3 -translate-x-1/2 rounded-full bg-accent shadow-[0_0_0_4px_rgba(240,239,234,1),0_0_0_5px_rgba(44,95,111,.25)] md:block" />
              </div>
              <div className="space-y-4">
                {g.items.map((u) => (
                  <article key={u.title} className="clay p-6">
                    <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium text-ink shadow-[inset_0_1px_0_rgba(255,255,255,.6),0_1px_2px_rgba(58,44,28,.15)]" style={{ background: TAG_TINT[u.tag] }}>
                      {u.tag}
                    </span>
                    <h3 className="mt-3 font-serif text-xl font-medium tracking-[-0.01em]">{u.title}</h3>
                    <p className="mt-2 max-w-2xl leading-relaxed text-ink-soft">{u.summary}</p>
                    {u.points && (
                      <ul className="mt-3 max-w-2xl space-y-1.5 text-sm text-ink-soft">
                        {u.points.map((p) => (
                          <li key={p} className="flex gap-2.5">
                            <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent/60" />
                            {p}
                          </li>
                        ))}
                      </ul>
                    )}
                    {u.href && (
                      <Link href={u.href} className="clay-chip mt-4">
                        {u.cta ?? "Try it"} <ArrowRight size={13} strokeWidth={2} />
                      </Link>
                    )}
                  </article>
                ))}
              </div>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}

// One of the two ways in: a big clay card, its illustration pressed into it,
// the whole card a link.
function StartCard({ href, art, title, text, cta, primary = false }: { href: string; art: ReactNode; title: string; text: string; cta: string; primary?: boolean }) {
  return (
    <Link
      href={href}
      className="clay group flex flex-col rounded-[28px] p-4 transition-transform duration-300 hover:-translate-y-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
    >
      <div className="clay-well rounded-[22px] p-2">{art}</div>
      <div className="flex flex-1 flex-col px-3 pb-2 pt-6">
        <h2 className="font-serif text-3xl font-medium tracking-[-0.015em]">{title}</h2>
        <p className="mt-2 max-w-md leading-relaxed text-ink-soft">{text}</p>
        <span className={`clay-btn mt-6 h-11 self-start px-6 text-sm font-medium ${primary ? "clay-primary" : ""}`}>
          {cta} <ArrowRight size={15} strokeWidth={2} className="transition-transform group-hover:translate-x-0.5" />
        </span>
      </div>
    </Link>
  );
}
