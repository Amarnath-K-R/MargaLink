import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import PageHeader from "@/components/layout/PageHeader";
import SiteFooter from "@/components/layout/SiteFooter";
import { TEAM, type Member } from "./team";

export const metadata: Metadata = {
  title: "Our team | MargaLink",
  description: "The people building MargaLink, and why.",
};

export default function TeamPage() {
  return (
    <main className="mx-auto w-full max-w-6xl px-6 pt-3">
      <div className="mx-auto max-w-3xl">
        <PageHeader width="2xl" title="Our team" subtitle={<p className="mt-3 text-lg text-ink-soft">The people building MargaLink, and why.</p>} />

        <div className="mt-10 space-y-10 pb-16">
          <Part title="Why MargaLink">
            <p>
              Marga is Sanskrit for &ldquo;path&rdquo;. Getting a paper from a draft to a journal is a path with many turns: finding a journal
              that fits, meeting its rules, writing in its template, checking the figures and the numbers. MargaLink puts each of those steps in
              one place.
            </p>
            <p>
              We build it so your manuscript stays yours. Matching, the checks, figures and writing run in your browser, and the two features that
              need an AI model send only what you approve, after telling you exactly what.
            </p>
          </Part>

          <Part title="The team">
            {TEAM.length ? (
              <ul className="grid gap-5 sm:grid-cols-2">
                {TEAM.map((m) => (
                  <MemberCard key={m.name} m={m} />
                ))}
              </ul>
            ) : (
              <p>Introductions are coming soon.</p>
            )}
          </Part>

          <Part title="Get in touch">
            <p>
              Questions, ideas, or something that broke: the{" "}
              <Link href="/contact" className="text-accent hover:underline">
                contact page
              </Link>{" "}
              has every way to reach us. MargaLink is in beta, and we read everything.
            </p>
          </Part>
        </div>
      </div>
      <SiteFooter />
    </main>
  );
}

function Part({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-line pt-6">
      <h2 className="mb-3 font-serif text-2xl font-medium text-ink">{title}</h2>
      <div className="space-y-3 leading-relaxed text-ink-soft">{children}</div>
    </section>
  );
}

function MemberCard({ m }: { m: Member }) {
  const initials = m.name
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <li className="sheet flex gap-4 p-5">
      {m.photo ? (
        // A plain <img>: the site is a static export, with no image optimiser behind it.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={m.photo} alt="" className="h-16 w-16 shrink-0 rounded-2xl object-cover" />
      ) : (
        <span aria-hidden className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-accent-soft font-serif text-xl text-accent">
          {initials}
        </span>
      )}
      <div className="min-w-0">
        <p className="font-serif text-lg font-medium text-ink">{m.link ? <a href={m.link} className="hover:underline">{m.name}</a> : m.name}</p>
        <p className="text-sm text-accent">{m.role}</p>
        <p className="mt-2 text-sm leading-relaxed">{m.about}</p>
      </div>
    </li>
  );
}
