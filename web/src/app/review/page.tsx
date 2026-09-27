"use client";

import Link from "next/link";
import ErrorText from "@/components/ErrorText";
import { NetworkTracePanel, useNetworkTrace } from "@/components/NetworkTrace";
import PageHeader from "@/components/PageHeader";
import PaperDropzone from "@/components/PaperDropzone";
import RulesCheckPanel from "@/components/RulesCheckPanel";
import JournalPicker from "./_components/JournalPicker.tsx";
import ReviewRunner from "./_components/ReviewRunner.tsx";
import { useReview } from "./_components/useReview.ts";

// Attach → choose a known journal directly → see Claude's review. Unlike
// /match, there's no embedding/ranking here at all — the journal is an
// explicit choice, not a suggestion, so this flow never depends on a pilot
// journal happening to land in anyone's top-10 matches. The flow itself
// lives in useReview (shared with the writing workspace's Review window).
export default function ReviewPage() {
  const { calls } = useNetworkTrace();
  const r = useReview();

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
            Attach a paper, choose a journal, and get a structural check plus an AI review — checked against that journal&apos;s actual guidelines.
          </p>
        }
      />

      <section>
        <p className="mb-3 text-sm font-medium text-accent">1. Attach your paper</p>
        <PaperDropzone busy={r.busy} onFile={(file) => void r.onFile(file)} />
        {r.uploadError && <ErrorText>{r.uploadError}</ErrorText>}
        {r.fileName && !r.uploadError && <p className="mt-3 text-sm text-ink-soft">Loaded {r.fileName}.</p>}
      </section>

      {r.paperText && <JournalPicker selectedJournalId={r.selectedJournalId} onSelect={r.selectJournal} />}

      {r.selectedRules && r.rulesResult && (
        <section className="mt-12 border-t border-line pt-8">
          <h2 className="font-serif text-xl font-medium">Structural check</h2>
          <p className="mt-1 text-sm text-ink-soft">Free, instant, and stays on your device — word count, reference style, required statements.</p>
          <RulesCheckPanel result={r.rulesResult} />
        </section>
      )}

      {r.selectedRules && (
        <section className="mt-12 border-t border-line pt-8">
          <h2 className="font-serif text-xl font-medium">3. Get it reviewed</h2>
          <p className="mt-1 text-sm text-ink-soft">
            An LLM review from Claude — checking for inconsistencies, statistical reporting gaps, and journal fit. The one feature on MargaLink that
            sends your paper&apos;s text off this device (the figure studio&apos;s &ldquo;Ask Claude&rdquo; is the other opt-in exception, and it never
            sends a spreadsheet&apos;s values).
          </p>
          <ReviewRunner review={r} />
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
