import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import { CONTACT_EMAIL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Refunds | MargaLink",
  description: "When M coins come back on their own, and how to get your money back for coins you haven't used.",
};

export default function RefundsPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-6 pt-3 pb-20">
      <PageHeader width="2xl" title="Refunds" subtitle={<p className="mt-3 text-lg text-ink-soft">Coins come back on their own for anything that didn&apos;t run. Money comes back for coins you haven&apos;t used.</p>} />

      <div className="mt-10 space-y-8 text-ink-soft [&_strong]:font-medium [&_strong]:text-ink">
        <Part title="Coins back, automatically">
          <p>
            A review&apos;s price is shared among its parts: each section it sends, weighed by its length, and the final cross-check, counted like an
            average section. Any part that doesn&apos;t come back is refunded (rounded up to whole coins), whether or not the rest of the review
            finished, about two hours after the review started. An Ask Claude request that fails, or
            whose answer can&apos;t be used, is refunded at once. You don&apos;t need to ask; your coin history on{" "}
            <Link href="/account" className="text-accent hover:underline">
              your account page
            </Link>{" "}
            shows each refund.
          </p>
        </Part>

        <Part title="Money back for a coin pack">
          <p>
            Within 14 days of buying a pack, you can have your money back for the coins from it you haven&apos;t used: all of it if you haven&apos;t
            spent any, or the unused share otherwise. The coins refunded are removed from your balance.
          </p>
        </Part>

        <Part title="Pro">
          <p>
            Cancel Pro at any time from your account page; it stays active until the end of the period you paid for, and isn&apos;t charged again.
            Within 14 days of a Pro payment, you can have it refunded for the part of that period&apos;s coins you haven&apos;t used.
          </p>
        </Part>

        <Part title="How to ask">
          <p>
            Paddle, which sells M coins for us, handles refunds: use the link in your Paddle receipt email, or find your order at paddle.net
            {CONTACT_EMAIL ? (
              <>
                , or write to{" "}
                <a href={`mailto:${CONTACT_EMAIL}`} className="text-accent hover:underline">
                  {CONTACT_EMAIL}
                </a>
              </>
            ) : null}
            . The money goes back to how you paid, usually within 5 to 10 working days.
          </p>
        </Part>

        <Part title="Your rights">
          <p>This policy adds to your rights under consumer law where you live; it doesn&apos;t replace them.</p>
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
