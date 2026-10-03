"use client";

import { useCallback, useState } from "react";
import { extractFromFile } from "@/lib/paper/extract";
import { checkFormat, type FormatCheckResult } from "@/lib/checks/formatCheck";
import type { JournalRules } from "@/lib/journals/journalRules";
import { checkRules, type RulesCheckResult } from "@/lib/checks/rulesCheck";
import { errorMessage } from "@/lib/errorMessage";

// The instant, on-device checks over the compiled paper: the general
// format check, and the target journal's rules when it has hand-verified
// ones. Re-extracts only when the PDF changed; always re-runs the rules.
export function useChecks() {
  const [source, setSource] = useState<File | null>(null);
  const [text, setText] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [format, setFormat] = useState<FormatCheckResult | null>(null);
  const [rules, setRules] = useState<RulesCheckResult | null>(null);
  const [rulesFor, setRulesFor] = useState<string | null>(null); // the journal the rules result is for

  const run = useCallback(
    async (file: File, journalRules?: JournalRules) => {
      setBusy(true);
      setError(null);
      try {
        let t = text;
        if (file !== source || t === null) {
          const { fullText } = await extractFromFile(file);
          t = fullText;
          setText(fullText);
          setSource(file);
          setFormat(checkFormat(fullText));
        }
        setRules(journalRules ? checkRules(t, journalRules) : null);
        setRulesFor(journalRules?.journalId ?? null);
      } catch (err) {
        // Mark this PDF and these rules as tried, so the window doesn't retry in a loop.
        setSource(file);
        setRulesFor(journalRules?.journalId ?? null);
        setError(errorMessage(err));
      } finally {
        setBusy(false);
      }
    },
    [source, text],
  );

  return { source, busy, error, format, rules, rulesFor, run };
}

export type ChecksApi = ReturnType<typeof useChecks>;
