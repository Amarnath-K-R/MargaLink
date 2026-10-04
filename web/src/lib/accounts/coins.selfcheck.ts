// Runnable check for coins.ts: the price table the pricing page promises,
// Pro coins' carry-over, the months a Pro plan has earned, and email
// canonicalisation for the once-per-address welcome bonus.
//   node src/lib/accounts/coins.selfcheck.ts
import assert from "node:assert/strict";
import { canonicalEmail, dueProGrants, isEmail, ledgerLabel, maxPaidChars, normalEmail, proCoinsLeft, reviewPrice, rewritePrice, REWRITE_MAX_WORDS, NotEnoughCoinsError, type LedgerKind } from "./coins.ts";

// the pricing table, exactly
const table: [string, number, number][] = [
  ["quick", 30_000, 4], ["quick", 75_000, 8], ["quick", 150_000, 12], ["quick", 400_000, 32],
  ["standard", 30_000, 6], ["standard", 75_000, 12], ["standard", 150_000, 18], ["standard", 400_000, 48],
  ["thorough", 30_000, 10], ["thorough", 75_000, 20], ["thorough", 150_000, 30], ["thorough", 400_000, 80],
];
for (const [tier, chars, coins] of table) assert.equal(reviewPrice(tier as "quick", chars), coins, `${tier} ${chars}`);
assert.equal(reviewPrice("quick", 50_000), 4, "the first 50k is the base");
assert.equal(reviewPrice("quick", 50_001), 8, "a character over starts the next step");
assert.equal(reviewPrice("quick", 0), 4);

// Rewrite: 1 coin per 500 words, rounded up, at least 1; up to 2,000 words
for (const [words, coins] of [[0, 1], [1, 1], [500, 1], [501, 2], [1000, 2], [1500, 3], [2000, 4]]) assert.equal(rewritePrice(words), coins, `${words} words`);
assert.equal(REWRITE_MAX_WORDS, 2000);

// Pro coins are spent first (they're the ones that can lapse); packs never
// lapse; a refund goes back to the coins it was paid with.
let n = 0;
const e = (kind: LedgerKind, delta: number, ref = `r${++n}`) => ({ kind, delta, ref });
assert.equal(proCoinsLeft([e("pro_grant", 100)]), 100);
assert.equal(proCoinsLeft([e("pro_grant", 100), e("pack", 50), e("review", -60)]), 40, "Pro first");
assert.equal(proCoinsLeft([e("pack", 50), e("review", -50), e("pro_grant", 100)]), 100, "spent before Pro existed");
assert.equal(proCoinsLeft([e("pro_grant", 100), e("review", -130), e("pack", 50)]), 0, "never negative");
assert.equal(proCoinsLeft([e("pro_grant", 100), e("pro_expire", -30)]), 70);
assert.equal(proCoinsLeft([e("pro_grant", 100), e("pack", 50), e("reversal", -50)]), 100, "a reversed pack takes pack coins");
assert.equal(proCoinsLeft([e("pack", 150), e("pro_grant", 100), e("pro_reversal", -100)]), 0, "a reversed Pro payment takes Pro coins, not the pack's");
assert.equal(proCoinsLeft([e("pro_grant", 100), e("review", -30, "t1"), e("review_refund", 30, "t1")]), 100, "a refund of Pro coins is Pro coins again (it can still lapse)");
assert.equal(proCoinsLeft([e("pack", 50), e("pro_grant", 10), e("rewrite", -4, "w1"), e("rewrite_refund", 4, "w1")]), 10, "and a rewrite's too");
assert.equal(proCoinsLeft([e("pack", 50), e("figure", -1, "f1"), e("pro_grant", 100), e("figure_refund", 1, "f1")]), 100, "a refund of pack coins stays pack coins");
assert.equal(proCoinsLeft([e("pro_grant", 20), e("review", -30, "t2"), e("pack", 50), e("review_refund", 30, "t2")]), 20, "split payment, split refund");
// the simulation's sequence: never more Pro coins than coins
const seq = [e("welcome", 10), e("figure", -1, "f9"), e("pro_grant", 100), e("review", -10, "t9"), e("pro_reversal", -100), e("reinstated", 100), e("pro_reversal", -100), e("review_refund", 10, "t9")];
assert.equal(proCoinsLeft(seq), 9, "at most the balance (9)");

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
// odd forms that would make a second address out of one: a trailing dot, invisible characters, empty labels
for (const bad of ["ab@gmail.com.", "a\u200bb@gmail.com", "ab@gmail..com", "ab@.gmail.com", "ab\u00a0@x.org", "ab@x.o"]) assert.ok(!isEmail(bad), JSON.stringify(bad));
for (const good of ["ann.lee+tag@gmail.com", "o'brien@uni.ac.uk", "x_y-z@sub.domain.org"]) assert.ok(isEmail(good), good);

// every ledger kind has a label, and none uses an em dash
for (const k of ["welcome", "pack", "pro_grant", "pro_expire", "pro_reversal", "review", "review_refund", "figure", "figure_refund", "rewrite", "rewrite_refund", "reversal", "reinstated", "admin"] as LedgerKind[]) {
  assert.ok(ledgerLabel(k).length > 0 && !ledgerLabel(k).includes("—"), k);
}
assert.equal(new NotEnoughCoinsError(1, 0).message, "This costs 1 M coin and you have 0.");
const err = new NotEnoughCoinsError(9, 4);
assert.equal(err.coins, 9); assert.equal(err.balance, 4); assert.ok(err instanceof Error);

// The longest paper a price pays for: never shorter than what was priced, never a full step longer.
for (const tier of ["quick", "standard", "thorough"] as const) {
  for (const chars of [1, 2_000, 50_000, 50_001, 120_000, 400_000]) {
    const most = maxPaidChars(tier, reviewPrice(tier, chars));
    assert.ok(most >= chars && most < chars + 50_000 + 50_000, `${tier} ${chars}: ${most}`);
  }
  assert.equal(maxPaidChars(tier, 0), 0, "no coins, no paper");
}
console.log("coins.selfcheck: OK");
