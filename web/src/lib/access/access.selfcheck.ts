// Runnable check for access.ts: the closed beta's one door to an account, the
// access list, and the one-query check the gates use. On the node:sqlite D1 stand-in.
//   node src/lib/access/access.selfcheck.ts
import assert from "node:assert/strict";
import { testD1 } from "../accounts/testD1.ts";
import { createSession, signInUser, SESSION_COOKIE } from "../accounts/auth.ts";
import { WELCOME_COINS } from "../accounts/coins.ts";
import { balance } from "../accounts/ledger.ts";
import { NOTICE_VERSION } from "../accounts/notice.ts";
import { BETA } from "./beta.ts";
import { accessFor, addAccess, admitUser, listAccess, removeAccess } from "./access.ts";

const db = testD1();
const now = Date.now();
const secret = "test-key";
const count = async (table: string) => (await db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first<{ n: number }>())!.n;
const withSession = (token: string) => new Request("https://m.test/home", { headers: { cookie: `${SESSION_COOKIE}=${token}` } });

// the beta's coins replace the welcome ten
assert.equal(BETA.on, true);
assert.equal(WELCOME_COINS, BETA.coins);
assert.equal(WELCOME_COINS, 50);

// an address that isn't on the list gets no account: nothing about it is stored
assert.equal(await admitUser(db, { email: "stranger@x.org", google: "g-stranger" }, now, secret), null);
for (const t of ["users", "identities", "welcome_claims", "coin_ledger"]) assert.equal(await count(t), 0, `${t} untouched`);

// an invitation matches however the address is spelled (Gmail dots, +tags, googlemail)
const added = await addAccess(
  db,
  [
    { email: "Ann.Lee+beta@googlemail.com", role: "beta", note: "lab" },
    { email: "not an email", role: "beta" },
    { email: "annlee@gmail.com", role: "beta" },
  ],
  null,
  now,
);
assert.deepEqual(added, { added: ["annlee@gmail.com"], already: ["annlee@gmail.com"], invalid: ["not an email"] });

// approved: an account, the beta's coins once, its canonical key and the current notice
const ann = await admitUser(db, { email: "ann.lee@gmail.com", google: "g-ann" }, now, secret);
assert.ok(ann && ann.created);
assert.equal(await balance(db, ann.id), WELCOME_COINS);
const row = await db.prepare("SELECT access_key, notice_version FROM users WHERE id = ?").bind(ann.id).first<{ access_key: string; notice_version: number }>();
assert.deepEqual({ ...row }, { access_key: "annlee@gmail.com", notice_version: NOTICE_VERSION });
assert.ok(await admitUser(db, { email: "ann.lee@gmail.com", google: "g-ann" }, now + 1000, secret));
assert.equal(await balance(db, ann.id), WELCOME_COINS, "the coins come once");

// the gates' check: one query from the session cookie to the roles
const annToken = await createSession(db, ann.id, now);
const annAccess = await accessFor(db, withSession(annToken), now);
assert.deepEqual([annAccess?.session.userId, annAccess?.approved, annAccess?.developer], [ann.id, true, false]);
assert.equal(await accessFor(db, new Request("https://m.test/home"), now), null, "no session, no access");
const legacy = await signInUser(db, { email: "old@x.org" }, now); // an account from before the beta
const legacyAccess = await accessFor(db, withSession(await createSession(db, legacy.id, now)), now);
assert.deepEqual([legacyAccess?.approved, legacyAccess?.developer], [false, false], "signed in, but not on the list");

// developers are approved too, and the last one can't be removed
await addAccess(db, [{ email: "dev@x.org", role: "developer" }], ann.id, now);
const dev = await admitUser(db, { email: "dev@x.org" }, now, secret);
assert.ok(dev);
const devAccess = await accessFor(db, withSession(await createSession(db, dev.id, now)), now);
assert.deepEqual([devAccess?.approved, devAccess?.developer], [true, true]);
assert.deepEqual(await removeAccess(db, "dev@x.org", "developer"), { ok: false, reason: "last-developer" });

// removing someone ends their access at once (signed out everywhere), but keeps their account
assert.deepEqual(await removeAccess(db, "annlee@gmail.com", "beta"), { ok: true });
assert.equal(await accessFor(db, withSession(annToken), now), null);
assert.equal(await admitUser(db, { email: "ann.lee@gmail.com", google: "g-ann" }, now, secret), null, "and can't sign back in");
assert.equal(await balance(db, ann.id), WELCOME_COINS);

// the list shows who has signed in
const list = await listAccess(db);
assert.deepEqual(
  list.map((e) => [e.email_key, e.role, e.user_id]),
  [["dev@x.org", "developer", dev.id]],
);

// the switch: with the beta off, anyone may sign in and every account is approved
(BETA as { on: boolean }).on = false;
const open = await admitUser(db, { email: "anyone@x.org" }, now, secret);
assert.ok(open);
assert.equal((await accessFor(db, withSession(await createSession(db, open.id, now)), now))?.approved, true);
(BETA as { on: boolean }).on = true;

console.log("access.selfcheck: OK");
