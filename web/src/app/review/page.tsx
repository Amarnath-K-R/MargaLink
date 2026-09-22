"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { extractFromFile } from "@/lib/extract";
import { findJournalRules } from "@/lib/journalRules";
import { checkRules, type RulesCheckResult } from "@/lib/rulesCheck";
import { requestReview, reviewsRemaining } from "@/lib/review";
import type { ReviewResult, ReviewTier } from "@/lib/reviewTypes";
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

// Attach → choose a known journal directly → see Claude's review. Unlike
// /match, there's no embedding/ranking here at all — the journal is an
// explicit choice, not a suggestion, so this flow never depends on a pilot
// journal happening to land in anyone's top-10 matches.
export default function ReviewPage() {
  const [busy, setBusy] = useState(false);
  const [paperText, setPaperText] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [selectedJournalId, setSelectedJournalId] = useState<string | null>(null);
  const [rulesResult, setRulesResult] = useState<RulesCheckResult | null>(null);
  const [consentOpen, setConsentOpen] = useState(false);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewResult, setReviewResult] = useState<ReviewResult | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [tier, setTier] = useState<ReviewTier>("standard");
  const { calls } = useNetworkTrace();

  const onFile = useCallback(
    async (file: File) => {
      if (busy) return;
      setBusy(true);
      setUploadError(null);
      setPaperText(null);
      setFileName(null);
      setSelectedJournalId(null);
      setRulesResult(null);
      setConsentOpen(false);
      setReviewResult(null);
      setReviewError(null);
      try {
        const { fullText } = await extractFromFile(file);
        if (fullText.trim().length < 50) {
          throw new Error(
            "Couldn't find readable text in this file. If it's a scanned PDF (no text layer), text extraction won't work on it — try a PDF exported directly from Word or LaTeX instead."
          );
        }
        setPaperText(fullText);
        setFileName(file.name);
      } catch (err) {
        setUploadError(errorMessage(err));
      } finally {
        setBusy(false);
      }
    },
    [busy]
  );

  const selectJournal = useCallback(
    (journalId: string) => {
      setSelectedJournalId(journalId);
      setConsentOpen(false);
      setReviewResult(null);
      setReviewError(null);
      if (paperText) {
        const rules = findJournalRules(journalId);
        if (rules) setRulesResult(checkRules(paperText, rules));
      }
    },
    [paperText]
  );

  const confirmReview = useCallback(async () => {
    setConsentOpen(false);
    if (!paperText || !selectedJournalId) return;
    setReviewLoading(true);
    setReviewError(null);
    try {
      const result = await requestReview(paperText, selectedJournalId, tier);
      setReviewResult(result);
    } catch (err) {
      // Surface the real error (the Function returns descriptive text on
      // failure, e.g. an Anthropic error or a stop_reason) rather than a
      // generic message — this is the one flow with a real external
      // dependency that can fail in ways worth actually seeing.
      setReviewError(errorMessage(err, "Review failed — try again in a moment."));
    } finally {
      setReviewLoading(false);
    }
  }, [paperText, selectedJournalId, tier]);

  const selectedRules = selectedJournalId ? findJournalRules(selectedJournalId) : undefined;

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-14 sm:py-20">
      <PageHeader
        width="4xl"
        links={[
          { href: "/", label: "← Back" },
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
            text off this device.
          </p>

          <TierPicker tier={tier} onSelect={setTier} />

          <button
            type="button"
            onClick={() => setConsentOpen(true)}
            disabled={reviewLoading || reviewsRemaining() <= 0}
            className="mt-4 rounded-sm border border-line bg-paper-alt px-4 py-2 text-sm hover:border-accent disabled:cursor-not-allowed disabled:opacity-60"
          >
            {reviewLoading
              ? "Reviewing…"
              : reviewsRemaining() <= 0
                ? "Pilot review limit reached on this device"
                : `Get a ${tier} review by Claude`}
          </button>
          {consentOpen && (
            <ReviewConsent
              journalName={selectedRules.journalName}
              tier={tier}
              reviewsRemaining={reviewsRemaining()}
              onConfirm={() => void confirmReview()}
              onCancel={() => setConsentOpen(false)}
            />
          )}
          {reviewError && <ErrorText>{reviewError}</ErrorText>}
          {reviewResult && <ReviewResultPanel result={reviewResult} />}
        </section>
      )}

      <NetworkTracePanel calls={calls} className="mt-12 rounded-sm border border-line bg-paper-alt p-4 text-sm">
        {calls.some((c) => c.hadBody)
          ? "A request with a body only happens after you confirm the review consent notice above."
          : "No request has carried a body yet."}
      </NetworkTracePanel>

      <footer className="mt-20 border-t border-line pt-6 text-sm text-ink-soft">
        <p>
          <Link href="/privacy" className="text-accent hover:underline">
            How privacy works
          </Link>{" "}
          — including the one exception this page relies on.
        </p>
      </footer>
    </main>
  );
}
