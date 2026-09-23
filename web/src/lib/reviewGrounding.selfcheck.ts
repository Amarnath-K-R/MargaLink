// Runnable check for reviewGrounding.ts — the anti-fabrication check
// standing between a model hallucinating a quote and that quote reaching
// the client. Run directly:
//   node src/lib/reviewGrounding.selfcheck.ts
import assert from "node:assert/strict";
import { quoteAppearsInSource, filterGrounded } from "./reviewGrounding.ts";
import type { ReviewResult } from "./reviewTypes.ts";

const SOURCE = "The sample included 71 patients. No significant difference was found between groups (p=0.34).";

assert.equal(
  quoteAppearsInSource("The sample included 71 patients.", SOURCE),
  true,
  "an exact quote should be grounded"
);

assert.equal(
  quoteAppearsInSource("THE SAMPLE   included 71 PATIENTS.", SOURCE),
  true,
  "whitespace/case variation should still ground — fuzzy on those only"
);

assert.equal(quoteAppearsInSource("71 pat", SOURCE), false, "a sub-8-char quote should never ground, even if substantively present");

assert.equal(
  quoteAppearsInSource("The sample included 200 patients.", SOURCE),
  false,
  "a fabricated (unsupported) quote should never ground"
);

const RESULT: ReviewResult = {
  journalFit: { assessment: "good", explanation: "fits" },
  inconsistencies: [
    {
      description: "real, grounded finding",
      citations: [{ quote: "The sample included 71 patients.", section: "Methods" }],
    },
    {
      description: "fabricated finding — should be dropped entirely",
      citations: [{ quote: "The sample included 9000 patients.", section: "Methods" }],
    },
  ],
  statisticalReporting: [],
  otherObservations: [],
};

const filtered = filterGrounded(RESULT, SOURCE);
assert.equal(filtered.inconsistencies.length, 1, "a finding whose only citation fails grounding is dropped entirely");
assert.equal(
  filtered.inconsistencies[0].description,
  "real, grounded finding",
  "the surviving finding is the grounded one, not the fabricated one"
);

console.log("reviewGrounding.selfcheck: OK");
