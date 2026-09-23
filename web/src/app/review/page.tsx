"use client";

import Link from "next/link";
import { useCallback, useMemo, useRef, useState } from "react";
import { extractFromFile } from "@/lib/extract";
import { findJournalRules } from "@/lib/journalRules";
import { checkRules, type RulesCheckResult } from "@/lib/rulesCheck";
import { MAX_REVIEW_CHARS, prepareForReview, reviewsRemaining } from "@/lib/review";
import { ReviewSynthesisError, planChunks, runReview, type ReviewState } from "@/lib/reviewOrchestrator";
import { NO_EDITS, buildOutline, chunkSections, type OutlineEdits } from "@/lib/reviewSections";
import type { HeadingHint, ReviewProgress, ReviewResult, ReviewTier, SectionKind } from "@/lib/reviewTypes";
import { errorMessage } from "@/lib/errorMessage";
import ErrorText from "@/components/ErrorText";
import { NetworkTracePanel, useNetworkTrace } from "@/components/NetworkTrace";
import PageHeader from "@/components/PageHeader";
import PaperDropzone from "@/components/PaperDropzone";
import ReviewConsent from "@/components/ReviewConsent";
import ReviewResultPanel from "@/components/ReviewResultPanel";
import RulesCheckPanel from "@/components/RulesCheckPanel";
import JournalPicker from "./_components/JournalPicker.tsx";
import TierPicker from "./_components/TierPicker.tsx";
import OutlineEditor from "./_components/OutlineEditor.tsx";

const TOO_LONG =
  "This paper is over 400,000 characters of text — split off supplementary material and try again.";

