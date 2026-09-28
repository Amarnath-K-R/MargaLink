import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import { PRO, WELCOME_COINS } from "@/lib/coins";
import { CONTACT_EMAIL, OPERATOR } from "@/lib/site";

export const metadata: Metadata = {
  title: "Terms | MargaLink",
  description: "The terms for using MargaLink, and how M coins work.",
};

// Plain terms for a small service. M coins are described as prepaid usage
// credits for MargaLink's own AI features: never a wallet, never money.
export default function TermsPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-6 pt-3 pb-20">
      <PageHeader width="2xl" title="Terms" subtitle={<p className="mt-3 text-lg text-ink-soft">What you can expect from MargaLink, what we ask of you, and how M coins work.</p>} />

      <div className="mt-10 space-y-8 text-ink-soft [&_strong]:font-medium [&_strong]:text-ink">
        <Part title="The service">
          <p>
            MargaLink is run by {OPERATOR ?? "an individual in India"}. It helps you find a journal for a paper, check it against a journal&apos;s rules, make figures and write it. Most of it runs in your
            browser and is free, with no account. Two features send something to Anthropic&apos;s Claude and cost M coins: the AI pre-submission
            review and Ask Claude in the figure studio. The{" "}
            <Link href="/privacy" className="text-accent hover:underline">
              privacy page
            </Link>{" "}
            says exactly what each one sends.
          </p>
        </Part>

        <Part title="Your account">
          <p>
            Accounts are for people 18 or older. One account per person, signed in with Google or an emailed link. Keep access to that email
            address: it&apos;s how you sign in. We may
            suspend an account used to abuse the service, for example to farm welcome bonuses or get around charges.
          </p>
        </Part>

        <Part title="M coins">
          <ul className="list-disc space-y-2 pl-5">
            <li>
              M coins are prepaid credits for MargaLink&apos;s AI features, and nothing else. They have no cash value, can&apos;t be transferred to
              anyone else, and can&apos;t be exchanged for money, except as our{" "}
              <Link href="/refunds" className="text-accent hover:underline">
                refund policy
              </Link>{" "}
              or the law provides.
            </li>
            <li>A new account gets {WELCOME_COINS} M coins, once per email address.</li>
            <li>Coins you buy in a pack don&apos;t expire.</li>
            <li>
              Pro adds {PRO.coinsPerMonth} M coins each month. Unspent Pro coins carry over up to {PRO.carryCap}; beyond that they lapse when the next
              month&apos;s arrive. Pro coins are spent before others.
            </li>
            <li>
              The price of every use is shown before anything is sent. Any part of a review that doesn&apos;t come back (a section, or the final
              cross-check) is refunded automatically, and a failed Ask Claude request is refunded at once.
            </li>
            <li>Deleting your account ends its coins; they can&apos;t be restored.</li>
            <li>We may change what things cost or what coins cost; coins you already have keep working at the prices shown when you use them.</li>
          </ul>
        </Part>

        <Part title="Paying">
          <p>
            Coin packs and Pro are sold by Paddle, our reseller and merchant of record, under its buyer terms: Paddle takes the payment, charges any
            tax and sends the receipt. Pro renews until you cancel it, which you can do at any time from your account page; it then runs to the end of
            the period you paid for.
          </p>
        </Part>

        <Part title="What the AI gives you">
          <p>
            A review or a figure from Claude is an aid, not an editorial decision. It can be wrong or incomplete, and no journal is bound by it. Check
            what it says before you rely on it or act on it.
          </p>
        </Part>

        <Part title="Your work">
          <p>
            Your papers, data and figures stay yours; we claim no rights in them and keep none of them. When you send something to Claude through
            MargaLink, you confirm you&apos;re allowed to, for example with your co-authors&apos; agreement for an unpublished manuscript.
          </p>
        </Part>

        <Part title="Fair use">
          <p>
            Don&apos;t try to get around charges or limits, overload the service, call its API from anything but its own pages, or send material you
            have no right to share. Daily capacity is limited: if it&apos;s reached before a review or a request starts, nothing is charged; a review stopped
            midway by it is refunded for what didn&apos;t run.
          </p>
        </Part>

        <Part title="If something goes wrong">
          <p>
            MargaLink is provided as it is, and we can&apos;t promise it will always be available or free of errors. To the extent the law allows, our
            liability to you is limited to what you paid us in the twelve months before the problem. Nothing here limits rights you have under consumer
            law that can&apos;t be waived.
          </p>
        </Part>

        <Part title="Changes, law and contact">
          <p>
            We&apos;ll say on this page when these terms change; using MargaLink after that means you accept them. These terms are governed by the laws
            of India. Questions:{" "}
            {CONTACT_EMAIL ? (
              <a href={`mailto:${CONTACT_EMAIL}`} className="text-accent hover:underline">
                {CONTACT_EMAIL}
              </a>
            ) : (
              "the contact address listed here once accounts open"
            )}
            .
          </p>
        </Part>
      </div>
    </main>
  );
}

function Part({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-line pt-5">
      <h2 className="mb-2 font-serif text-xl font-medium text-ink">{title}</h2>
      {children}
    </section>
  );
}
