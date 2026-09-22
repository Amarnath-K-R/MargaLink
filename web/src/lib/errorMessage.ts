// Normalizes a caught value into a display string. The fallback for a
// non-Error throw is a parameter, not baked in — one call site
// (review/page.tsx's review-request handler) intentionally shows a fixed
// user-facing message instead of the thrown value's String() form, since a
// non-Error throw there is more likely an opaque fetch/stream failure than
// something worth showing verbatim.
export function errorMessage(err: unknown, fallback: string = String(err)): string {
  return err instanceof Error ? err.message : fallback;
}
