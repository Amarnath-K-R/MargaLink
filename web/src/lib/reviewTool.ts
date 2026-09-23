// The Claude tool-call schema behind functions/api/review.ts (imported
// there via a relative path — see reviewGrounding.ts's header for why).
import type { ReviewResult } from "./reviewTypes.ts";

const CITATION_SCHEMA = {
  type: "array",
  items: {
    type: "object",
    properties: {
      quote: { type: "string" },
      section: { type: "string" },
    },
    required: ["quote", "section"],
  },
} as const;

export const REVIEW_TOOL = {
  name: "submit_review",
  description: "Submit the structured pre-submission review of the paper.",
  input_schema: {
    type: "object",
    properties: {
      journalFit: {
        type: "object",
        properties: {
          assessment: { type: "string", enum: ["good", "possible", "poor"] },
          explanation: { type: "string" },
        },
        required: ["assessment", "explanation"],
      },
      inconsistencies: {
        type: "array",
        items: {
          type: "object",
          properties: {
            description: { type: "string" },
            citations: CITATION_SCHEMA,
          },
          required: ["description", "citations"],
        },
      },
      statisticalReporting: {
        type: "array",
        items: {
          type: "object",
          properties: {
            description: { type: "string" },
            severity: { type: "string", enum: ["minor", "major"] },
            citations: CITATION_SCHEMA,
          },
          required: ["description", "severity", "citations"],
        },
      },
      otherObservations: { type: "array", items: { type: "string" } },
    },
    required: ["journalFit", "inconsistencies", "statisticalReporting", "otherObservations"],
  },
} as const;

// Compile-time drift guard: if ReviewResult (reviewTypes.ts) ever gains a
// field, this fails to typecheck until REVIEW_TOOL's JSON Schema above is
// updated to cover it too — cheaper than a runtime validator for a 4-field
// contract.
const _schemaCoversType: Record<keyof ReviewResult, true> = {
  journalFit: true,
  inconsistencies: true,
  statisticalReporting: true,
  otherObservations: true,
};
void _schemaCoversType;
