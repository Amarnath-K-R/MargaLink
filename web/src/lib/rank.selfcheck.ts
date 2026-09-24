// Runnable check for rank.ts (the ranker the browser and the harness share)
// and manifest.ts's validateRanking. Run directly: node src/lib/rank.selfcheck.ts
import assert from "node:assert/strict";
import { DEFAULT_RANKING, validateRanking, type RankingConfig } from "./manifest.ts";
import type { JournalMeta } from "./match.ts";
import { bestCentre, calibrate, fuse, priorScore, rankJournals, refScore, topicScore, type RankInput } from "./rank.ts";

const dim = 4;
const v = (...xs: number[]) => Int8Array.from(xs);
// 6 journals; j1 has two centres, the rest one.
const centres = Int8Array.from([
  ...[127, 0, 0, 0], // j0
  ...[0, 127, 0, 0], // j1 centre a
  ...[90, 90, 0, 0], // j1 centre b
  ...[0, 0, 127, 0], // j2
  ...[60, 0, 100, 0], // j3
  ...[0, 0, 0, 127], // j4
  ...[20, 0, 0, 120], // j5
]);
const base = (id: string, i: number, extra: Partial<JournalMeta> = {}): JournalMeta => ({
  id,
  display_name: id,
  field: "Medicine",
  is_in_doaj: null,
  apc_usd: null,
  country_code: null,
  medline_indexed: null,
  publication_time_weeks: null,
  centres: [i, 1],
  ...extra,
});
const meta: JournalMeta[] = [
  base("J0", 0, { topics: [["T1", 0.5], ["T2", 0.5]], centre_topics: ["Heart failure"] }),
  base("J1", 1, { centres: [1, 2], centre_topics: ["Lungs", "Heart and lungs"] }),
  base("J2", 3),
  base("J3", 4, { topics: [["T3", 1]] }),
  base("J4", 5),
  base("J5", 6),
];
const topicSubfield = new Map([
  ["T1", "Cardiology"],
  ["T2", "Cardiology"],
  ["T3", "Cardiology"],
  ["T9", "Geology"],
]);
const input = (over: Partial<RankInput> = {}): RankInput => ({
  queryInt8: v(127, 0, 0, 0),
  dim,
  centres,
  meta,
  candidates: [0, 1, 2, 3, 4, 5],
  paperTopics: [],
  topicSubfield,
  cited: new Map(),
  k: 3,
  year: 2026,
  ...over,
});
const fitted: RankingConfig = {
  ...DEFAULT_RANKING,
  weights: { emb: 1, topic: 1, ref: 1, prior: 0 },
  calibration: { edges: [0, 1, 2], probs: [0, 0.5, 1] },
  fitted: true,
};

// 1. the best of a journal's centres counts
assert.equal(bestCentre(v(127, 0, 0, 0), centres, dim, 1, 2).centre, 2, "j1's second centre is closer");
assert.equal(bestCentre(v(127, 0, 0, 0), centres, dim, 0, 1).cos, 1);

// 2. topic overlap, with half credit for a shared subfield
{
  const paper = [
    { id: "T1", name: "HF", subfield: "Cardiology", share: 0.6 },
    { id: "T3", name: "Arrhythmia", subfield: "Cardiology", share: 0.4 },
  ];
  const t = topicScore(paper, [["T1", 0.5], ["T2", 0.5]], topicSubfield);
  assert.ok(Math.abs(t.score - (0.6 * 0.5 + 0.5 * 0.4 * 1.0)) < 1e-9, String(t.score));
  assert.deepEqual(t.shared.map((s) => s.id), ["T1"]);
  assert.equal(topicScore(paper, [], topicSubfield).score, 0);
}

