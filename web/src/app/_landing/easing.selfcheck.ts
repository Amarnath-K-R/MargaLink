// Runnable check for easing.ts. Run directly:
//   node src/lib/easing.selfcheck.ts
import assert from "node:assert/strict";
import { clamp01, smooth, between, lerp } from "./easing.ts";

assert.equal(clamp01(-0.5), 0, "clamp01 floors at 0");
assert.equal(clamp01(1.5), 1, "clamp01 ceils at 1");
assert.equal(clamp01(0.3), 0.3, "clamp01 passes through an in-range value");

assert.equal(smooth(0), 0, "smooth(0) is 0");
assert.equal(smooth(1), 1, "smooth(1) is 1");
assert.equal(smooth(0.5), 0.5, "smooth is symmetric at the midpoint");

assert.equal(between(-10, 0, 10), 0, "before the range clamps to 0");
assert.equal(between(20, 0, 10), 1, "past the range clamps to 1");
assert.equal(between(5, 0, 10), smooth(0.5), "midrange applies the same ease curve as smooth()");

assert.equal(lerp(0, 10, 0.5), 5, "lerp at amount 0.5 is the midpoint");
assert.equal(lerp(10, 20, 0), 10, "lerp at amount 0 is the start");
assert.equal(lerp(10, 20, 1), 20, "lerp at amount 1 is the end");

console.log("easing.selfcheck: OK");
