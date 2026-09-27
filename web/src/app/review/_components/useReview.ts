"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { extractFromFile } from "@/lib/extract";
import { findJournalRules } from "@/lib/journalRules";
import { checkRules, type RulesCheckResult } from "@/lib/rulesCheck";
import { MAX_REVIEW_CHARS, prepareForReview } from "@/lib/review";
import { ReviewSynthesisError, planChunks, runReview, type ReviewState } from "@/lib/reviewOrchestrator";
import { NO_EDITS, buildOutline, chunkSections, type OutlineEdits } from "@/lib/reviewSections";
import type { HeadingHint, ReviewProgress, ReviewResult, ReviewTier } from "@/lib/reviewTypes";
import { errorMessage } from "@/lib/errorMessage";

const TOO_LONG = "This paper is over 400,000 characters of text — split off supplementary material and try again.";

// The review flow — attach, choose a journal, edit the outline, run the
// passes with cancel and resume — as one hook, shared by the /review page
// and the writing workspace's Review window. The review itself runs as
// several short passes (see reviewOrchestrator.ts), so this tracks progress,
// partial results, and what a retry can resume from.
export function useReview() {
  const [busy, setBusy] = useState(false);
  const [source, setSource] = useState<File | null>(null);
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

  const resetReview = useCallback(() => {
    // Detach before aborting: the aborted run's catch checks abortRef to tell
    // a user Cancel (resumable) from a reset (not). Resuming after a reset
    // would replay the old outline — including a section just marked "Don't send".
    const running = abortRef.current;
    abortRef.current = null;
    running?.abort();
    setConsentOpen(false);
    setReviewResult(null);
    setReviewError(null);
    setProgress(null);
    setResumeState(null);
  }, []);

  // `journalId` keeps (or sets) the journal instead of clearing it — the
  // workspace loads its compiled paper against the project's target journal.
  const onFile = useCallback(
    async (file: File, opts: { journalId?: string | null } = {}) => {
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
      setSource(file);
      try {
        const { fullText, headings: found } = await extractFromFile(file, { headings: true });
        if (fullText.trim().length < 50) {
          throw new Error(
            "Couldn't find readable text in this file. If it's a scanned PDF (no text layer), text extraction won't work on it — try a PDF exported directly from Word or LaTeX instead.",
          );
        }
        const prepared = prepareForReview(fullText);
        if (prepared.length > MAX_REVIEW_CHARS) throw new Error(TOO_LONG);
        setPaperText(fullText);
        setReviewText(prepared);
        setHeadings(found ?? []);
        setFileName(file.name);
        const rules = opts.journalId ? findJournalRules(opts.journalId) : undefined;
        if (rules) {
          setSelectedJournalId(opts.journalId!);
          setRulesResult(checkRules(fullText, rules));
        }
      } catch (err) {
        setUploadError(errorMessage(err));
      } finally {
        setBusy(false);
      }
    },
    [busy, resetReview],
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
    [paperText, resetReview],
  );

  const selectTier = useCallback(
    (next: ReviewTier) => {
      resetReview();
      setTier(next);
    },
    [resetReview],
  );

  const outline = useMemo(() => (reviewText ? buildOutline(reviewText, headings, edits) : null), [reviewText, headings, edits]);
  const plannedRun = useMemo(() => (outline ? planChunks(chunkSections(outline.sections, headings), tier).run : []), [outline, headings, tier]);
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
    [resetReview],
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
          resume,
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
    [reviewText, headings, outline, selectedJournalId, tier],
  );

  const cancel = useCallback(() => abortRef.current?.abort(), []);

  const selectedRules = selectedJournalId ? findJournalRules(selectedJournalId) : undefined;
  const coverage = reviewResult?.coverage;
  // Cancelled before any section finished → no partial result yet, but still resumable.
  const unfinished = reviewResult === null || (coverage?.pending.length ?? 0) > 0;
  const canRetry = !reviewLoading && resumeState !== null && (unfinished || (coverage?.failed.length ?? 0) > 0 || reviewResult?.journalFit === null);

  return {
    busy,
    source,
    fileName,
    uploadError,
    paperText,
    reviewText,
    headings,
    selectedJournalId,
    selectedRules,
    selectJournal,
    rulesResult,
    tier,
    selectTier,
    outline,
    outlineRows,
    edits,
    editOutline,
    passCount,
    consentOpen,
    setConsentOpen,
    reviewLoading,
    progress,
    reviewResult,
    reviewError,
    resumeState,
    canRetry,
    unfinished,
    onFile,
    startReview,
    cancel,
  };
}

export type ReviewApi = ReturnType<typeof useReview>;
