"use client";

import Link from "next/link";
import ErrorText from "@/components/ui/ErrorText";
import PageHeader from "@/components/layout/PageHeader";
import PaperDropzone from "@/components/ui/PaperDropzone";
import Step from "@/components/ui/Step";
import { Check } from "lucide-react";
import RulesCheckPanel from "@/components/checks/RulesCheckPanel";
import JournalPicker from "./_components/JournalPicker.tsx";
import ReviewRunner from "./_components/ReviewRunner.tsx";
import { useReview } from "./_components/useReview.ts";

// Attach → choose a known journal directly → see Claude's review. Unlike
// /match, there's no embedding/ranking here at all — the journal is an
// explicit choice, not a suggestion, so this flow never depends on a pilot
// journal happening to land in anyone's top-10 matches. The flow itself
// lives in useReview (shared with the writing workspace's Review window).
const TINT = "#ecdcc0"; // the Review bead

export default function ReviewPage() {
  const r = useReview();

  return (
    <main className="mx-auto w-full max-w-4xl px-6 pt-3 pb-20">
      <PageHeader
        width="4xl" tool="review"
        title="Get it reviewed."
        subtitle={
          <p className="mt-3 max-w-md text-lg text-ink-soft">
            Attach a paper, choose a journal, and get a structural check plus an AI review, checked against that journal&apos;s actual guidelines.
          </p>
        }
      />

      <div className="space-y-6">
        <Step n={1} tint={TINT} title="Attach your paper" hint="Read in this tab. Nothing is sent until you ask for the AI review in step 3.">
          <PaperDropzone busy={r.busy} onFile={(file) => void r.onFile(file)} />
          {r.uploadError && <ErrorText>{r.uploadError}</ErrorText>}
          {r.fileName && !r.uploadError && (
            <p className="mt-4 flex items-center gap-2 text-sm">
              <span aria-hidden className="grid h-5 w-5 place-items-center rounded-full bg-accent text-white">
                <Check size={12} strokeWidth={3} />
              </span>
              Loaded {r.fileName}.
            </p>
          )}
        </Step>

        {r.paperText && (
          <Step n={2} tint={TINT} title="Choose a journal">
            <fieldset disabled={r.reviewLoading} className="m-0 min-w-0 border-0 p-0">
              <JournalPicker selectedJournalId={r.selectedJournalId} onSelect={r.selectJournal} />
            </fieldset>
            {r.selectedRules && r.rulesResult && (
              <div className="mt-8">
                <h3 className="font-serif text-lg font-medium">Structural check</h3>
                <p className="mt-1 text-sm text-ink-soft">Free, instant, and stays on your device: word count, reference style, required statements.</p>
                <RulesCheckPanel result={r.rulesResult} />
              </div>
            )}
          </Step>
        )}

        {r.selectedRules && (
          <Step
            n={3}
            tint={TINT}
            title="Get it reviewed"
            hint={
              <>
                An LLM review from Claude that checks for inconsistencies, statistical reporting gaps, and journal fit. The one feature on MargaLink that
                sends your whole paper&apos;s text off this device (the other opt-in exceptions send only what you choose: Rewrite, a passage you
                select; the figure studio&apos;s &ldquo;Ask Claude&rdquo;, a description of your data, never its values).
              </>
            }
          >
            <ReviewRunner review={r} />
          </Step>
        )}
      </div>

      <footer className="mt-16 border-t border-line/80 pt-6 text-sm text-ink-soft">
        <p>
          <Link href="/privacy" className="text-accent hover:underline">
            How privacy works
          </Link>{" "}
          , including the exception this page relies on.
        </p>
      </footer>
    </main>
  );
}
