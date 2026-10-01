"use client";

import { useEffect, useState } from "react";
import { shortId } from "@/lib/journals/journalUrl";
import type { Citation } from "@/lib/review/reviewTypes";
import { findQuoteInTex } from "@/lib/write/texSource";
import ErrorText from "@/components/ui/ErrorText";
import RulesCheckPanel from "@/components/checks/RulesCheckPanel";
import JournalPicker from "@/app/review/_components/JournalPicker";
import ReviewRunner from "@/app/review/_components/ReviewRunner";
import type { ReviewApi } from "@/app/review/_components/useReview";
import CompileFirst from "./CompileFirst.tsx";

// The Review window: the compiled PDF, against the project's target journal
// when it is one of the pilot journals (else the picker), through the same
// consent notice, run and result as /review. Each cited passage can jump
// to its line in the LaTeX (best effort — a quote is what the PDF showed).
export default function ReviewWindow({
  review: r,
  pdfFile,
  compiling,
  onCompile,
  pilotId,
  targetName,
  texFiles,
  onGoto,
}: {
  review: ReviewApi;
  pdfFile: File | null;
  compiling: boolean;
  onCompile: () => void;
  pilotId: string | null; // the project's target journal, when it has hand-verified rules
  targetName: string | null;
  texFiles: { path: string; text: string }[];
  onGoto: (path: string, line: number) => void;
}) {
  const [changing, setChanging] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const { source, busy, onFile } = r;
  // Load the compiled PDF the first time the window opens.
  useEffect(() => {
    if (pdfFile && source === null && !busy) void onFile(pdfFile, { journalId: pilotId });
  }, [pdfFile, source, busy, onFile, pilotId]);

  if (!pdfFile) return <CompileFirst compiling={compiling} onCompile={onCompile} />;
  const stale = r.source !== null && r.source !== pdfFile && !r.reviewLoading; // loading a new draft would abort a run that costs a review
  const onTarget = !!pilotId && !!r.selectedJournalId && shortId(r.selectedJournalId) === shortId(pilotId);
  const jump = (c: Citation) => {
    for (const f of texFiles) {
      const line = findQuoteInTex(f.text, c.quote);
      if (line) {
        setNotFound(false);
        onGoto(f.path, line);
        return;
      }
    }
    setNotFound(true);
  };

  return (
    <div data-testid="review-window" className="text-sm">
      {stale && (
        <p className="mb-4 rounded-sm border border-line bg-paper-alt p-3">
          The draft changed since this review was loaded.{" "}
          <button type="button" onClick={() => void r.onFile(pdfFile, { journalId: r.selectedJournalId ?? pilotId })} className="text-accent hover:underline">
            Load the new draft
          </button>{" "}
          <span className="text-ink-soft">(a finished review stays until you do).</span>
        </p>
      )}
      {r.busy && <p className="text-ink-soft">Reading the PDF…</p>}
      {r.uploadError && <ErrorText>{r.uploadError}</ErrorText>}

      {r.paperText && (
        <section>
          {onTarget && !changing ? (
            <p>
              Reviewing against <span className="font-medium">{r.selectedRules?.journalName}</span> (your target journal).{" "}
              <button type="button" onClick={() => setChanging(true)} className="text-accent hover:underline">
                Change
              </button>
            </p>
          ) : (
            <>
              {!onTarget && (
                <p className="text-ink-soft">
                  {targetName
                    ? `Your target journal, ${targetName}, isn't among the pilot journals with hand-verified guidelines yet. Pick the closest.`
                    : "Pick the journal to review against."}
                </p>
              )}
              <fieldset disabled={r.reviewLoading} className="m-0 min-w-0 border-0 p-0">
                <JournalPicker selectedJournalId={r.selectedJournalId} onSelect={r.selectJournal} showMatchLink={false} />
              </fieldset>
            </>
          )}
        </section>
      )}

      {r.selectedRules && r.rulesResult && (
        <section className="mt-10 border-t border-line pt-6">
          <h3 className="font-serif text-lg font-medium">Structural check</h3>
          <p className="mt-1 text-ink-soft">Free, instant, and stays on your device: word count, reference style, required statements.</p>
          <RulesCheckPanel result={r.rulesResult} />
        </section>
      )}

      {r.selectedRules && (
        <section className="mt-10 border-t border-line pt-6">
          <h3 className="font-serif text-lg font-medium">Get it reviewed</h3>
          <p className="mt-1 text-ink-soft">
            An LLM review from Claude: inconsistencies, statistical reporting gaps, journal fit. The one feature that sends your paper&apos;s text off this
            device, and only after you confirm the notice.
          </p>
          <ReviewRunner review={r} onCitation={jump} />
          {notFound && (
            <p role="status" className="mt-2 text-ink-soft">
              Couldn&apos;t find that passage in the source.
            </p>
          )}
        </section>
      )}
    </div>
  );
}
