// Where Rewrite's card goes on screen (RewriteCard.tsx).

export type Box = { left: number; right: number; top: number; bottom: number };
type Place = { left: number; width: number; top?: number; bottom?: number; maxHeight: number };

const GAP = 12; // between the card and the selection, or the window's edge
const SIDE = 360; // the narrowest a card beside the selection may be
const ROOM = 240; // the least height worth opening below or above it

/**
 * Where the card goes. `sel` is the selection's text column (its lines in
 * LaTeX, the page in Word), so beside it never means on text. Beside it, on
 * the side with more room, when there's at least SIDE (or all the card
 * wants) there, at the selection's height or as high as its content
 * (`natural`) needs; otherwise across the window below the selection or
 * above it, wherever there's more room. `want` is the step's width (a
 * menu's narrow, a rewrite's wide), `narrowest` the least it reads well
 * at beside the selection (a long notice needs more than a short rewrite). Never above the editor's top or below
 * its bottom (so never under a toolbar), never over the selection unless
 * nothing else fits; taller than the room, it scrolls inside.
 * Pure; placeCard.selfcheck.ts runs it.
 */
export function placeCard(sel: Box, editor: Box, view: { width: number; height: number }, natural = ROOM, want = 640, narrowest = SIDE): Place {
  const top = Math.max(GAP, editor.top + GAP);
  const bottom = Math.min(view.height - GAP, editor.bottom - GAP);
  const right = view.width - GAP - sel.right - GAP;
  const left = sel.left - GAP - GAP;
  if (Math.max(right, left) >= Math.min(narrowest, want)) {
    const onRight = right >= left;
    const width = Math.min(want, onRight ? right : left);
    const y = Math.max(top, Math.min(sel.top, bottom - Math.max(natural, ROOM))); // at the selection's height, or as high as its content needs
    return { left: onRight ? sel.right + GAP : sel.left - GAP - width, width, top: y, maxHeight: bottom - y };
  }
  const width = Math.min(want === 640 ? 760 : want, view.width - 2 * GAP);
  const x = Math.max(GAP, Math.min(sel.left, view.width - GAP - width));
  const below = bottom - (sel.bottom + GAP);
  const above = sel.top - GAP - top;
  if (below >= ROOM || (below >= above && below >= 120)) return { left: x, width, top: sel.bottom + GAP, maxHeight: below };
  if (above >= 120) return { left: x, width, bottom: view.height - (sel.top - GAP), maxHeight: above };
  return { left: x, width, top, maxHeight: bottom - top }; // no room either side: over the selection, inside the editor
}
