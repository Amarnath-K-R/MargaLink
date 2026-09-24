// Runnable check for topics.ts. Run directly: node src/lib/topics.selfcheck.ts
import assert from "node:assert/strict";
import { topicShares, type TopicTable } from "./topics.ts";

const row = (id: string) => ({ id, name: `Topic ${id}`, subfield: "S", field: "F", domain: "D" });
const table: TopicTable = {
  dim: 3,
  int8: Int8Array.from([127, 0, 0, /**/ 114, 55, 0, /**/ 0, 127, 0, /**/ 0, 0, 127, /**/ 90, 0, 90]),
  rows: ["A", "B", "C", "D", "E"].map(row),
};
const q = Int8Array.from([127, 0, 0]);

const est = topicShares(q, table, { topicTop: 3, topicTemperature: 0.05 });
assert.deepEqual(est.map((e) => e.id), ["A", "B", "E"], "top 3 by cosine");
assert.ok(Math.abs(est.reduce((s, e) => s + e.share, 0) - 1) < 1e-9, "shares sum to 1");
assert.ok(est[0].share >= 0.5, `a leader by 0.1 cosine takes most of the weight (${est[0].share})`);
assert.ok(est[0].share > est[1].share && est[1].share > est[2].share);

const flat = topicShares(q, table, { topicTop: 3, topicTemperature: 100 });
assert.ok(Math.abs(flat[0].share - 1 / 3) < 0.01, "a high temperature spreads the weight");

assert.deepEqual(topicShares(q, { dim: 3, int8: new Int8Array(0), rows: [] }, { topicTop: 3, topicTemperature: 0.05 }), [], "no table, no topics");

console.log("topics.selfcheck: OK");
