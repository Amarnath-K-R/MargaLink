"use client";

import { useEffect } from "react";
import type { JournalRules } from "@/lib/journals/journalRules";
import ErrorText from "@/components/ui/ErrorText";
import RulesCheckPanel from "@/components/checks/RulesCheckPanel";
import FormatCheckPanel from "@/components/checks/FormatCheckPanel";
import CompileFirst from "./CompileFirst.tsx";
import type { ChecksApi } from "./useChecks.ts";

// The Checks window: the format check and the target journal's rules,
// read from the paper (the compiled PDF, or the Word document) on this
// device. Runs itself whenever the paper or the target journal changed
// since it last ran.
export default function ChecksWindow({
  checks,
  paperFile,
  compiling,
  onCompile,
  rules,
  targetName,
}: {
  checks: ChecksApi;
  paperFile: File | null;
  compiling: boolean;
  onCompile: () => void;
  rules: JournalRules | undefined;
  targetName: string | null;
}) {
  const { busy, source, rulesFor, run } = checks;
  useEffect(() => {
    if (paperFile && !busy && (source !== paperFile || rulesFor !== (rules?.journalId ?? null))) void run(paperFile, rules);
  }, [paperFile, busy, source, rulesFor, run, rules]);

  if (!paperFile) return <CompileFirst compiling={compiling} onCompile={onCompile} />;
  return (
    <div data-testid="checks" className="text-sm">
      <p className="text-ink-soft">Read from your paper on this device. Counts include headings, captions and references. Nothing is sent.</p>
      {checks.error && <ErrorText>{checks.error}</ErrorText>}
      {checks.busy && !checks.format && <p className="mt-3 text-ink-soft">Reading the paper…</p>}
      {checks.format && <FormatCheckPanel result={checks.format} />}
      <section className="mt-12 border-t border-line pt-8">
        <h2 className="font-serif text-xl font-medium">{rules ? `${rules.journalName}'s rules` : "Journal rules"}</h2>
        {rules && checks.rules ? (
          <RulesCheckPanel result={checks.rules} />
        ) : (
          <p className="mt-1 text-ink-soft">
            {targetName
              ? `${targetName} has no hand-verified rules here yet. Set one of the pilot journals as the target (Journal window) to check its rules.`
              : "Set a pilot journal as the target (Journal window) to check its rules."}
          </p>
        )}
      </section>
    </div>
  );
}
