// Runnable check for ledger.ts: the balance is the sum of the ledger, a
// debit never takes it below zero (even two at once), the welcome bonus is
// paid once per address for ever, and an unfinished review is refunded
// exactly once.
//   node src/lib/ledger.selfcheck.ts
import assert from "node:assert/strict";
import { balance, credit, debit, grantWelcome, history, sweepTickets } from "./ledger.ts";
import { fingerprint, signInUser } from "./auth.ts";
import { canonicalEmail } from "./coins.ts";
import { testD1 } from "./testD1.ts";

const db = testD1();
const now = 1_000_000;
const u = await signInUser(db, { email: "ann.lee@gmail.com" }, now);
assert.equal(await balance(db, u.id), 0);

assert.equal(await grantWelcome(db, u.id, u.email, now, "key"), true);
assert.equal(await grantWelcome(db, u.id, u.email, now, "key"), false, "once");
const claim = await db.prepare("SELECT email_hash AS h FROM welcome_claims").first<{ h: string }>();
assert.equal(claim?.h, await fingerprint("key", canonicalEmail(u.email)), "kept as a keyed fingerprint, not a plain hash");
assert.equal(await balance(db, u.id), 10);

// a debit that fits, one that doesn't, and two racing for the last coins
assert.equal(await debit(db, u.id, 4, "figure", "f1", now), true);
assert.equal(await debit(db, u.id, 7, "figure", "f2", now), false);
assert.equal(await balance(db, u.id), 6);
const race = await Promise.all([debit(db, u.id, 4, "figure", "f3", now), debit(db, u.id, 4, "figure", "f4", now)]);
assert.deepEqual(race.sort(), [false, true]);
assert.equal(await balance(db, u.id), 2);
assert.equal(await debit(db, u.id, 1, "figure", "f3", now), false, "a ref is charged once");

// credits are idempotent too
assert.equal(await credit(db, u.id, 50, "pack", "txn_1", now), true);
assert.equal(await credit(db, u.id, 50, "pack", "txn_1", now), false);
assert.equal(await balance(db, u.id), 52);
assert.equal(await credit(db, "no-such-user", 5, "admin", "ghost", now), false, "a credit for an account that's gone is dropped, not an error");

// deleting the account and signing up again, even as a dotted +tag alias, pays no second bonus
await db.prepare("DELETE FROM users WHERE id = ?").bind(u.id).run();
const again = await signInUser(db, { email: "annlee+2@googlemail.com" }, now);
assert.equal(await grantWelcome(db, again.id, again.email, now, "key"), false);
assert.equal(await balance(db, again.id), 0);

// review tickets: an expired, unfinished one is refunded once; a finished one isn't
const v = await signInUser(db, { email: "v@x.org" }, now);
await credit(db, v.id, 30, "admin", "seed", now);
const ticket = (id: string, coins: number, synthesized: number, expires: number) =>
  db.batch([
    db.prepare("INSERT INTO coin_ledger (user_id, delta, kind, ref, created_at) VALUES (?, ?, 'review', ?, ?)").bind(v.id, -coins, id, now),
    db.prepare("INSERT INTO review_tickets (id_hash, user_id, tier, coins, chunks, extract_left, synth_left, synthesized, created_at, expires_at) VALUES (?, ?, 'quick', ?, '{}', 0, 0, ?, ?, ?)").bind(id, v.id, coins, synthesized, now, expires),
  ]);
await ticket("t-live", 4, 0, now + 10);
await ticket("t-dead", 6, 0, now - 1);
await ticket("t-done", 9, 1, now - 1);
assert.equal(await balance(db, v.id), 11);
await sweepTickets(db, now);
await sweepTickets(db, now);
assert.equal(await balance(db, v.id), 17, "t-dead refunded once; t-live still running; t-done kept");
assert.deepEqual((await db.prepare("SELECT id_hash FROM review_tickets").all<{ id_hash: string }>()).results.map((r) => r.id_hash), ["t-live"]);

const h = await history(db, v.id, 10);
assert.deepEqual(h.map((e) => [e.kind, e.delta]).slice(0, 1), [["review_refund", 6]], "newest first");
assert.ok(h.every((e) => typeof e.at === "number" && typeof e.label === "string"));
console.log("ledger.selfcheck: OK");
