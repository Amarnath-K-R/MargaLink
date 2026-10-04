// A stand-in for /api/review in the smokes and the guide's screenshots (never
// a real Anthropic call). Each section pass finds one problem quoting its
// section's first sentence; the checklist finds one missing item; the editor
// ranks the first two findings and merges nothing. The shapes are the real
// ones (src/lib/review/reviewTypes.ts).
export const firstSentence = (t) => (t.split("\n").map((l) => l.trim()).find((l) => l.length >= 12 && l !== l.toUpperCase()) ?? t.trim()).split(". ")[0];

export function reviewAnswer(req) {
  if (req.pass === "section") {
    const target = req.paper.find((c) => c.id === req.target);
    const quote = { text: firstSentence(target.text), chunk: target.id };
    return {
      verdict: `${target.title} states its aim; its numbers need their uncertainty.`,
      findings: [
        {
          title: `A result in ${target.title} has no confidence interval`,
          severity: "major",
          category: "reporting",
          quotes: [quote],
          why: "Readers can't judge how precise it is.",
          suggestion: "Give the 95% confidence interval beside it.",
          question: false,
          missing: false,
        },
      ],
      keyNumbers: [],
    };
  }
  if (req.pass === "checklist") return { guideline: "STROBE", why: "An observational study.", items: [{ item: "Study size", status: "missing", note: "Explain how the study size was arrived at.", quote: null }] };
  return {
    overview: "The paper asks a clear question and answers it with a sound design; its reporting of uncertainty is uneven.",
    strengths: ["A clear, focused aim."],
    journalFit: { assessment: "possible", explanation: "Scope overlaps the journal's remit." },
    fixFirst: req.findings.slice(0, 2).map((f) => f.id),
    duplicates: [],
    verdicts: [],
    acrossPaper: [],
  };
}
