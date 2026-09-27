"use client";

import { reviewsRemaining } from "@/lib/review";
import { NO_EDITS } from "@/lib/reviewSections";
import type { Citation, SectionKind } from "@/lib/reviewTypes";
import ErrorText from "@/components/ErrorText";
import ReviewConsent from "@/components/ReviewConsent";
import ReviewResultPanel from "@/components/ReviewResultPanel";
import TierPicker from "./TierPicker.tsx";
import OutlineEditor from "./OutlineEditor.tsx";
import type { ReviewApi } from "./useReview.ts";

// Everything after a journal is chosen: the depth, the outline, the run
// (with its consent notice, progress, cancel and resume) and the result.
// Rendered by the /review page and by the workspace's Review window.
// Requires `review.selectedRules` — the caller shows it only then.
export default function ReviewRunner({ review: r, onCitation }: { review: ReviewApi; onCitation?: (c: Citation) => void }) {
  if (!r.selectedRules) return null;
  return (
    <>
      <TierPicker tier={r.tier} onSelect={r.selectTier} />

      {r.outline && (
        <OutlineEditor
          rows={r.outlineRows}
          unmatchedHeadings={r.outline.unmatchedHeadings}
          edited={r.edits !== NO_EDITS}
          onKind={(charStart, kind: SectionKind | "excluded") => r.editOutline((e) => ({ ...e, kinds: { ...e.kinds, [charStart]: kind } }))}
          onMerge={(charStart) => r.editOutline((e) => ({ ...e, merged: [...e.merged, charStart] }))}
          onAddHeading={(h) => r.editOutline((e) => ({ ...e, addedHeadings: [...e.addedHeadings, h] }))}
          onReset={() => r.editOutline(() => NO_EDITS)}
        />
      )}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => r.setConsentOpen(true)}
          disabled={r.reviewLoading || reviewsRemaining() <= 0}
          className="clay-btn clay-primary h-11 px-6 text-sm font-medium"
        >
          {r.reviewLoading ? "Reviewing…" : reviewsRemaining() <= 0 ? "Pilot review limit reached on this device" : `Get a ${r.tier} review by Claude`}
        </button>
        {r.reviewLoading && (
          <button type="button" onClick={r.cancel} className="clay-btn h-11 px-5 text-sm">
            Cancel
          </button>
        )}
        {r.canRetry && r.resumeState && (
          <button type="button" onClick={() => void r.startReview(r.resumeState ?? undefined)} className="clay-btn h-11 px-5 text-sm text-accent">
            {r.unfinished ? "Resume review" : "Retry failed sections"}
          </button>
        )}
      </div>
      {r.progress && (
        <div data-testid="review-progress" className="mt-4 max-w-xl" aria-live="polite">
          <p className="flex items-center gap-2 text-sm text-ink-soft">
            <span aria-hidden className="pulse-dot h-1.5 w-1.5 rounded-full bg-accent" />
            {r.progress.phase === "extract" ? `Reviewing ${r.progress.current ?? "the last sections"} (${r.progress.done} of ${r.progress.total})…` : `${r.progress.current}…`}
          </p>
          {r.progress.phase === "extract" && r.progress.total > 0 && (
            <span aria-hidden className="mt-2 block h-2 rounded-full bg-[#dcd8ce] shadow-[inset_0_1px_2px_rgba(58,44,28,.15)]">
              <span
                className="block h-2 rounded-full bg-gradient-to-r from-[#5d8f9b] to-accent transition-[width] duration-500"
                style={{ width: `${Math.max(4, Math.round((r.progress.done / r.progress.total) * 100))}%` }}
              />
            </span>
          )}
        </div>
      )}
      {r.consentOpen && (
        <ReviewConsent
          journalName={r.selectedRules.journalName}
          tier={r.tier}
          passCount={r.passCount}
          excludedCount={r.outline?.excluded.length ?? 0}
          reviewsRemaining={reviewsRemaining()}
          onConfirm={() => void r.startReview()}
          onCancel={() => r.setConsentOpen(false)}
        />
      )}
      {r.reviewError && <ErrorText>{r.reviewError}</ErrorText>}
      {r.reviewResult && <ReviewResultPanel result={r.reviewResult} partial={r.reviewResult.journalFit === null} onCitation={onCitation} />}
    </>
  );
}
