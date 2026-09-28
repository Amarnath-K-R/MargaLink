-- Tries per section of a paid review: {sectionId: n}. A section that came
-- back isn't sent again, and one that keeps failing gets a few tries, so a
-- review can't be made to send one section over and over (the ticket's
-- price is for each section once). Ids and counts only.
ALTER TABLE review_tickets ADD COLUMN passes TEXT NOT NULL DEFAULT '{}';
