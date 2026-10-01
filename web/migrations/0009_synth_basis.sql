-- How many of a review's sections had come back when its cross-check last
-- succeeded. A cross-check may run again only once more have come back
-- (Retry fixed a section), never twice over the same ones, and never
-- before any has (ledger.ts claimReviewPass).
ALTER TABLE review_tickets ADD COLUMN synth_basis INTEGER NOT NULL DEFAULT 0;
