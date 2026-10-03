import type { Metadata } from "next";
import Link from "next/link";
import PageHeader from "@/components/layout/PageHeader";
import LegalSection from "@/components/layout/LegalSection";
import { ContactEmail } from "@/components/layout/ContactDetails";
import { PADDLE_RESELLER } from "@/lib/site";

const UPDATED = "Last updated 3 October 2026";

export const metadata: Metadata = {
  title: "Refunds | MargaLink",
  description: "When M coins come back on their own, and how to get your money back for coins you haven't used.",
};

export default function RefundsPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-6 pt-3 pb-20">
      <PageHeader width="2xl" title="Refunds" subtitle={
          <p className="mt-3 text-lg text-ink-soft">
            Coins come back on their own for anything that didn&apos;t run. Money comes back for coins you haven&apos;t used.{" "}
            <span className="text-base">{UPDATED}.</span>
          </p>
        } />

      <div className="mt-10 space-y-8 text-ink-soft [&_strong]:font-medium [&_strong]:text-ink">
        <LegalSection title="Who refunds">
          <p>{PADDLE_RESELLER} Refunds are issued by Paddle, to the way you paid.</p>
        </LegalSection>

        <LegalSection title="Coins back, automatically">
          <p>
            A review&apos;s price is shared among its parts: each section it sends, weighed by its length, and the final cross-check, counted like an
            average section. Any part that doesn&apos;t come back is refunded (rounded up to whole coins), whether or not the rest of the review
            finished, about two hours after the review started. An Ask Claude request that fails, or
            whose answer can&apos;t be used, is refunded at once, and so is a rewrite that fails or that our checks refuse. A rewrite that came back
            but wasn&apos;t put in because your text changed first isn&apos;t refunded, since it was delivered (you can copy it), and Try again is
            charged as a new rewrite. You don&apos;t need to ask; your coin history on{" "}
            <Link href="/account" className="text-accent hover:underline">
              your account page
            </Link>{" "}
            shows each refund. These come back as coins; money comes back only as below.
          </p>
        </LegalSection>

        <LegalSection title="Money back for a coin pack">
          <p>
            Within 14 days of buying a pack, you can have your money back for the coins from it you haven&apos;t used: all of it if you haven&apos;t
            spent any, or the share of the price that matches the unused coins otherwise. For example, if you used 10 of 50 coins, you get 80
            percent of the price back. The coins refunded are removed from your balance. Welcome coins aren&apos;t refundable.
          </p>
        </LegalSection>

        <LegalSection title="Pro">
          <p>
            Cancel Pro at any time from your account page; it stays active until the end of the period you paid for, and isn&apos;t charged again.
            Within 14 days of a Pro payment, you can have it refunded for the part of that period&apos;s coins you haven&apos;t used. This includes
            the legal right to withdraw within 14 days of your first payment that consumers have in the EU, the UK and some other countries.
          </p>
        </LegalSection>

        <LegalSection title="How to ask">
          <p>
            Use Receipts, refunds and billing on your{" "}
            <Link href="/account" className="text-accent hover:underline">
              account page
            </Link>{" "}
            (Paddle&apos;s customer portal, which also has its withdrawal button), the link in your Paddle receipt email, or your order at{" "}
            <a href="https://paddle.net" className="text-accent hover:underline">
              paddle.net
            </a>
            . Or write to <ContactEmail /> with your order number. The money goes back to how you paid, usually within 5 to 10 working days of the
            refund being approved.
          </p>
        </LegalSection>

        <LegalSection title="Before you delete your account">
          <p>
            Deleting your account ends its coins, and they can&apos;t be refunded afterwards. If you bought a pack in the last 14 days, ask for its
            refund first.
          </p>
        </LegalSection>

        <LegalSection title="A charge you don't recognise">
          <p>
            Please contact us or Paddle before you dispute a charge with your bank: we can usually sort it out faster. Paddle may refuse repeated
            refund requests that look like abuse, as its buyer terms allow.
          </p>
        </LegalSection>

        <LegalSection title="Your rights">
          <p>
            This policy adds to your rights under consumer law where you live, including your remedies if the service is faulty; it doesn&apos;t
            replace them.
          </p>
        </LegalSection>
      </div>
    </main>
  );
}
