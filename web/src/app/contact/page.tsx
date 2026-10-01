import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import PageHeader from "@/components/layout/PageHeader";
import { ContactEmail, OperatorDetails } from "@/components/layout/ContactDetails";
import { PADDLE_RESELLER } from "@/lib/site";

export const metadata: Metadata = {
  title: "Contact and support | MargaLink",
  description: "How to reach MargaLink about your account, a payment, your data or a complaint.",
};

// Support and grievance details in one place (Paddle's seller policy, India's
// e-commerce and data protection rules). The values come from site.ts.
export default function ContactPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-6 pt-3 pb-20">
      <PageHeader width="2xl" title="Contact and support" subtitle={<p className="mt-3 text-lg text-ink-soft">Questions, a problem with a payment, a request about your data, or a complaint.</p>} />

      <div className="mt-10 space-y-8 text-ink-soft [&_strong]:font-medium [&_strong]:text-ink">
        <Part title="Reach us">
          <OperatorDetails />
        </Part>

        <Part title="Payments, receipts and refunds">
          <p>
            {PADDLE_RESELLER} For a receipt, a refund or a charge you don&apos;t recognise, use the link in your Paddle receipt email, look up your order at{" "}
            <a href="https://paddle.net" className="text-accent hover:underline">
              paddle.net
            </a>
            , or use Receipts, refunds and billing on your{" "}
            <Link href="/account" className="text-accent hover:underline">
              account page
            </Link>
            . You can also write to <ContactEmail /> and we&apos;ll help. The{" "}
            <Link href="/refunds" className="text-accent hover:underline">
              refund policy
            </Link>{" "}
            says what comes back and when.
          </p>
        </Part>

        <Part title="Your data">
          <p>
            Download or delete everything we hold on your account page. For anything else, such as correcting your email address or asking which
            providers received your data, write to <ContactEmail />; we answer within 30 days. The{" "}
            <Link href="/privacy" className="text-accent hover:underline">
              privacy notice
            </Link>{" "}
            explains your rights.
          </p>
        </Part>

        <Part title="If you're not satisfied">
          <p>
            You can complain to the Data Protection Board of India, to the data protection authority where you live in the EU, or to the UK&apos;s
            Information Commissioner&apos;s Office. Consumers in India can also go to a consumer commission.
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
