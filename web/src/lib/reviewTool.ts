// The Claude tool-call schema behind functions/api/review.ts (imported
// there via a relative path — see reviewGrounding.ts's header for why).
import type { ExtractResponse, ReviewResult, SynthesizeResponse } from "./reviewTypes.ts";

// strict:true → the API guarantees schema-valid input. Strict mode requires
// every property in `required` and additionalProperties:false at every
// level; optionals are expressed as nullable. No minLength/maxLength (not
// supported) — caps are enforced in reviewPasses.ts instead.
const VALUE = {
  type: "object",
  additionalProperties: false,
  required: ["value", "unit"],
  properties: { value: { type: "number" }, unit: { type: ["string", "null"] } },
} as const;

export const EXTRACT_TOOL = {
  name: "submit_extraction",
  strict: true,
  description: "Submit the claims, statistical-reporting findings and notes extracted from this section.",
  input_schema: {
    type: "object",
    additionalProperties: false,
    required: ["claims", "statisticalReporting", "notes"],
    properties: {
      claims: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["quote", "measure", "values"],
          properties: { quote: { type: "string" }, measure: { type: "string" }, values: { type: "array", items: VALUE } },
        },
      },
      statisticalReporting: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["description", "severity", "quote"],
          properties: { description: { type: "string" }, severity: { type: "string", enum: ["minor", "major"] }, quote: { type: "string" } },
        },
      },
      notes: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["description", "quote"],
          properties: { description: { type: "string" }, quote: { type: ["string", "null"] } },
        },
      },
    },
  },
} as const;

export const SYNTHESIZE_TOOL = {
  name: "submit_synthesis",
  strict: true,
  description: "Submit the journal-fit assessment, cross-section inconsistencies, prioritized summary and other observations.",
  input_schema: {
    type: "object",
    additionalProperties: false,
    required: ["journalFit", "inconsistencies", "summary", "otherObservations"],
    properties: {
      journalFit: {
        type: "object",
        additionalProperties: false,
        required: ["assessment", "explanation"],
        properties: { assessment: { type: "string", enum: ["good", "possible", "poor"] }, explanation: { type: "string" } },
      },
      inconsistencies: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["description", "claimIds"],
          properties: { description: { type: "string" }, claimIds: { type: "array", items: { type: "string" } } },
        },
      },
      summary: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["text", "severity", "refs"],
          properties: {
            text: { type: "string" },
            severity: { type: "string", enum: ["major", "minor"] },
            refs: { type: "array", items: { type: "string" } },
          },
        },
      },
      otherObservations: { type: "array", items: { type: "string" } },
    },
  },
} as const;

// Drift guards: fail to typecheck if a response type gains a field the
// schema above doesn't cover.
const _extractCoversType: Record<keyof ExtractResponse, true> = { claims: true, statisticalReporting: true, notes: true };
const _synthCoversType: Record<keyof SynthesizeResponse, true> = { journalFit: true, inconsistencies: true, summary: true, otherObservations: true };
void _extractCoversType;
void _synthCoversType;

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
