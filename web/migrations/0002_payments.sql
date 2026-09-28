-- Paddle: which webhook events were handled (so a retry changes nothing),
-- and the coin packs bought (so a refund or chargeback can take back the
-- right share). No card or bank details ever reach MargaLink.

CREATE TABLE payment_events (
  id TEXT PRIMARY KEY,           -- Paddle's event_id
  type TEXT NOT NULL,
  received_at INTEGER NOT NULL
);

CREATE TABLE purchases (
  txn_id TEXT PRIMARY KEY,       -- Paddle's transaction id
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  customer_id TEXT,
  price_id TEXT NOT NULL,
  coins INTEGER NOT NULL,
  total INTEGER NOT NULL,        -- in the currency's minor units, as Paddle reports it
  currency TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX purchases_user ON purchases(user_id);