// Attach → choose a known journal directly → see Claude's review. Unlike
// /match, there's no embedding/ranking here at all — the journal is an
// explicit choice, not a suggestion, so this flow never depends on a pilot
// journal happening to land in anyone's top-10 matches. The review itself
// runs as several short passes (see reviewOrchestrator.ts), so this page
// shows progress, partial results, and a retry for any section that failed.
export default function ReviewPage() {
  const [busy, setBusy] = useState(false);
  const [paperText, setPaperText] = useState<string | null>(null);
  const [reviewText, setReviewText] = useState<string | null>(null); // stripped + normalized — what gets sent
  const [headings, setHeadings] = useState<HeadingHint[]>([]); // the document's own heading structure
  const [edits, setEdits] = useState<OutlineEdits>(NO_EDITS); // the user's corrections to the detected outline
  const [fileName, setFileName] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [selectedJournalId, setSelectedJournalId] = useState<string | null>(null);
  const [rulesResult, setRulesResult] = useState<RulesCheckResult | null>(null);
  const [consentOpen, setConsentOpen] = useState(false);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [progress, setProgress] = useState<ReviewProgress | null>(null);
  const [reviewResult, setReviewResult] = useState<ReviewResult | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [tier, setTier] = useState<ReviewTier>("standard");
  const [resumeState, setResumeState] = useState<ReviewState | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const runStateRef = useRef<ReviewState | null>(null); // the in-flight run's state, so a cancel can resume
  const { calls } = useNetworkTrace();

  const resetReview = useCallback(() => {
    abortRef.current?.abort();
    setConsentOpen(false);
    setReviewResult(null);
    setReviewError(null);
    setProgress(null);
    setResumeState(null);
  }, []);

  const onFile = useCallback(
    async (file: File) => {
      if (busy) return;
      setBusy(true);
      resetReview();
      setUploadError(null);
      setPaperText(null);
      setReviewText(null);
      setHeadings([]);
      setEdits(NO_EDITS);
      setFileName(null);
      setSelectedJournalId(null);
      setRulesResult(null);
      try {
        const { fullText, headings: found } = await extractFromFile(file, { headings: true });
        if (fullText.trim().length < 50) {
          throw new Error(
            "Couldn't find readable text in this file. If it's a scanned PDF (no text layer), text extraction won't work on it — try a PDF exported directly from Word or LaTeX instead."
          );
        }
        const prepared = prepareForReview(fullText);
        if (prepared.length > MAX_REVIEW_CHARS) throw new Error(TOO_LONG);
        setPaperText(fullText);
        setReviewText(prepared);
        setHeadings(found ?? []);
        setFileName(file.name);
      } catch (err) {
        setUploadError(errorMessage(err));
      } finally {
        setBusy(false);
      }
    },
    [busy, resetReview]
  );

  const selectJournal = useCallback(
    (journalId: string) => {
      resetReview();
      setSelectedJournalId(journalId);
      if (paperText) {
        const rules = findJournalRules(journalId);
        if (rules) setRulesResult(checkRules(paperText, rules));
      }
    },
    [paperText, resetReview]
  );

  const selectTier = useCallback(
    (next: ReviewTier) => {
      resetReview();
      setTier(next);
    },
    [resetReview]
  );

  const outline = useMemo(() => (reviewText ? buildOutline(reviewText, headings, edits) : null), [reviewText, headings, edits]);
  const plannedRun = useMemo(
    () => (outline ? planChunks(chunkSections(outline.sections, headings), tier).run : []),
    [outline, headings, tier]
  );
  // How many requests the consent notice names: one per planned chunk + the cross-check.
  const passCount = plannedRun.length + 1;
  const outlineRows = useMemo(() => {
    if (!outline) return [];
    const reviewed = new Set(plannedRun.map((c) => c.sectionId));
    return [
      ...outline.sections.map((s) => ({ ...s, excluded: false, reviewedAtTier: reviewed.has(s.id) })),
      ...outline.excluded.map((s) => ({ ...s, excluded: true, reviewedAtTier: false })),
    ].sort((a, b) => a.charStart - b.charStart);
  }, [outline, plannedRun]);

  // Any outline change invalidates a result computed from the old outline.
  const editOutline = useCallback(
    (change: (e: OutlineEdits) => OutlineEdits) => {
      resetReview();
      setEdits((e) => change(e));
    },
    [resetReview]
  );

  const startReview = useCallback(
    async (resume?: ReviewState) => {
      setConsentOpen(false);
      if (!reviewText || !selectedJournalId) return;
      const ac = new AbortController();
      abortRef.current = ac;
      setReviewLoading(true);
      setReviewError(null);
      // A fresh run replaces the last result; a resume builds on it.
      if (!resume) {
        setReviewResult(null);
        setResumeState(null);
      }
      try {
        const run = await runReview(
          {
            text: reviewText,
            hints: headings,
            outline: outline ?? undefined,
            journalId: selectedJournalId,
            tier,
            signal: ac.signal,
            onState: (st) => (runStateRef.current = st),
            onProgress: (p) => {
              setProgress(p);
              setReviewResult(p.partial);
            },
          },
          resume
        );
        setResumeState(run.state);
        setReviewResult(run.result);
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          // Cancelled by the user (not by a re-upload/journal/tier change, which
          // replaced abortRef): keep what finished so "Retry" resumes from there.
          if (abortRef.current === ac) setResumeState(runStateRef.current);
          return;
        }
        if (err instanceof ReviewSynthesisError) {
          setResumeState(err.state);
          setReviewResult(err.partial);
        }
        // The Function returns descriptive text on failure — surface it, not a generic message.
        setReviewError(errorMessage(err, "Review failed — try again in a moment."));
      } finally {
        if (abortRef.current === ac) abortRef.current = null;
        setReviewLoading(false);
        setProgress(null);
      }
    },
    [reviewText, headings, outline, selectedJournalId, tier]
  );

  const selectedRules = selectedJournalId ? findJournalRules(selectedJournalId) : undefined;
  const coverage = reviewResult?.coverage;
  // Cancelled before any section finished → no partial result yet, but still resumable.
  const unfinished = reviewResult === null || (coverage?.pending.length ?? 0) > 0;
  const canRetry =
    !reviewLoading && resumeState !== null && (unfinished || (coverage?.failed.length ?? 0) > 0 || reviewResult?.journalFit === null);

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-14 sm:py-20">
      <PageHeader
        width="4xl"
        links={[
          { href: "/", label: "← Back" },
          { href: "/figures", label: "Make figures" },
          { href: "/privacy", label: "How privacy works" },
        ]}
        title="Get it reviewed."
        subtitle={
          <p className="mt-3 max-w-md text-lg text-ink-soft">
            Attach a paper, choose a journal, and get a structural check plus an AI review —
            checked against that journal&apos;s actual guidelines.
          </p>
        }
      />

      <section>
        <p className="mb-3 text-sm font-medium text-accent">1. Attach your paper</p>
        <PaperDropzone busy={busy} onFile={(file) => void onFile(file)} />
        {uploadError && <ErrorText>{uploadError}</ErrorText>}
        {fileName && !uploadError && <p className="mt-3 text-sm text-ink-soft">Loaded {fileName}.</p>}
      </section>

      {paperText && <JournalPicker selectedJournalId={selectedJournalId} onSelect={selectJournal} />}

      {selectedRules && rulesResult && (
        <section className="mt-12 border-t border-line pt-8">
          <h2 className="font-serif text-xl font-medium">Structural check</h2>
          <p className="mt-1 text-sm text-ink-soft">
            Free, instant, and stays on your device — word count, reference style, required
            statements.
          </p>
          <RulesCheckPanel result={rulesResult} />
        </section>
      )}

      {selectedRules && (
        <section className="mt-12 border-t border-line pt-8">
          <h2 className="font-serif text-xl font-medium">3. Get it reviewed</h2>
          <p className="mt-1 text-sm text-ink-soft">
            An LLM review from Claude — checking for inconsistencies, statistical reporting
            gaps, and journal fit. The one feature on MargaLink that sends your paper&apos;s
            text off this device (the figure generator is the other opt-in exception, and it
            only ever sends a spreadsheet&apos;s schema, never its values).
          </p>

          <TierPicker tier={tier} onSelect={selectTier} />

          {outline && (
            <OutlineEditor
              rows={outlineRows}
              unmatchedHeadings={outline.unmatchedHeadings}
              edited={edits !== NO_EDITS}
              onKind={(charStart, kind: SectionKind | "excluded") => editOutline((e) => ({ ...e, kinds: { ...e.kinds, [charStart]: kind } }))}
              onMerge={(charStart) => editOutline((e) => ({ ...e, merged: [...e.merged, charStart] }))}
              onAddHeading={(h) => editOutline((e) => ({ ...e, addedHeadings: [...e.addedHeadings, h] }))}
              onReset={() => editOutline(() => NO_EDITS)}
            />
          )}

          <div className="mt-4 flex flex-wrap items-center gap-4">
            <button
              type="button"
              onClick={() => setConsentOpen(true)}
              disabled={reviewLoading || reviewsRemaining() <= 0}
              className="rounded-sm border border-line bg-paper-alt px-4 py-2 text-sm hover:border-accent disabled:cursor-not-allowed disabled:opacity-60"
            >
              {reviewLoading
                ? "Reviewing…"
                : reviewsRemaining() <= 0
                  ? "Pilot review limit reached on this device"
                  : `Get a ${tier} review by Claude`}
            </button>
            {reviewLoading && (
              <button type="button" onClick={() => abortRef.current?.abort()} className="text-sm text-ink-soft hover:underline">
                Cancel
              </button>
            )}
            {canRetry && resumeState && (
              <button type="button" onClick={() => void startReview(resumeState)} className="text-sm text-accent hover:underline">
                {unfinished ? "Resume review" : "Retry failed sections"}
              </button>
            )}
          </div>
          {progress && (
            <p data-testid="review-progress" className="mt-2 text-sm text-ink-soft" aria-live="polite">
              {progress.phase === "extract"
                ? `Reviewing ${progress.current ?? "the last sections"} (${progress.done} of ${progress.total})…`
                : `${progress.current}…`}
            </p>
          )}
          {consentOpen && (
            <ReviewConsent
              journalName={selectedRules.journalName}
              tier={tier}
              passCount={passCount}
              excludedCount={outline?.excluded.length ?? 0}
              reviewsRemaining={reviewsRemaining()}
              onConfirm={() => void startReview()}
              onCancel={() => setConsentOpen(false)}
            />
          )}
          {reviewError && <ErrorText>{reviewError}</ErrorText>}
          {reviewResult && <ReviewResultPanel result={reviewResult} partial={reviewResult.journalFit === null} />}
        </section>
      )}

      <NetworkTracePanel calls={calls} className="mt-12 rounded-sm border border-line bg-paper-alt p-4 text-sm">
        {calls.some((c) => c.hadBody)
          ? "Requests with a body only happen after you confirm the consent notice above — one per section reviewed, then one for the cross-check."
          : "No request has carried a body yet."}
      </NetworkTracePanel>

      <footer className="mt-20 border-t border-line pt-6 text-sm text-ink-soft">
        <p>
          <Link href="/privacy" className="text-accent hover:underline">
            How privacy works
          </Link>{" "}
          — including the exception this page relies on.
        </p>
      </footer>
    </main>
  );
}
