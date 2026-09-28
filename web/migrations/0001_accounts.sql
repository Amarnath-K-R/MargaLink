-- Accounts, sign-in and the M coin ledger (Cloudflare D1, binding DB).
-- Nothing here ever holds anything from a paper (CLAUDE.md rule 2): a
-- review ticket keeps section ids and character counts only, for ~2 hours.
-- Times are unix milliseconds.

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,              -- lower-cased
  notice_version INTEGER NOT NULL DEFAULT 1, -- the privacy notice they signed up under
  created_at INTEGER NOT NULL
);

-- Google's stable account id ("sub"), linked to a user by verified email.
CREATE TABLE identities (
  provider TEXT NOT NULL CHECK (provider IN ('google')),
  subject TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (provider, subject)
);

-- Only the sha256 of the cookie's token is kept.
CREATE TABLE sessions (
  id_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE INDEX sessions_user ON sessions(user_id);

-- One-time email sign-in links (sha256 of the token; 15 minutes; single use).
CREATE TABLE magic_links (
  token_hash TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  next TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

-- Fixed-window counters: email requests per address, per hashed IP, per day.
CREATE TABLE rate_limits (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

-- Append-only. Balance = SUM(delta). UNIQUE(kind, ref) makes every credit
-- and debit idempotent (a webhook retry, a double refund sweep).
CREATE TABLE coin_ledger (
  id INTEGER PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  delta INTEGER NOT NULL CHECK (delta <> 0),
  kind TEXT NOT NULL CHECK (kind IN ('welcome', 'pack', 'pro_grant', 'pro_expire', 'review', 'review_refund', 'figure', 'figure_refund', 'reversal', 'admin')),
  ref TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE (kind, ref)
);
CREATE INDEX coin_ledger_user ON coin_ledger(user_id, created_at);

-- The welcome bonus is given once per (canonical) email address, ever: this
-- one-way fingerprint outlives account deletion so deleting and signing up
-- again doesn't mint new coins. It holds no address.
CREATE TABLE welcome_claims (
  email_hash TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL
);

-- A paid review run: what was paid for (tier, section ids -> character
-- counts) and how many passes are left. Never any text.
CREATE TABLE review_tickets (
  id_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tier TEXT NOT NULL,
  coins INTEGER NOT NULL,
  chunks TEXT NOT NULL,
  extract_left INTEGER NOT NULL,
  synth_left INTEGER NOT NULL,
  synthesized INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX review_tickets_user ON review_tickets(user_id, expires_at);
