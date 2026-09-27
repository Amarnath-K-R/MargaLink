"use client";

import { useEffect } from "react";
import type { JournalRules } from "@/lib/journalRules";
import ErrorText from "@/components/ErrorText";
import RulesCheckPanel from "@/components/RulesCheckPanel";
import FormatCheckPanel from "@/app/match/_components/FormatCheckPanel.tsx";
import CompileFirst from "./CompileFirst.tsx";
import type { ChecksApi } from "./useChecks.ts";

// The Checks window: the format check and the target journal's rules,
// read from the compiled PDF on this device. Runs itself whenever the PDF
// or the target journal changed since it last ran.
export default function ChecksWindow({
  checks,
  pdfFile,
  compiling,
  onCompile,
  rules,
  targetName,
}: {
  checks: ChecksApi;
  pdfFile: File | null;
  compiling: boolean;
  onCompile: () => void;
  rules: JournalRules | undefined;
  targetName: string | null;
}) {
  const { busy, source, rulesFor, run } = checks;
  useEffect(() => {
    if (pdfFile && !busy && (source !== pdfFile || rulesFor !== (rules?.journalId ?? null))) void run(pdfFile, rules);
  }, [pdfFile, busy, source, rulesFor, run, rules]);

  if (!pdfFile) return <CompileFirst compiling={compiling} onCompile={onCompile} />;
  return (
    <div data-testid="checks" className="text-sm">
      <p className="text-ink-soft">Read from the compiled PDF on this device — counts include headings, captions and references. Nothing is sent.</p>
      {checks.error && <ErrorText>{checks.error}</ErrorText>}
      {checks.busy && !checks.format && <p className="mt-3 text-ink-soft">Reading the PDF…</p>}
      {checks.format && <FormatCheckPanel result={checks.format} />}
      <section className="mt-12 border-t border-line pt-8">
        <h2 className="font-serif text-xl font-medium">{rules ? `${rules.journalName}'s rules` : "Journal rules"}</h2>
        {rules && checks.rules ? (
          <RulesCheckPanel result={checks.rules} />
        ) : (
          <p className="mt-1 text-ink-soft">
            {targetName
              ? `${targetName} has no hand-verified rules here yet — set one of the pilot journals as the target (Journal window) to check its rules.`
              : "Set a pilot journal as the target (Journal window) to check its rules."}
          </p>
        )}
      </section>
    </div>
  );
}
