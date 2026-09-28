// Runnable check for coins.ts: the price table the pricing page promises,
// Pro coins' carry-over, the months a Pro plan has earned, and email
// canonicalisation for the once-per-address welcome bonus.
//   node src/lib/coins.selfcheck.ts
import assert from "node:assert/strict";
import { canonicalEmail, dueProGrants, isEmail, ledgerLabel, normalEmail, proCoinsLeft, reviewPrice, NotEnoughCoinsError, type LedgerKind } from "./coins.ts";

// the pricing table, exactly
const table: [string, number, number][] = [
  ["quick", 30_000, 4], ["quick", 75_000, 6], ["quick", 150_000, 8], ["quick", 400_000, 18],
  ["standard", 30_000, 6], ["standard", 75_000, 9], ["standard", 150_000, 12], ["standard", 400_000, 27],
  ["thorough", 30_000, 10], ["thorough", 75_000, 15], ["thorough", 150_000, 20], ["thorough", 400_000, 45],
];
for (const [tier, chars, coins] of table) assert.equal(reviewPrice(tier as "quick", chars), coins, `${tier} ${chars}`);
assert.equal(reviewPrice("quick", 50_000), 4, "the first 50k is the base");
assert.equal(reviewPrice("quick", 50_001), 6, "a character over starts the next step");
assert.equal(reviewPrice("quick", 0), 4);

// Pro coins are spent first (they're the ones that can lapse); refunds and
// packs never lapse.
const e = (kind: LedgerKind, delta: number) => ({ kind, delta });
assert.equal(proCoinsLeft([e("pro_grant", 100)]), 100);
assert.equal(proCoinsLeft([e("pro_grant", 100), e("pack", 50), e("review", -60)]), 40, "Pro first");
assert.equal(proCoinsLeft([e("pack", 50), e("review", -50), e("pro_grant", 100)]), 100, "spent before Pro existed");
assert.equal(proCoinsLeft([e("pro_grant", 100), e("review", -130), e("pack", 50)]), 0, "never negative");
assert.equal(proCoinsLeft([e("pro_grant", 100), e("pro_expire", -30)]), 70);
assert.equal(proCoinsLeft([e("pro_grant", 100), e("pack", 50), e("reversal", -50)]), 100, "a reversed pack takes pack coins");

// the months a plan has earned: one per monthly period, twelve drips a year
const t = (s: string) => Date.parse(s);
const month = { id: "sub_1", interval: "month" as const, periodStart: t("2026-10-05T00:00:00Z"), periodEnd: t("2026-11-05T00:00:00Z"), active: true };
assert.deepEqual(dueProGrants(month, t("2026-10-05T00:00:01Z")), [`sub_1:${month.periodStart}:0`]);
assert.deepEqual(dueProGrants(month, t("2026-10-04T00:00:00Z")), [], "not yet started");
assert.deepEqual(dueProGrants({ ...month, active: false }, t("2026-10-10T00:00:00Z")), [], "inactive plans earn nothing");
const year = { ...month, interval: "year" as const, periodStart: t("2026-01-31T00:00:00Z"), periodEnd: t("2027-01-31T00:00:00Z") };
assert.equal(dueProGrants(year, t("2026-02-27T00:00:00Z")).length, 1);
assert.equal(dueProGrants(year, t("2026-02-28T00:00:00Z")).length, 2, "Jan 31 + 1 month is Feb 28, not Mar 3");
assert.equal(dueProGrants(year, t("2026-12-31T00:00:00Z")).length, 12);
assert.equal(dueProGrants(year, t("2027-03-01T00:00:00Z")).length, 12, "never more than 12 a year");

// emails
assert.equal(normalEmail("  Ann@Example.ORG "), "ann@example.org");
assert.equal(canonicalEmail("A.n.N+x@GoogleMail.com"), "ann@gmail.com");
assert.equal(canonicalEmail("a.nn+news@example.org"), "a.nn@example.org", "dots only matter at Gmail");
assert.ok(isEmail("a@b.co"));
for (const bad of ["", "a@b", "a b@c.d", "@c.d", "a@@c.d", `${"a".repeat(250)}@b.co`]) assert.ok(!isEmail(bad), bad);

// every ledger kind has a label, and none uses an em dash
for (const k of ["welcome", "pack", "pro_grant", "pro_expire", "review", "review_refund", "figure", "figure_refund", "reversal", "admin"] as LedgerKind[]) {
  assert.ok(ledgerLabel(k).length > 0 && !ledgerLabel(k).includes("—"), k);
}
const err = new NotEnoughCoinsError(9, 4);
assert.equal(err.coins, 9); assert.equal(err.balance, 4); assert.ok(err instanceof Error);
console.log("coins.selfcheck: OK");
