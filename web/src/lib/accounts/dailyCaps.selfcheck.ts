// Runnable check for dailyCaps.ts: the AI features' daily limits, service-
// wide and per account, counted exactly even when requests arrive at once.
//   node src/lib/accounts/dailyCaps.selfcheck.ts
import assert from "node:assert/strict";
import { testD1 } from "./testD1.ts";
import { DAILY, capKeys, countUse, leftToday } from "./dailyCaps.ts";

const db = testD1();
const now = Date.UTC(2026, 8, 29, 12);

// nothing used yet: the account's own limit is what's left
assert.deepEqual(await leftToday(db, "figure", "u1", now), { all: DAILY.figure.all, user: DAILY.figure.user });

// concurrent uses all count (KV's get-then-put lost them)
await Promise.all(Array.from({ length: 25 }, () => countUse(db, "figure", "u1", now)));
assert.deepEqual(await leftToday(db, "figure", "u1", now), { all: DAILY.figure.all - 25, user: DAILY.figure.user - 25 });

// another account has its own allowance, but shares the service's
assert.deepEqual(await leftToday(db, "figure", "u2", now), { all: DAILY.figure.all - 25, user: DAILY.figure.user });

// features are counted apart
assert.equal((await leftToday(db, "reviewPass", "u1", now)).user, DAILY.reviewPass.user);

// a new day starts fresh (keys carry the UTC date)
const tomorrow = now + 24 * 60 * 60 * 1000;
assert.notEqual(capKeys("figure", "u1", tomorrow).user, capKeys("figure", "u1", now).user);
assert.deepEqual(await leftToday(db, "figure", "u1", tomorrow), { all: DAILY.figure.all, user: DAILY.figure.user });

// never negative
for (let i = 0; i < DAILY.figure.user + 5; i++) await countUse(db, "figure", "u3", now);
assert.equal((await leftToday(db, "figure", "u3", now)).user, 0);
console.log("dailyCaps.selfcheck: OK");
