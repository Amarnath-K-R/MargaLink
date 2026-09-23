"use client";

import { FREE_REVIEWS_PER_DEVICE } from "@/lib/review";
import type { ReviewTier } from "@/lib/reviewTypes";

// The one place in the app where a plain-language notice and an explicit
// confirm action are non-negotiable (CLAUDE.md rule 3: "any feature that
// sends text out of the browser is opt-in, with a plain language notice
// first"). No default-on path — onConfirm only fires from a real click.
export default function ReviewConsent({
  journalName,
  tier,
  passCount,
  reviewsRemaining,
  onConfirm,
  onCancel,
}: {
  journalName: string;
  tier: ReviewTier;
  passCount: number;
  reviewsRemaining: number;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="mt-3 rounded-sm border border-line bg-paper-alt p-4" role="alertdialog" aria-label="Review consent">
      <p className="text-sm font-medium">Send this paper&apos;s text to Claude for a {tier} review?</p>
      <p className="mt-2 text-sm text-ink-soft">
        Unlike matching and the checks above, this sends your paper&apos;s text to
        Anthropic&apos;s Claude API in {passCount} short requests — one per section, then one
        cross-check over the numbers found — to review it against {journalName}&apos;s
        guidelines, at {tier} depth. Author names and email addresses are stripped first, on a
        best-effort basis — the paper&apos;s content itself is not. Anthropic&apos;s API
        doesn&apos;t use this to train models and may hold a section for a few minutes to serve
        a retry; MargaLink doesn&apos;t store it. This is the one feature in MargaLink that sends
        your paper&apos;s text off your device.
      </p>
      <p className="mt-2 text-xs text-ink-soft">
        {reviewsRemaining} of {FREE_REVIEWS_PER_DEVICE} free pilot review
        {reviewsRemaining === 1 ? "" : "s"} left on this device. Retrying a section that
        failed doesn&apos;t use another one.
      </p>
      <div className="mt-3 flex gap-4 text-sm">
        <button type="button" onClick={onConfirm} className="text-accent hover:underline">
          Send it and review
        </button>
        <button type="button" onClick={onCancel} className="text-ink-soft hover:underline">
          Cancel
        </button>
      </div>
    </div>
  );
}
