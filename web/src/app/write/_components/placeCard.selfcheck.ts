// Runnable check for placeCard: Rewrite's card beside the selection when
// there's room, else across the editor below or above it; never above the
// editor's top (under a toolbar), never off the window.
//   node src/app/write/_components/placeCard.selfcheck.ts
import assert from "node:assert/strict";
import { placeCard } from "./placeCard.ts";

const view = { width: 1400, height: 900 };
const editor = { left: 200, right: 1160, top: 120, bottom: 860 };
const inside = (p: ReturnType<typeof placeCard>) => {
  const top = p.top ?? view.height - p.bottom! - p.maxHeight;
  assert.ok(p.left >= 12 && p.left + p.width <= view.width - 12, `within the window: ${JSON.stringify(p)}`);
  assert.ok(top >= editor.top && (p.top ?? 0) + (p.top !== undefined ? p.maxHeight : 0) <= editor.bottom, `within the editor's height: ${JSON.stringify(p)}`);
};

// a sentence in the left half of a wide window: beside it, on the right, wide, at its height
const beside = placeCard({ left: 300, right: 700, top: 400, bottom: 440 }, editor, view);
assert.deepEqual([beside.left, beside.width, beside.top], [712, 640, 400]);
inside(beside);
// near the right edge: beside it on the left
const leftSide = placeCard({ left: 760, right: 1300, top: 400, bottom: 440 }, editor, view);
assert.equal(leftSide.left + leftSide.width, 760 - 12);
inside(leftSide);
// low on the screen: beside it still, lifted to leave room, not under the window's foot
const low = placeCard({ left: 300, right: 700, top: 820, bottom: 850 }, editor, view);
assert.ok(low.top! <= 820 - 0 && low.maxHeight >= 240);
inside(low);

// beside it, a card taller than the room below the selection's top rises as far as it needs (it can't cover the selection there)
const tall = placeCard({ left: 300, right: 700, top: 400, bottom: 440 }, editor, view, 600);
assert.deepEqual([tall.top, tall.maxHeight], [view.height - 12 - 600 - (view.height - editor.bottom), 600]);
const taller = placeCard({ left: 300, right: 700, top: 400, bottom: 440 }, editor, view, 2000);
assert.equal(taller.top, editor.top + 12, "but no higher than the editor's top, scrolling inside");

// a selection across the page (no room beside it): across the editor, below it when there's room
const wide = { left: 260, right: 1110 };
const below = placeCard({ ...wide, top: 200, bottom: 320 }, editor, view);
assert.deepEqual([below.top, below.width], [332, 760]);
inside(below);
// near the foot: above it, never higher than the editor's top (the case in the owner's screenshot)
const above = placeCard({ ...wide, top: 640, bottom: 860 }, editor, view);
assert.equal(above.bottom, view.height - (640 - 12));
assert.equal(above.maxHeight, 640 - 12 - (editor.top + 12));
// a selection filling the editor: over it, inside the editor
const all = placeCard({ ...wide, top: 130, bottom: 850 }, editor, view);
assert.deepEqual([all.top, all.maxHeight], [editor.top + 12, editor.bottom - 12 - (editor.top + 12)]);
// a narrow window: never wider than it
const phone = placeCard({ left: 20, right: 360, top: 200, bottom: 240 }, { left: 0, right: 390, top: 60, bottom: 800 }, { width: 390, height: 844 });
assert.ok(phone.left >= 12 && phone.left + phone.width <= 390 - 12);

console.log("placeCard.selfcheck: OK");
