"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { extractFromFile } from "@/lib/extract";
import { JOURNAL_RULES, findJournalRules } from "@/lib/journalRules";
import { checkRules, type RulesCheckResult } from "@/lib/rulesCheck";
import { requestReview, reviewsRemaining, type ReviewResult, type ReviewTier } from "@/lib/review";
import PaperDropzone from "@/components/PaperDropzone";
import ReviewConsent from "@/components/ReviewConsent";
import ReviewResultPanel from "@/components/ReviewResultPanel";
import RulesCheckPanel from "@/components/RulesCheckPanel";

type NetworkCall = { method: string; url: string; hadBody: boolean };

const TIER_OPTIONS: { value: ReviewTier; label: string; description: string }[] = [
  { value: "quick", label: "Quick", description: "The 2-3 most significant issues, fast." },
  { value: "standard", label: "Standard", description: "Balanced coverage of the main sections." },
  { value: "thorough", label: "Thorough", description: "Every subsection and table, maximum effort." },
];

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
  const [calls, setCalls] = useState<NetworkCall[]>([]);

  // Same transparency mechanism as /match, for the page's whole lifetime —
  // this page's entire purpose is one request that leaves the device, so
  // showing it here matters at least as much as it does there.
  useEffect(() => {
    const originalFetch = window.fetch;
    window.fetch = async (...args: Parameters<typeof fetch>) => {
      const [input, init] = args;
      const url = typeof input === "string" ? input : input.toString();
      setCalls((prev) => [...prev, { method: init?.method ?? "GET", url, hadBody: Boolean(init?.body) }]);
      return originalFetch(...args);
    };
    return () => {
      window.fetch = originalFetch;
    };
  }, []);

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
        setUploadError(err instanceof Error ? err.message : String(err));
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
      setReviewError(err instanceof Error ? err.message : "Review failed — try again in a moment.");
    } finally {
      setReviewLoading(false);
    }
  }, [paperText, selectedJournalId, tier]);

  const selectedRules = selectedJournalId ? findJournalRules(selectedJournalId) : undefined;

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-14 sm:py-20">
      <header className="mb-12">
        <div className="mb-8 flex items-baseline justify-between">
          <Link href="/" className="font-serif text-lg font-medium">
            MargaLink
          </Link>
          <nav className="flex gap-5 text-sm text-ink-soft">
            <Link href="/" className="hover:text-ink">
              ← Back
            </Link>
            <Link href="/privacy" className="hover:text-ink">
              How privacy works
            </Link>
          </nav>
        </div>
        <h1 className="font-serif text-4xl font-medium leading-tight sm:text-5xl">
          Get it reviewed.
        </h1>
        <p className="mt-3 max-w-md text-lg text-ink-soft">
          Attach a paper, choose a journal, and get a structural check plus an AI review —
          checked against that journal&apos;s actual guidelines.
        </p>
      </header>

      <section>
        <p className="mb-3 text-sm font-medium text-accent">1. Attach your paper</p>
        <PaperDropzone busy={busy} onFile={(file) => void onFile(file)} />
        {uploadError && (
          <p role="alert" className="mt-3 text-sm text-away">
            {uploadError}
          </p>
        )}
        {fileName && !uploadError && <p className="mt-3 text-sm text-ink-soft">Loaded {fileName}.</p>}
      </section>

      {paperText && (
        <section className="mt-12 border-t border-line pt-8">
          <p className="mb-3 text-sm font-medium text-accent">2. Choose a journal</p>
          <p className="mb-4 text-sm text-ink-soft">
            Only journals with hand-verified guidelines are listed here — see{" "}
            <Link href="/match" className="text-accent hover:underline">
              match your paper
            </Link>{" "}
            instead if you want ranked suggestions across the full index.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {JOURNAL_RULES.map((j) => (
              <button
                key={j.journalId}
                type="button"
                onClick={() => selectJournal(j.journalId)}
                aria-pressed={selectedJournalId === j.journalId}
                className={`rounded-sm border p-4 text-left transition-colors ${
                  selectedJournalId === j.journalId
                    ? "border-accent bg-accent-soft"
                    : "border-line bg-paper-alt hover:border-accent"
                }`}
              >
                <p className="font-serif font-medium">{j.journalName}</p>
                <p className="mt-1 text-xs text-ink-soft">{j.scopeSummary}</p>
              </button>
            ))}
          </div>
        </section>
      )}

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

          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            {TIER_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setTier(opt.value)}
                aria-pressed={tier === opt.value}
                className={`rounded-sm border p-3 text-left text-sm transition-colors ${
                  tier === opt.value
                    ? "border-accent bg-accent-soft"
                    : "border-line bg-paper-alt hover:border-accent"
                }`}
              >
                <p className="font-medium">{opt.label}</p>
                <p className="mt-0.5 text-xs text-ink-soft">{opt.description}</p>
              </button>
            ))}
          </div>

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
          {reviewError && (
            <p role="alert" className="mt-3 text-sm text-away">
              {reviewError}
            </p>
          )}
          {reviewResult && <ReviewResultPanel result={reviewResult} />}
        </section>
      )}

      {calls.length > 0 && (
        <section className="mt-12 rounded-sm border border-line bg-paper-alt p-4 text-sm">
          <p className="mb-2 font-medium">Network requests made during this run</p>
          <ul className="space-y-1 font-mono text-xs text-ink-soft">
            {calls.map((c, i) => (
              <li key={i}>
                {c.method} {c.url} — {c.hadBody ? "had a body" : "no body sent"}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-ink-soft">
            {calls.some((c) => c.hadBody)
              ? "A request with a body only happens after you confirm the review consent notice above."
              : "No request has carried a body yet."}
          </p>
        </section>
      )}

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
