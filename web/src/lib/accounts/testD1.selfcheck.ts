// Runnable check for testD1.ts, the D1 stand-in the account selfchecks use:
// every migration applies, and prepare/bind/first/all/run/batch behave the
// way the Functions rely on (batch is all-or-nothing, foreign keys cascade).
//   node src/lib/accounts/testD1.selfcheck.ts
import assert from "node:assert/strict";
import { testD1 } from "./testD1.ts";

const db = testD1();
await db.prepare("INSERT INTO users (id, email, created_at) VALUES (?, ?, ?)").bind("u1", "a@b.c", 1).run();
assert.equal(await db.prepare("SELECT email FROM users WHERE id = ?").bind("u1").first("email"), "a@b.c");
assert.deepEqual(await db.prepare("SELECT id FROM users WHERE id = ?").bind("nope").first(), null);

const add = (delta: number, ref: string) => db.prepare("INSERT INTO coin_ledger (user_id, delta, kind, ref, created_at) VALUES ('u1', ?, 'admin', ?, 0)").bind(delta, ref);
const r = await add(10, "a").run();
assert.equal(r.meta.changes, 1);
assert.equal((await db.prepare("SELECT SUM(delta) AS b FROM coin_ledger").first<{ b: number }>())?.b, 10);

// batch: all or nothing (the second row breaks UNIQUE(kind, ref))
await assert.rejects(db.batch([add(5, "b"), add(5, "a")]));
assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM coin_ledger").first<{ n: number }>())?.n, 1, "failed batch rolled back");
const [one, two] = await db.batch([add(1, "c"), db.prepare("DELETE FROM coin_ledger WHERE ref = 'c' RETURNING delta")]);
assert.equal(one.meta.changes, 1);
assert.deepEqual(two.results, [{ delta: 1 }]);

const all = await db.prepare("SELECT ref FROM coin_ledger ORDER BY ref").all<{ ref: string }>();
assert.deepEqual(all.results.map((x) => x.ref), ["a"]);

// deleting a user cascades to their rows; the welcome fingerprint stays
await db.prepare("INSERT INTO welcome_claims (email_hash, created_at) VALUES ('h', 0)").run();
await db.prepare("DELETE FROM users WHERE id = 'u1'").run();
assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM coin_ledger").first<{ n: number }>())?.n, 0);
assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM welcome_claims").first<{ n: number }>())?.n, 1);

// the CHECK on kind
await db.prepare("INSERT INTO users (id, email, created_at) VALUES ('u2', 'x@y.z', 0)").run();
await assert.rejects(db.prepare("INSERT INTO coin_ledger (user_id, delta, kind, ref, created_at) VALUES ('u2', 1, 'gift', 'r', 0)").run());
console.log("testD1.selfcheck: OK");
