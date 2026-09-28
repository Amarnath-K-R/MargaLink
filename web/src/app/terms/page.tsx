import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import { ContactEmail, OperatorDetails, operatorName } from "@/components/ContactDetails";
import { PRO, WELCOME_COINS } from "@/lib/coins";
import { PADDLE_RESELLER } from "@/lib/site";

export const metadata: Metadata = {
  title: "Terms | MargaLink",
  description: "The terms for using MargaLink, and how M coins work.",
};

// Plain terms for a small service. M coins are described as prepaid usage
// credits for MargaLink's own AI features: never a wallet, never money.
// When these change, change the date below; a change that matters to
// account holders is emailed to them before it takes effect.
const UPDATED = "Last updated 28 September 2026";

export default function TermsPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-6 pt-3 pb-20">
      <PageHeader
        width="2xl"
        title="Terms"
        subtitle={
          <p className="mt-3 text-lg text-ink-soft">
            What you can expect from MargaLink, what we ask of you, and how M coins work. <span className="text-base">{UPDATED}.</span>
          </p>
        }
      />

      <div className="mt-10 space-y-8 text-ink-soft [&_strong]:font-medium [&_strong]:text-ink">
        <Part title="Who we are">
          <p>
            MargaLink is run by {operatorName}, a sole proprietor in India, trading as MargaLink (&ldquo;we&rdquo;). These terms are an agreement
            between you and us.
          </p>
          <OperatorDetails />
        </Part>

        <Part title="The service">
          <p>
            MargaLink helps you find a journal for a paper, check it against a journal&apos;s rules, make figures and write it. Most of it runs in your
            browser, is free and needs no account; those tools are open to everyone. Two features send something to Anthropic&apos;s Claude and cost M
            coins: the AI pre-submission review and Ask Claude in the figure studio. The{" "}
            <Link href="/privacy" className="text-accent hover:underline">
              privacy notice
            </Link>{" "}
            says exactly what each one sends.
          </p>
        </Part>

        <Part title="Accepting these terms, and changes">
          <p>
            By using MargaLink you accept these terms; creating an account and buying coins each ask you to confirm it. We may change them. We&apos;ll
            post the new version here with its date and, for a change that matters to account holders, email you before it takes effect. If you
            don&apos;t accept a change, stop using MargaLink and delete your account; a coin pack bought in the last 14 days can be refunded under the
            refund policy.
          </p>
        </Part>

        <Part title="Your account">
          <p>
            Accounts are only for people aged 18 or older, and you confirm your age when you sign up. If we learn that an account belongs to someone
            under 18, we&apos;ll close it, delete its data and arrange a refund of any payment through Paddle. One account per person, signed in with
            Google or an emailed link. Keep access to that email address secure: it&apos;s how you sign in.
          </p>
        </Part>

        <Part title="M coins">
          <ul className="list-disc space-y-2 pl-5">
            <li>
              M coins are prepaid credits for use only on MargaLink&apos;s AI features. They have no cash value and earn no interest. You can&apos;t
              sell, transfer or exchange them, or use them anywhere else. They come back as money only as the{" "}
              <Link href="/refunds" className="text-accent hover:underline">
                refund policy
              </Link>{" "}
              or the law provides.
            </li>
            <li>A new account gets {WELCOME_COINS} M coins, once per person and email address.</li>
            <li>Coins from packs don&apos;t expire.</li>
            <li>
              Pro adds {PRO.coinsPerMonth} M coins each month. Up to {PRO.carryCap} unspent Pro coins carry over; the rest lapse when the next
              month&apos;s arrive. If Pro ends, the Pro coins you have left stay in your balance.
            </li>
            <li>We spend Pro coins first, then your other coins.</li>
            <li>
              The price of every use is shown before anything is sent. Any part of a review that doesn&apos;t come back (a section, or the final
              cross-check) is refunded in coins automatically, and a failed Ask Claude request at once.
            </li>
            <li>We may change what things cost or what coins cost; coins you already have keep working at the prices shown when you use them.</li>
          </ul>
        </Part>

        <Part title="When coins end">
          <p>
            If you delete your account, any unused coins end at that moment and can&apos;t be restored. If you bought a coin pack in the last 14
            days, you can ask for its refund before you delete your account. If we close an account for a serious breach of these terms, its coins
            end too.
          </p>
        </Part>

        <Part title="Paying">
          <p>
            {PADDLE_RESELLER} Paddle takes the payment and charges any tax, and its{" "}
            <a href="https://www.paddle.com/legal/buyer-terms" className="text-accent hover:underline">
              buyer terms
            </a>{" "}
            govern the purchase. The final price, with any tax, is shown before you pay.
          </p>
        </Part>

        <Part title="Pro">
          <p>
            Pro costs ${PRO.month.usd} a month or ${PRO.year.usd} a year (₹{PRO.month.inr.toLocaleString("en-IN")} or ₹
            {PRO.year.inr.toLocaleString("en-IN")} in India), or the price shown at checkout. It renews automatically at the end of each period until
            you cancel. You can cancel at any time with Cancel or manage Pro on your account page; Pro then runs to the end of the period you paid
            for and isn&apos;t charged again. We&apos;ll email you before a price change applies to your plan. Where the law requires it, Paddle
            emails you before a yearly plan renews.
          </p>
        </Part>

        <Part title="Refunds">
          <p>
            The{" "}
            <Link href="/refunds" className="text-accent hover:underline">
              refund policy
            </Link>{" "}
            says what comes back and when. It doesn&apos;t limit your rights under consumer law.
          </p>
        </Part>

        <Part title="Using MargaLink fairly">
          <p>Please don&apos;t:</p>
          <ul className="mt-2 list-disc space-y-1.5 pl-5">
            <li>send material that&apos;s unlawful, or that you have no right to share;</li>
            <li>send a manuscript or grant you received as a peer reviewer or editor;</li>
            <li>send identifiable data about study participants, patients or other people;</li>
            <li>try to get around charges or limits, overload the service, or call its API from anything but its own pages;</li>
            <li>
              use the AI features in a way that breaks Anthropic&apos;s{" "}
              <a href="https://www.anthropic.com/legal/aup" className="text-accent hover:underline">
                Usage Policy
              </a>
              , which applies to everything sent to Claude.
            </li>
          </ul>
          <p className="mt-2">
            Daily capacity is limited: if it&apos;s reached before a review or a request starts, nothing is charged; a review stopped midway by it is
            refunded for what didn&apos;t run.
          </p>
        </Part>

        <Part title="Your work">
          <p>
            Your papers, data and figures stay yours; we claim no rights in them. When you use an AI feature, you give us a limited permission to pass
            what you chose to send to Anthropic, only to give you that result. We don&apos;t keep it, sell it or use it to train models.
          </p>
          <p className="mt-2">
            If what you send includes other people&apos;s personal data, you confirm you&apos;re allowed to share it, for example with your
            co-authors&apos; agreement. Where you use MargaLink for an institution, we process that data only to deliver the feature you chose, on your
            instructions.
          </p>
        </Part>

        <Part title="What the AI gives you">
          <p>
            AI reviews and answers are generated by Claude, an AI model made by Anthropic. They can be wrong or incomplete. They are not peer review
            and don&apos;t predict what a journal will decide. Check every suggestion before you rely on it. Many journals ask authors to disclose AI
            assistance; you&apos;re responsible for doing so.
          </p>
        </Part>

        <Part title="Journal information">
          <p>
            Journal details and matches come from public sources and may be out of date or incomplete: check the journal&apos;s own site before you
            submit. Journal names belong to their owners, and MargaLink isn&apos;t affiliated with any journal or publisher.
          </p>
        </Part>

        <Part title="Open source">
          <p>
            MargaLink uses open source software, including TeX Live, Pyodide, ONNX Runtime and Transformers.js, each under its own licence. These
            terms don&apos;t change those licences.
          </p>
        </Part>

        <Part title="If the service changes or stops">
          <p>
            MargaLink is new and may change. If we close the service, we&apos;ll tell account holders first and refund the unused coins from packs
            through Paddle. We may suspend or close an account that breaks these terms; if we do, we&apos;ll say why, unless the law stops us.
          </p>
        </Part>

        <Part title="If something goes wrong">
          <p>
            MargaLink is provided as it is, and we can&apos;t promise it will always be available or free of errors. To the extent the law allows, our
            liability to you is limited to the greater of what you paid us in the twelve months before the problem and US$50. Nothing here limits
            liability that the law doesn&apos;t allow to be limited, such as for fraud, or death or personal injury caused by negligence, or your
            rights as a consumer. If you use MargaLink for a business or an institution, you&apos;re responsible for claims that arise from what you
            send through it in breach of these terms.
          </p>
        </Part>

        <Part title="Law and complaints">
          <p>
            These terms are governed by the laws of India, and the courts of India have jurisdiction. If you&apos;re a consumer, you also keep the
            protection of the mandatory laws of the country where you live, and you may bring a claim in its courts; consumers in India may also go to
            a consumer commission. For a complaint, write to our Grievance Officer at <ContactEmail />: we acknowledge it within 48 hours and aim to
            resolve it within one month. The{" "}
            <Link href="/contact" className="text-accent hover:underline">
              contact page
            </Link>{" "}
            has every way to reach us.
          </p>
          <p className="mt-2">
            These terms, with the privacy notice and the refund policy, are the whole agreement between us. If a part of them can&apos;t be
            enforced, the rest still applies. Not enforcing a term straight away doesn&apos;t mean we give it up. If they&apos;re translated, the
            English version applies.
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
