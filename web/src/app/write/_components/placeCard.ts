// Where Rewrite's card goes on screen (RewriteCard.tsx).

export type Box = { left: number; right: number; top: number; bottom: number };
type Place = { left: number; width: number; top?: number; bottom?: number; maxHeight: number };

const GAP = 12; // between the card and the selection, or the window's edge
const SIDE = 400; // the narrowest a card beside the selection may be
const ROOM = 240; // the least height worth opening below or above it

/**
 * Where the card goes: beside the selection, on the side with more room,
 * when there's at least SIDE there (up to 640 wide); otherwise across the
 * editor (up to 760 wide), below the selection or above it, wherever there's
 * more room. Never above the editor's top or below its bottom (so never under
 * a toolbar), never over the selection unless nothing else fits; taller
 * than the room, it scrolls inside. Pure; placeCard.selfcheck.ts runs it.
 */
export function placeCard(sel: Box, editor: Box, view: { width: number; height: number }): Place {
  const top = Math.max(GAP, editor.top + GAP);
  const bottom = Math.min(view.height - GAP, editor.bottom - GAP);
  const right = view.width - GAP - sel.right - GAP;
  const left = sel.left - GAP - GAP;
  if (Math.max(right, left) >= SIDE) {
    const onRight = right >= left;
    const width = Math.min(640, onRight ? right : left);
    const y = Math.max(top, Math.min(sel.top, bottom - ROOM));
    return { left: onRight ? sel.right + GAP : sel.left - GAP - width, width, top: y, maxHeight: bottom - y };
  }
  const width = Math.min(760, editor.right - editor.left - 2 * GAP, view.width - 2 * GAP);
  const x = Math.max(GAP, Math.min(sel.left, view.width - GAP - width));
  const below = bottom - (sel.bottom + GAP);
  const above = sel.top - GAP - top;
  if (below >= ROOM || (below >= above && below >= 120)) return { left: x, width, top: sel.bottom + GAP, maxHeight: below };
  if (above >= 120) return { left: x, width, bottom: view.height - (sel.top - GAP), maxHeight: above };
  return { left: x, width, top, maxHeight: bottom - top }; // no room either side: over the selection, inside the editor
}
