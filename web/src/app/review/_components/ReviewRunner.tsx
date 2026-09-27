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

      <div className="mt-4 flex flex-wrap items-center gap-4">
        <button
          type="button"
          onClick={() => r.setConsentOpen(true)}
          disabled={r.reviewLoading || reviewsRemaining() <= 0}
          className="rounded-sm border border-line bg-paper-alt px-4 py-2 text-sm hover:border-accent disabled:cursor-not-allowed disabled:opacity-60"
        >
          {r.reviewLoading ? "Reviewing…" : reviewsRemaining() <= 0 ? "Pilot review limit reached on this device" : `Get a ${r.tier} review by Claude`}
        </button>
        {r.reviewLoading && (
          <button type="button" onClick={r.cancel} className="text-sm text-ink-soft hover:underline">
            Cancel
          </button>
        )}
        {r.canRetry && r.resumeState && (
          <button type="button" onClick={() => void r.startReview(r.resumeState ?? undefined)} className="text-sm text-accent hover:underline">
            {r.unfinished ? "Resume review" : "Retry failed sections"}
          </button>
        )}
      </div>
      {r.progress && (
        <p data-testid="review-progress" className="mt-2 text-sm text-ink-soft" aria-live="polite">
          {r.progress.phase === "extract" ? `Reviewing ${r.progress.current ?? "the last sections"} (${r.progress.done} of ${r.progress.total})…` : `${r.progress.current}…`}
        </p>
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
