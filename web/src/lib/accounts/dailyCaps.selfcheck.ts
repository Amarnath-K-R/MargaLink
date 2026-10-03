// Runnable check for dailyCaps.ts: the AI features' daily limits, service-
// wide and per account, counted exactly even when requests arrive at once.
//   node src/lib/accounts/dailyCaps.selfcheck.ts
import assert from "node:assert/strict";
import { testD1 } from "./testD1.ts";
import { DAILY, capKeys, leftToday, reserveUse } from "./dailyCaps.ts";
import { signInUser } from "./auth.ts";
import { credit } from "./ledger.ts";

const db = testD1();
const now = Date.UTC(2026, 8, 29, 12);

// nothing used yet: an account that never bought coins has the free share and its own limit
assert.deepEqual(await leftToday(db, "figure", "u1", now), { all: DAILY.figure.free, user: DAILY.figure.user });

// concurrent uses all count (KV's get-then-put lost them)
await Promise.all(Array.from({ length: 25 }, () => reserveUse(db, "figure", "u1", now)));
assert.deepEqual(await leftToday(db, "figure", "u1", now), { all: DAILY.figure.free - 25, user: DAILY.figure.user - 25 });

// another account has its own allowance, but shares the service's
assert.deepEqual(await leftToday(db, "figure", "u2", now), { all: DAILY.figure.free - 25, user: DAILY.figure.user });

// features are counted apart
assert.equal((await leftToday(db, "reviewPass", "u1", now)).user, DAILY.reviewPass.user);

// a new day starts fresh (keys carry the UTC date)
const tomorrow = now + 24 * 60 * 60 * 1000;
assert.notEqual(capKeys("figure", "u1", tomorrow).user, capKeys("figure", "u1", now).user);
assert.deepEqual(await leftToday(db, "figure", "u1", tomorrow), { all: DAILY.figure.free, user: DAILY.figure.user });

// never negative
for (let i = 0; i < DAILY.figure.user + 5; i++) await reserveUse(db, "figure", "u3", now);
assert.equal((await leftToday(db, "figure", "u3", now)).user, 0);
// a reservation is atomic: requests arriving together can't all slip under a limit
const usedOf = async (key: string) => (await db.prepare("SELECT count FROM rate_limits WHERE key = ?").bind(key).first<number>("count")) ?? 0;
const day5 = now + 5 * 24 * 60 * 60 * 1000; // a fresh day, so only this account's limit is in play
const results = await Promise.all(Array.from({ length: DAILY.figure.user + 30 }, () => reserveUse(db, "figure", "u4", day5)));
assert.equal(results.filter((r) => r.ok).length, DAILY.figure.user, "exactly the account's limit is reserved");
assert.ok(results.filter((r) => !r.ok).every((r) => !r.ok && r.full === "user"));
assert.equal(await usedOf(capKeys("figure", "u4", day5).user), DAILY.figure.user, "and refused requests leave no count behind");
assert.equal(await usedOf(capKeys("figure", "u4", day5).all), DAILY.figure.user, "nor on the service's count");

// a reservation that isn't used (the pass was refused) is given back
const r5 = await reserveUse(db, "figure", "u5", now);
assert.ok(r5.ok);
await r5.release();
assert.equal(await usedOf(capKeys("figure", "u5", now).user), 0);

// accounts that never bought coins share only part of the service's day, so throwaway accounts can't book out paying ones
const day2 = now + 2 * 24 * 60 * 60 * 1000;
const free = await signInUser(db, { email: "free@x.org" }, day2);
const payer = await signInUser(db, { email: "payer@x.org" }, day2);
await credit(db, payer.id, 50, "pack", "txn-1", day2);
await db.prepare("INSERT INTO rate_limits (key, count, expires_at) VALUES (?1, ?2, ?3)").bind(capKeys("figure", free.id, day2).free, DAILY.figure.free, day2 + 86_400_000).run();
const rf = await reserveUse(db, "figure", free.id, day2);
assert.ok(!rf.ok && rf.full === "all", "a free account finds the free share full");
assert.equal((await leftToday(db, "figure", free.id, day2)).all, 0, "and is told so before paying");
assert.ok((await reserveUse(db, "figure", payer.id, day2)).ok, "a paying account still gets through");
assert.ok((await leftToday(db, "figure", payer.id, day2)).all > 0);
console.log("dailyCaps.selfcheck: OK");
