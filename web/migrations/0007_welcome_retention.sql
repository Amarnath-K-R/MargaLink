-- A welcome fingerprint is kept while its account exists, then for 12
-- months after the account is deleted (enough to stop deleting and signing
-- up again for new coins, and no longer). NULL while an account holds it.
ALTER TABLE welcome_claims ADD COLUMN released_at INTEGER;
