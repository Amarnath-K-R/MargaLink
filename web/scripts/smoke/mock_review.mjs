// A stand-in for /api/review in the smokes and the guide's screenshots (never
// a real Anthropic call). Each section pass finds one problem typical of its
// kind, quoting the section's first full line; the checklist finds one
// missing item; the editor ranks the first two findings and merges nothing.
// The shapes are the real ones (src/lib/review/reviewTypes.ts).
export const firstSentence = (t) => (t.split("\n").map((l) => l.trim()).find((l) => l.length >= 12 && l !== l.toUpperCase()) ?? t.trim()).split(". ")[0];
const firstLine = (t) => {
  const line = t.split("\n").map((l) => l.trim()).find((l) => l.length >= 40 && l !== l.toUpperCase());
  return line ? line.split(". ")[0] : firstSentence(t);
};

const BY_KIND = {
  abstract: ["The abstract's main result has no confidence interval", "major", "reporting", "Readers can't judge how precise the headline result is.", "Give the 95% confidence interval beside the main estimate."],
  introduction: ["The gap this study fills isn't stated", "minor", "clarity", "Without it, a reviewer can't tell what is new here.", "End the introduction with one sentence on what is unknown and how this study answers it."],
  methods: ["How the data were split for validation isn't stated", "major", "design", "If related samples fall on both sides of the split, the results are optimistic.", "Say how the data were split, and that no unit appears in both training and test data."],
  results: ["Effect sizes are reported without confidence intervals", "major", "reporting", "A p-value alone doesn't show how large or precise an effect is.", "Report each effect with its 95% confidence interval."],
  discussion: ["The conclusion is stronger than the results support", "major", "claims", "An association is described in causal terms.", "Use associational language, or state what design would support a causal claim."],
};

export function reviewAnswer(req) {
  if (req.pass === "section") {
    const target = req.paper.find((c) => c.id === req.target);
    const [title, severity, category, why, suggestion] = BY_KIND[target.kind] ?? [`Part of ${target.title} could be clearer`, "minor", "clarity", "A reader may lose the thread here.", "Shorten the long sentences and say the main point first."];
    return {
      verdict: `${target.title} covers what it should; one point needs attention.`,
      findings: [{ title, severity, category, quotes: [{ text: firstLine(target.text), chunk: target.id }], why, suggestion, question: false, missing: false }],
      keyNumbers: [],
    };
  }
  if (req.pass === "checklist") return { guideline: "STROBE", why: "An observational study.", items: [{ item: "Study size", status: "missing", note: "Explain how the study size was arrived at.", quote: null }] };
  return {
    overview: "The paper asks a clear question and answers it with a sound design; its reporting of uncertainty is uneven, and the conclusion claims more than the results show.",
    strengths: ["A clear, focused aim.", "Data from several sites."],
    // No journal, and no notes describing one: the real editor leaves the explanation empty, and the fit isn't shown.
    journalFit: req.journalId ? { assessment: "possible", explanation: "Scope overlaps the journal's remit." } : { assessment: "possible", explanation: "" },
    fixFirst: req.findings.slice(0, 2).map((f) => f.id),
    duplicates: [],
    verdicts: [],
    acrossPaper: [],
  };
}
