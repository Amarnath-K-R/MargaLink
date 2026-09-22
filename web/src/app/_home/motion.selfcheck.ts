// Runnable check for motion.ts. Run directly:
//   node src/app/_home/motion.selfcheck.ts
import assert from "node:assert/strict";
import { localProgress, stagger, motionStyle, countUp, decodeText } from "./motion.ts";

// localProgress: 0 when the section's top is at the viewport's bottom, 1
// once it's mostly arrived (35% down from the viewport's top).
assert.equal(localProgress({ top: 800 } as unknown as DOMRect, 800), 0, "top at viewport bottom is progress 0");
assert.equal(localProgress({ top: 280 } as unknown as DOMRect, 800), 1, "top at 35% from viewport top is progress 1");
assert.equal(localProgress({ top: -1000 } as unknown as DOMRect, 800), 1, "scrolled well past clamps to 1");

// stagger: the first item's window starts at progress 0, the last item's
// window is fully resolved by progress 1.
assert.equal(stagger(0, 0, 3).opacity, 0, "first item at progress 0 hasn't started revealing");
assert.equal(stagger(1, 2, 3).opacity, 1, "last item at progress 1 is fully revealed");
assert.equal(stagger(1, 0, 3, 24, "x").transform.startsWith("translateX"), true, "axis picks the transform property");

// motionStyle: reduced motion drops the computed style entirely.
assert.deepEqual(motionStyle(true, { opacity: 0.5 }), {}, "reduced motion returns an empty style");
assert.deepEqual(motionStyle(false, { opacity: 0.5 }), { opacity: 0.5 }, "motion enabled passes the style through");

// countUp
assert.equal(countUp(100, 0), 0, "countUp at t=0 is 0");
assert.equal(countUp(100, 1), 100, "countUp at t=1 is the target");
assert.equal(countUp(100, 0.5), 50, "countUp at t=0.5 is the midpoint");

// decodeText: fully revealed at t=1; spaces and periods always pass through
// regardless of t.
assert.equal(decodeText("hi.", 1, 0), "hi.", "t=1 reveals the whole string");
assert.equal(decodeText("a b", 0, 0)[1], " ", "a space is never substituted");
assert.equal(decodeText("a.b", 0, 0)[1], ".", "a period is never substituted");

console.log("motion.selfcheck: OK");
