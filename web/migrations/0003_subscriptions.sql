-- Pro: Paddle subscriptions, as their latest event describes them. Monthly
-- M coins are granted from this lazily (ledger.ts grantDuePro). A Pro
-- payment is kept in purchases too, with the billing period it paid for,
-- so refunding it can take back that period's coins.

CREATE TABLE subscriptions (
  id TEXT PRIMARY KEY,               -- Paddle's subscription id
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  customer_id TEXT NOT NULL,
  price_id TEXT NOT NULL,
  interval TEXT NOT NULL CHECK (interval IN ('month', 'year')),
  status TEXT NOT NULL,              -- Paddle's: active, past_due, paused, canceled, trialing
  period_start INTEGER,              -- the current billing period (null once cancelled)
  period_end INTEGER,
  cancel_at_end INTEGER NOT NULL DEFAULT 0,
  event_at INTEGER NOT NULL          -- when the event this row reflects happened; older events are ignored
);
CREATE INDEX subscriptions_user ON subscriptions(user_id);

ALTER TABLE purchases ADD COLUMN subscription_id TEXT;
ALTER TABLE purchases ADD COLUMN period_start INTEGER;
