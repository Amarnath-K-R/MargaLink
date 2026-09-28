-- Refunds and disputes, accounted properly.
-- Two new ledger kinds: 'pro_reversal' (Pro coins taken back when a Pro
-- payment is refunded or charged back; taken from Pro coins first) and
-- 'reinstated' (coins given back when a disputed payment is decided in our
-- favour). SQLite can't change a CHECK constraint, so the table is rebuilt,
-- every row copied as it is.
CREATE TABLE coin_ledger_new (
  id INTEGER PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  delta INTEGER NOT NULL CHECK (delta <> 0),
  kind TEXT NOT NULL CHECK (kind IN ('welcome', 'pack', 'pro_grant', 'pro_expire', 'pro_reversal', 'review', 'review_refund', 'figure', 'figure_refund', 'reversal', 'reinstated', 'admin')),
  ref TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE (kind, ref)
);
INSERT INTO coin_ledger_new (id, user_id, delta, kind, ref, created_at) SELECT id, user_id, delta, kind, ref, created_at FROM coin_ledger;
DROP TABLE coin_ledger;
ALTER TABLE coin_ledger_new RENAME TO coin_ledger;
CREATE INDEX coin_ledger_user ON coin_ledger(user_id, created_at);

-- Each refund or chargeback applied to a purchase: the share of its price
-- (1 for a full one; negative for a won dispute, undoing its chargeback)
-- and the coins it took back. A Pro period's allowance is its full
-- entitlement times what's left unrefunded; a won dispute restores what its
-- chargebacks took.
CREATE TABLE adjustments (
  id TEXT PRIMARY KEY,                 -- Paddle's adjustment id
  txn_id TEXT NOT NULL REFERENCES purchases(txn_id) ON DELETE CASCADE,
  action TEXT NOT NULL,                -- refund, chargeback, chargeback_reverse
  share REAL NOT NULL,
  coins INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX adjustments_txn ON adjustments(txn_id);
