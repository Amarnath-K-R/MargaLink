"use client";

import type { ReviewTier } from "@/lib/reviewTypes";
import { Coin } from "./AccountButton";

// The one place in the app where a plain-language notice and an explicit
// confirm action are non-negotiable (CLAUDE.md rule 3: "any feature that
// sends text out of the browser is opt-in, with a plain language notice
// first"). No default-on path — onConfirm only fires from a real click.
export default function ReviewConsent({
  journalName,
  tier,
  passCount,
  excludedCount,
  price,
  balance,
  onConfirm,
  onCancel,
}: {
  journalName: string;
  tier: ReviewTier;
  passCount: number;
  excludedCount: number;
  price: number;
  balance: number;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="sheet mt-5 border-l-4 border-away p-5 sm:p-6" role="alertdialog" aria-label="Review consent">
      <p className="mb-2 flex items-center gap-2 text-xs font-medium text-away">
        <span aria-hidden className="h-2 w-2 rounded-full bg-away shadow-[0_0_0_4px_rgba(161,90,63,.12)]" />
        Sends text off this device
      </p>
      <p className="font-serif text-lg font-medium">Send this paper&apos;s text to Claude for a {tier} review?</p>
      <p className="mt-2 text-sm leading-relaxed text-ink-soft">
        Unlike matching and the structural checks, this sends your paper&apos;s text to
        Anthropic&apos;s Claude API in {passCount} short requests (one per section, then one
        cross-check over the numbers found) to review it against {journalName}&apos;s
        guidelines, at {tier} depth. Author names and email addresses are stripped first, on a
        best-effort basis; the paper&apos;s content itself is not. Anthropic doesn&apos;t use
        API data to train models and retains it only under its API data policy; MargaLink
        doesn&apos;t store it. This is the one feature in MargaLink that sends
        your paper&apos;s text off your device.
        {excludedCount > 0 &&
          ` The ${excludedCount} section${excludedCount === 1 ? "" : "s"} you marked "Don't send" won't be sent at all.`}
      </p>
      <p className="mt-3 flex items-start gap-2 text-sm leading-relaxed" data-testid="review-price">
        <Coin className="mt-0.5" />
        <span>
          This review costs <strong className="font-medium">{price} M coins</strong>; you have {balance}. If part of it doesn&apos;t come back (a
          section, or the final cross-check), you get that part&apos;s coins back automatically, about two hours after it starts. Resuming or retrying
          costs nothing more.
        </span>
      </p>
      {balance < price && (
        <p className="mt-2 text-sm text-away">
          You need {price - balance} more M coin{price - balance === 1 ? "" : "s"} for this review.{" "}
          <a href="/pricing#packs" target="_blank" rel="noopener" className="text-accent underline-offset-2 hover:underline">
            Buy coins
          </a>{" "}
          <span className="text-ink-soft">(opens in a new tab; your paper stays here)</span>
        </p>
      )}
      <div className="mt-5 flex flex-wrap gap-3 text-sm">
        <button type="button" onClick={onConfirm} disabled={balance < price} className="clay-btn clay-primary h-10 px-5 font-medium">
          Send it and review ({price} M coins)
        </button>
        <button type="button" onClick={onCancel} className="clay-btn h-10 px-5">
          Cancel
        </button>
      </div>
    </div>
  );
}
