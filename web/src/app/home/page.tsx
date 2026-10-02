import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowDown, ArrowRight, House } from "lucide-react";
import PageHeader from "@/components/layout/PageHeader";
import SiteFooter from "@/components/layout/SiteFooter";
import { GuideArt, WriteArt } from "@/components/docs/Art";
import NewsRail from "./_components/NewsRail.tsx";
import AccountStrip from "./_components/AccountStrip.tsx";
import { UPDATES } from "./updates.ts";

export const metadata: Metadata = {
  title: "Home | MargaLink",
  description: "Start writing your paper, learn your way around MargaLink, and see what's new.",
};

// The dashboard: where the landing page's Dashboard button leads. Two
// screens on a wider display, each exactly the window's height: the two ways
// in (the workspace, the guide), then what's new (updates.ts, newest first).
// On a phone they simply stack.
export default function HomeDashboard() {
  return (
    <main className="mx-auto w-full max-w-6xl px-6 pt-3">
      <PageHeader width="4xl" page="home" />

      {/* The window minus the tray above it (its top offset, height and margin: 5.75rem). */}
      <section className="flex flex-col pb-6 md:h-[calc(100dvh-5.75rem)] md:min-h-[32rem]">
        <header id="content" className="flex scroll-mt-24 flex-wrap items-center gap-5">
          <span aria-hidden className="bead hidden h-12 w-12 shrink-0 sm:grid" style={{ background: "#fbfaf6" }}>
            <House size={22} strokeWidth={1.8} />
          </span>
          <div className="min-w-0">
            <h1 className="font-serif text-4xl font-medium leading-tight tracking-[-0.02em] sm:text-5xl">Home</h1>
            <p className="mt-1 text-lg text-ink-soft">Pick up your paper, or learn your way around. Everything here runs in your browser.</p>
          </div>
          <AccountStrip />
        </header>

        <div className="mt-7 grid min-h-0 flex-1 gap-6 md:grid-cols-2 md:grid-rows-[minmax(0,1fr)]">
          <StartCard
            href="/write"
            art={<WriteArt bare />}
            title="Write your paper"
            text="Your journal's LaTeX template or your Word document, in your browser, with matching, review, figures and checks a window away."
            cta="Open the workspace"
            primary
          />
          <StartCard
            href="/guide"
            art={<GuideArt bare />}
            title="Read the guide"
            text="Every tool and every option, shown on the real screens. Start here if you're new."
            cta="Open the guide"
          />
        </div>

        <p className="mt-5 flex justify-center">
          <a href="#news" className="clay-chip h-9 px-4 text-sm">
            What&apos;s new <ArrowDown size={14} strokeWidth={2} />
          </a>
        </p>
      </section>

      {/* A full window of its own, starting below the sticky tray. */}
      <section id="news" aria-labelledby="news-title" className="flex flex-col pb-10 pt-14 md:h-dvh md:min-h-[34rem] md:pt-24">
        <NewsRail
          updates={UPDATES}
          heading={
            <div>
              <h2 id="news-title" className="font-serif text-3xl font-medium tracking-[-0.015em]">
                What&apos;s new
              </h2>
              <p className="mt-1 text-ink-soft">New tools and changes, newest first, older ones to the right.</p>
            </div>
          }
        />
      </section>
      <SiteFooter />
    </main>
  );
}

// One of the two ways in: a big clay card, its illustration pressed into it
// and taking whatever height is left, the whole card a link.
function StartCard({ href, art, title, text, cta, primary = false }: { href: string; art: ReactNode; title: string; text: string; cta: string; primary?: boolean }) {
  return (
    <Link
      href={href}
      className="clay group flex min-h-0 flex-col rounded-[28px] p-4 transition-transform duration-300 hover:-translate-y-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
    >
      <div className="clay-well min-h-0 flex-1 rounded-[22px] p-2">{art}</div>
      <div className="shrink-0 px-3 pb-1 pt-5">
        <h2 className="font-serif text-3xl font-medium tracking-[-0.015em]">{title}</h2>
        <p className="mt-1.5 max-w-md leading-relaxed text-ink-soft">{text}</p>
        <span className={`clay-btn mt-4 h-11 px-6 text-sm font-medium ${primary ? "clay-primary" : ""}`}>
          {cta} <ArrowRight size={15} strokeWidth={2} className="transition-transform group-hover:translate-x-0.5" />
        </span>
      </div>
    </Link>
  );
}
