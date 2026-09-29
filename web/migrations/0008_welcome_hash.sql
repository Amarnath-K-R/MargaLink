-- Each account remembers the welcome fingerprint it holds (the keyed hash
-- of its canonical address), so deleting it releases that fingerprint only
-- when no other account holds it too (Gmail ignores dots: two accounts can
-- share one), and without needing HASH_SECRET at deletion time.
ALTER TABLE users ADD COLUMN welcome_hash TEXT;
CREATE INDEX users_welcome_hash ON users(welcome_hash);