// 3. reference, prior, fusion, calibration
assert.equal(refScore(0, 0), 0);
assert.equal(refScore(4, 4), 1);
assert.ok(refScore(1, 4) > 0 && refScore(1, 4) < 1);
assert.equal(priorScore(base("x", 0, { works_count: 99_999, last_publication_year: 2025 }), 2026), 1);
assert.equal(priorScore(base("x", 0), 2026), 0);
assert.equal(fuse({ emb: 0.5, topic: 0.2, ref: 1, prior: 1 }, { emb: 1, topic: 2, ref: 0.5, prior: 0.1 }), 0.5 + 0.4 + 0.5 + 0.1);
assert.equal(calibrate(-1, fitted.calibration), 0);
assert.equal(calibrate(1.5, fitted.calibration), 0.75);
assert.equal(calibrate(9, fitted.calibration), 1);

// 4. embedding-only ranking, reproducible order
{
  const r = rankJournals(input(), DEFAULT_RANKING);
  assert.deepEqual(r.map((x) => x.id), ["J0", "J1", "J3"], "cos 1, then j1's 90/127 centre, then j3's 60/127");
  assert.equal(r[0].fit, null);
  assert.equal(r[0].band, "unfitted", "an unfitted build shows no fake percentages");
  assert.equal(r[1].why.centre.label, "Heart and lungs", "the label of the centre that matched");
}

// 5. a cited journal outside the embedding pool can surface; one failing the filters never does
{
  const cited = new Map([["J4", 5]]);
  const r = rankJournals(input({ cited }), fitted);
  assert.ok(r.some((x) => x.id === "J4"), "cited 5 times with a zero cosine still ranks");
  assert.equal(r.find((x) => x.id === "J4")!.why.cited, 5);
  const filtered = rankJournals(input({ cited, candidates: [0, 1, 2] }), fitted);
  assert.ok(!filtered.some((x) => x.id === "J4"), "a cited journal excluded by the filters stays out");
  assert.deepEqual(rankJournals(input({ candidates: [] }), fitted), [], "no candidates, no results");
}

// 6. topics lift a journal and explain it
{
  const paperTopics = [{ id: "T3", name: "Arrhythmia", subfield: "Cardiology", share: 1 }];
  const r = rankJournals(input({ paperTopics, k: 6 }), fitted);
  const j3 = r.find((x) => x.id === "J3")!;
  assert.equal(j3.why.topics[0].name, "Arrhythmia");
  assert.ok(j3.signals.topic === 1 && j3.fit !== null && j3.band !== "unfitted");
  assert.ok(r.findIndex((x) => x.id === "J3") < r.findIndex((x) => x.id === "J1"), "the topic match outranks a closer-by-cosine journal");
}

// 7. old builds without centres: row j is journal j's only centre
{
  const legacy = meta.map(({ centres: _c, ...m }) => m as JournalMeta);
  const flat = Int8Array.from([...[127, 0, 0, 0], ...[0, 127, 0, 0]]);
  const r = rankJournals(input({ meta: legacy.slice(0, 2), centres: flat, candidates: [0, 1] }), DEFAULT_RANKING);
  assert.deepEqual(r.map((x) => x.id), ["J0", "J1"]);
}

// 8. manifest validation never throws, falls back to the unfitted default
assert.equal(validateRanking(undefined), DEFAULT_RANKING);
assert.equal(validateRanking({}), DEFAULT_RANKING);
assert.equal(validateRanking({ ...fitted, weights: { emb: 1, topic: -1, ref: 0, prior: 0 } }), DEFAULT_RANKING);
assert.equal(validateRanking({ ...fitted, calibration: { edges: [0, 0], probs: [0, 1] } }), DEFAULT_RANKING, "edges must increase");
assert.equal(validateRanking({ ...fitted, calibration: { edges: [0, 1], probs: [1, 0] } }), DEFAULT_RANKING, "probabilities must not fall");
assert.equal(validateRanking({ ...fitted, accuracy: { n: 1 } }), DEFAULT_RANKING);
assert.equal(validateRanking(fitted), fitted);

console.log("rank.selfcheck: OK");
