-- Rewrite (functions/api/rewrite.ts) is charged and refunded in the ledger
-- as the other AI features are: two new kinds, 'rewrite' and
-- 'rewrite_refund'. SQLite can't change a CHECK constraint, so the table is
-- rebuilt (as in 0005), every row copied as it is.
CREATE TABLE coin_ledger_new (
  id INTEGER PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  delta INTEGER NOT NULL CHECK (delta <> 0),
  kind TEXT NOT NULL CHECK (kind IN ('welcome', 'pack', 'pro_grant', 'pro_expire', 'pro_reversal', 'review', 'review_refund', 'figure', 'figure_refund', 'rewrite', 'rewrite_refund', 'reversal', 'reinstated', 'admin')),
  ref TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE (kind, ref)
);
INSERT INTO coin_ledger_new (id, user_id, delta, kind, ref, created_at) SELECT id, user_id, delta, kind, ref, created_at FROM coin_ledger;
DROP TABLE coin_ledger;
ALTER TABLE coin_ledger_new RENAME TO coin_ledger;
CREATE INDEX coin_ledger_user ON coin_ledger(user_id, created_at);
