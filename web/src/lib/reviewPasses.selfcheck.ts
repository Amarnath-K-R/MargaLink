// Runnable check for reviewPasses.ts — the Function's input/output gates.
// Run directly:  node src/lib/reviewPasses.selfcheck.ts
import assert from "node:assert/strict";
import { CHUNK_TEXT_MAX, parsePassRequest, passCallConfig, validateSynthesisOutput } from "./reviewPasses.ts";
import { EXTRACT_MAX_TOKENS, TIER_PLAN } from "./reviewPrompt.ts";
import { JOURNAL_RULES } from "./journalRules.ts";
import type { ExtractRequest, SynthesizeRequest } from "./reviewTypes.ts";

const chunk = { id: "s2", title: "Methods", kind: "methods", part: 1, parts: 1, text: "We enrolled 71 patients." };
const extract = { pass: "extract", tier: "standard", claimsCap: 30, chunk };
assert.equal(typeof parsePassRequest(extract), "object", "a well-formed extract request parses");
assert.match(parsePassRequest({ ...extract, extra: 1 }) as string, /unexpected key/i, "unknown top-level keys are rejected");
assert.match(parsePassRequest({ ...extract, chunk: { ...chunk, sectionId: "s2" } }) as string, /unexpected key/i, "unknown chunk keys are rejected");
assert.match(parsePassRequest({ ...extract, chunk: { ...chunk, id: "chunk-2" } }) as string, /chunk id/i);
assert.match(parsePassRequest({ ...extract, chunk: { ...chunk, kind: "table" } }) as string, /kind/i);
assert.match(parsePassRequest({ ...extract, chunk: { ...chunk, part: 2 } }) as string, /part/i);
assert.match(parsePassRequest({ ...extract, chunk: { ...chunk, text: "" } }) as string, /non-empty/i);
assert.match(parsePassRequest({ ...extract, chunk: { ...chunk, text: "x".repeat(CHUNK_TEXT_MAX + 1) } }) as string, /too long/i);
assert.match(parsePassRequest({ ...extract, claimsCap: TIER_PLAN.standard.claimsCap + 1 }) as string, /claimsCap/i, "the cap can't exceed the tier's ceiling");
assert.match(parsePassRequest({ ...extract, claimsCap: 0 }) as string, /claimsCap/i);
assert.match(parsePassRequest({ ...extract, tier: "max" }) as string, /tier/i);
assert.match(parsePassRequest({ text: "old shape", journalId: "x" }) as string, /pass/i, "the old single-call body is rejected by name");
assert.match(parsePassRequest("nope") as string, /object/i);

const synth: SynthesizeRequest = {
  pass: "synthesize",
  journalId: JOURNAL_RULES[0].journalId,
  tier: "standard",
  paperMap: { title: null, totalWords: 100, sections: [{ id: "s1", title: "Abstract", kind: "abstract", words: 100 }] },
  abstractText: null,
  ledger: [
    { id: "s1-c0", section: "Abstract", quote: "71 patients", measure: "n", values: [{ value: 71, unit: null }] },
    { id: "s2-c0", section: "Methods", quote: "70 patients", measure: "n", values: [{ value: 70, unit: null }] },
  ],
  statsFindings: [{ id: "s2-st0", section: "Methods", description: "no CI", severity: "minor" }],
  notes: [],
};
assert.equal(typeof parsePassRequest(synth), "object", "a well-formed synthesize request parses");
assert.match(parsePassRequest({ ...synth, ledger: [...synth.ledger, synth.ledger[0]] }) as string, /duplicate/i, "duplicate ids are rejected");
assert.match(parsePassRequest({ ...synth, notes: [{ id: "s1-c0", section: "A", description: "clash" }] }) as string, /duplicate/i, "ids are unique across ledger, stats and notes");
assert.match(parsePassRequest({ ...synth, ledger: [{ ...synth.ledger[0], id: "bad" }] }) as string, /id/i);
assert.match(parsePassRequest({ ...synth, ledger: [{ ...synth.ledger[0], values: [{ value: "71", unit: null }] }] }) as string, /values/i);
assert.match(parsePassRequest({ ...synth, ledger: [{ ...synth.ledger[0], extra: 1 }] }) as string, /ledger entry/i);
assert.match(parsePassRequest({ ...synth, abstractText: "a".repeat(9000) }) as string, /abstract/i);
assert.match(parsePassRequest({ ...synth, paperMap: { ...synth.paperMap, sections: [{ id: "x", title: "A", kind: "abstract", words: 1 }] } }) as string, /paperMap/i);

const out = validateSynthesisOutput(
  {
    journalFit: { assessment: "good", explanation: "fits" },
    inconsistencies: [
      { description: "kept", claimIds: ["s1-c0", "s2-c0", "s2-c0"] },
      { description: "one id only", claimIds: ["s1-c0"] },
      { description: "foreign id", claimIds: ["s1-c0", "s9-c9"] },
      { description: "stats id is not a claim", claimIds: ["s1-c0", "s2-st0"] },
    ],
    summary: Array.from({ length: 10 }, (_, i) => ({ text: `fix ${i}`, severity: "minor", refs: ["s2-st0", "nope"] })),
    otherObservations: Array.from({ length: 20 }, (_, i) => `obs ${i}`),
  },
  synth
);
assert.deepEqual(out.inconsistencies, [{ description: "kept", claimIds: ["s1-c0", "s2-c0"] }], "ids deduped; findings with <2 ledger ids dropped");
assert.equal(out.summary.length, 8, "summary capped at 8");
assert.deepEqual(out.summary[0].refs, ["s2-st0"], "refs filtered to known ids");
assert.equal(out.otherObservations.length, 15, "other observations capped at 15");
assert.throws(
  () => validateSynthesisOutput({ journalFit: { assessment: "great", explanation: "" }, inconsistencies: [], summary: [], otherObservations: [] }, synth),
  /malformed/i
);

const ec = passCallConfig(parsePassRequest(extract) as ExtractRequest, undefined);
assert.equal(ec.effort, "medium");
assert.equal(ec.maxTokens, EXTRACT_MAX_TOKENS);
assert.equal(ec.tool.name, "submit_extraction");
assert.ok(ec.prompt.includes("At most 30 claims"), "the request's claimsCap reaches the prompt");
const sc = passCallConfig(synth, JOURNAL_RULES[0]);
assert.equal(sc.effort, TIER_PLAN.standard.synthEffort);
assert.equal(sc.maxTokens, TIER_PLAN.standard.synthMaxTokens);
assert.equal(sc.tool.name, "submit_synthesis");
assert.throws(() => passCallConfig(synth, undefined), /rules/i, "synthesis without journal rules is a programming error");

console.log("reviewPasses.selfcheck: OK");
