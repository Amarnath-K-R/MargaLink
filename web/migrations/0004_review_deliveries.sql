-- Which paid sections a review actually delivered (a pass that came back
-- with a result). An unfinished review is refunded for the share it didn't
-- deliver: each section is one part and the final cross-check one more.
-- Section ids only, never text; gone with the ticket.
CREATE TABLE review_deliveries (
  ticket TEXT NOT NULL REFERENCES review_tickets(id_hash) ON DELETE CASCADE,
  chunk_id TEXT NOT NULL,
  PRIMARY KEY (ticket, chunk_id)
);
