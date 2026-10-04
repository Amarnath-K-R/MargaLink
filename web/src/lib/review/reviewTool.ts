// The three tools a review pass can submit through: one per pass, but every
// pass lists all three in this order, so tools, system prompt and paper make
// one cached prefix shared by the whole review (reviewPasses.ts upstreamBody).
// Strict: the shape is guaranteed on the wire; reviewGrounding.ts and
// reviewPasses.ts still check every field.
import { CATEGORIES, FIT, SEVERITIES } from "./reviewTypes.ts";

const FINDING = {
  type: "object",
  additionalProperties: false,
  required: ["title", "severity", "category", "quotes", "why", "suggestion", "question", "missing"],
  properties: {
    title: { type: "string" },
    severity: { type: "string", enum: SEVERITIES },
    category: { type: "string", enum: CATEGORIES },
    quotes: { type: "array", items: { type: "string" } },
    why: { type: "string" },
    suggestion: { type: "string" },
    question: { type: "boolean" },
    missing: { type: "boolean" },
  },
} as const;

export const SECTION_TOOL = {
  name: "submit_section_review",
  strict: true,
  description: "Submit your review of the one section you were asked to review.",
  input_schema: {
    type: "object",
    additionalProperties: false,
    required: ["verdict", "findings", "keyNumbers"],
    properties: {
      verdict: { type: "string" },
      findings: { type: "array", items: FINDING },
      keyNumbers: {
        type: "array",
        items: { type: "object", additionalProperties: false, required: ["measure", "quote"], properties: { measure: { type: "string" }, quote: { type: "string" } } },
      },
    },
  },
} as const;

export const CHECKLIST_TOOL = {
  name: "submit_checklist",
  strict: true,
  description: "Submit the reporting-guideline check of the whole manuscript.",
  input_schema: {
    type: "object",
    additionalProperties: false,
    required: ["guideline", "why", "items"],
    properties: {
      guideline: { type: ["string", "null"] },
      why: { type: "string" },
      items: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["item", "status", "note", "quote"],
          properties: { item: { type: "string" }, status: { type: "string", enum: ["missing", "partial"] }, note: { type: "string" }, quote: { type: ["string", "null"] } },
        },
      },
    },
  },
} as const;

export const EDITOR_TOOL = {
  name: "submit_editor_review",
  strict: true,
  description: "Submit the editor's overview, priorities, duplicates, verdicts, across-paper findings, and which checklist items a finding already raises.",
  input_schema: {
    type: "object",
    additionalProperties: false,
    required: ["overview", "strengths", "journalFit", "fixFirst", "duplicates", "verdicts", "acrossPaper", "checklistCovered"],
    properties: {
      overview: { type: "string" },
      strengths: { type: "array", items: { type: "string" } },
      journalFit: {
        type: "object",
        additionalProperties: false,
        required: ["assessment", "explanation"],
        properties: { assessment: { type: "string", enum: FIT }, explanation: { type: "string" } },
      },
      fixFirst: { type: "array", items: { type: "string" } },
      duplicates: {
        type: "array",
        items: { type: "object", additionalProperties: false, required: ["keep", "drop"], properties: { keep: { type: "string" }, drop: { type: "array", items: { type: "string" } } } },
      },
      verdicts: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["id", "action", "title", "why", "reason"],
          properties: { id: { type: "string" }, action: { type: "string", enum: ["keep", "soften", "drop"] }, title: { type: "string" }, why: { type: "string" }, reason: { type: "string" } },
        },
      },
      acrossPaper: { type: "array", items: FINDING },
      // "c2:s3-f1" pairs, not objects: the three strict tools compile into one grammar, and Anthropic caps its size.
      checklistCovered: { type: "array", items: { type: "string" } },
    },
  },
} as const;

export const REVIEW_TOOLS = [SECTION_TOOL, CHECKLIST_TOOL, EDITOR_TOOL] as const;
