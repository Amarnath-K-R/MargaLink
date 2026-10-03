import type { Metadata } from "next";
import Link from "next/link";
import { BarChart3, BookOpen, PenLine, ScanSearch } from "lucide-react";
import PageHeader from "@/components/layout/PageHeader";
import { Coin } from "@/components/account/AccountButton";
import { FIGURE_PRICE, REWRITE_MAX_WORDS, REWRITE_WORDS_PER_COIN, WELCOME_COINS, reviewPrice } from "@/lib/accounts/coins";
import { REVIEW_TIERS } from "@/lib/review/reviewTypes";
import { Packs, ProPlans } from "./_components/Packs";
import { PADDLE_RESELLER } from "@/lib/site";

export const metadata: Metadata = {
  title: "Pricing | MargaLink",
  description: "Most of MargaLink is free. The AI review, Ask Claude and Rewrite cost M coins: what they cost, and what coins cost.",
};

const FREE = [
  { Icon: ScanSearch, bead: "#cfe0e1", text: "Matching your paper to journals, on your device" },
  { Icon: BookOpen, bead: "#efe3cf", text: "Browsing journals, and the format and journal-rules checks" },
  { Icon: BarChart3, bead: "#f1d2c2", text: "Figures from your spreadsheet: templates, editing, statistics, exports" },
  { Icon: PenLine, bead: "#dde6e6", text: "Writing your paper in LaTeX or Word, with spelling and grammar checks" },
];
const LENGTHS = [50_000, 100_000, 150_000, 400_000];
const words = (chars: number) => `about ${(Math.round(chars / 6 / 1000) * 1000).toLocaleString("en")} words`;

export default function PricingPage() {
  return (
    <main className="mx-auto w-full max-w-4xl px-6 pt-3 pb-20">
      <PageHeader width="3xl" title="Pricing" subtitle={<p className="mt-3 text-lg text-ink-soft">Most of MargaLink is free. The three AI features cost M coins.</p>} />

      <section aria-labelledby="free" className="mt-10">
        <h2 id="free" className="font-serif text-2xl font-medium">Free, with no account</h2>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {FREE.map(({ Icon, bead, text }) => (
            <li key={text} className="clay-well flex items-center gap-3 rounded-2xl px-4 py-3 text-sm">
              <span aria-hidden className="bead h-8 w-8 shrink-0" style={{ background: bead }}>
                <Icon size={15} strokeWidth={2} />
              </span>
              {text}
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="costs" className="mt-14">
        <h2 id="costs" className="font-serif text-2xl font-medium">What costs M coins</h2>
        <p className="mt-2 max-w-2xl text-ink-soft">
          You see the price before anything is sent, and you get coins back automatically for any part of a run that doesn&apos;t come back. A new
          account starts with{" "}
          {WELCOME_COINS} M coins.
        </p>
        <div className="sheet mt-5 overflow-x-auto">
          <table className="w-full min-w-[34rem] text-sm">
            <caption className="px-5 pt-4 text-left text-xs font-medium text-accent">The AI pre-submission review, by depth and by the length of what&apos;s sent, in characters</caption>
            <thead>
              <tr className="border-b border-line/70 text-left text-xs text-ink-soft">
                <th scope="col" className="px-5 py-3 font-medium">Depth</th>
                {LENGTHS.map((n) => (
                  <th key={n} scope="col" className="px-3 py-3 text-right font-medium">
                    Up to {n.toLocaleString("en")}
                    <span className="block font-normal">{words(n)}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line/70">
              {REVIEW_TIERS.map((tier) => (
                <tr key={tier}>
                  <th scope="row" className="px-5 py-3 text-left font-medium capitalize">
                    {tier}
                  </th>
                  {LENGTHS.map((n) => (
                    <td key={n} className="px-3 py-3 text-right tabular-nums">
                      {reviewPrice(tier, n)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="border-t border-line/70 px-5 py-3 text-xs leading-relaxed text-ink-soft">
            Priced by what&apos;s actually sent: sections you mark &ldquo;Don&apos;t send&rdquo;, and the ones a depth skips, don&apos;t count; a section
            shorter than 2,000 characters counts as 2,000. Resuming or retrying a review costs nothing more. Each account can make up to 150 review
            passes, 50 Ask Claude requests and 100 rewrites a day.
          </p>
        </div>
        <p className="clay-well mt-4 flex items-center gap-3 rounded-2xl px-5 py-3 text-sm">
          <Coin />
          <span>
            <strong className="font-medium">Ask Claude</strong> in the figure studio: {FIGURE_PRICE} M coin a request, refunded if it fails.
          </span>
        </p>
        <p className="clay-well mt-3 flex items-center gap-3 rounded-2xl px-5 py-3 text-sm">
          <Coin />
          <span>
            <strong className="font-medium">Rewrite</strong> in the writing workspace: 1 M coin per {REWRITE_WORDS_PER_COIN} words you select, rounded
            up, up to {REWRITE_MAX_WORDS.toLocaleString("en")} at a time, refunded if it fails. Try again costs the same again.
          </span>
        </p>
      </section>

      <section aria-labelledby="packs" className="mt-14">
        <h2 id="packs" className="font-serif text-2xl font-medium">M coin packs</h2>
        <p className="mt-2 max-w-2xl text-ink-soft">Pack coins never expire. Prices include tax where it applies; checkout shows the final amount in your currency.</p>
        <Packs />
      </section>

      <section aria-labelledby="pro" className="mt-14">
        <h2 id="pro" className="font-serif text-2xl font-medium">Pro</h2>
        <p className="mt-2 max-w-2xl text-ink-soft">For reviewing often: a monthly allowance of M coins, billed monthly or yearly.</p>
        <ProPlans />
      </section>

      <p className="mt-12 max-w-2xl text-sm leading-relaxed text-ink-soft">
        {PADDLE_RESELLER} MargaLink never sees your card.{" "}
        <a href="https://www.paddle.com/legal/buyer-terms" className="text-accent hover:underline">
          Paddle&apos;s buyer terms
        </a>
      </p>
      <p className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm">
        <Link href="/refunds" className="text-accent hover:underline">
          Refunds
        </Link>
        <Link href="/terms" className="text-accent hover:underline">
          Terms
        </Link>
        <Link href="/privacy#accounts" className="text-accent hover:underline">
          What an account stores
        </Link>
        <Link href="/contact" className="text-accent hover:underline">
          Contact and support
        </Link>
      </p>
    </main>
  );
}
