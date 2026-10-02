-- The closed beta (src/lib/access/). Who may sign in while it runs, and who
-- may open /admin: canonical addresses (Gmail dots, +tags and googlemail
-- folded, as for the welcome coins), each with a role. An address is listed
-- before its account exists; admitUser turns anyone else away without
-- creating a row.
CREATE TABLE access_list (
  email_key TEXT NOT NULL,                 -- canonicalEmail(address)
  email TEXT NOT NULL,                     -- as it was added, lower-cased
  role TEXT NOT NULL CHECK (role IN ('beta', 'developer')),
  note TEXT,
  added_by TEXT REFERENCES users(id) ON DELETE SET NULL, -- null when seeded by command
  added_at INTEGER NOT NULL,
  PRIMARY KEY (email_key, role)
);

-- The canonical address each account last signed in with, so the gates
-- find its roles in the session query (access.ts accessFor).
ALTER TABLE users ADD COLUMN access_key TEXT;
CREATE INDEX users_access_key ON users(access_key);

-- The console's activity log: one row per API request, metadata only (the
-- path without its query, never a body, address or IP), kept 30 days
-- (telemetry/apiEvents.ts purgeEvents). Token counts for the AI calls.
CREATE TABLE api_events (
  id INTEGER PRIMARY KEY,
  at INTEGER NOT NULL,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  route TEXT NOT NULL,
  method TEXT NOT NULL,
  status INTEGER NOT NULL,
  ms INTEGER NOT NULL,
  model TEXT,
  input_tokens INTEGER,
  output_tokens INTEGER
);
CREATE INDEX api_events_at ON api_events(at);
CREATE INDEX api_events_user ON api_events(user_id, at);

-- Every session predates the access check: everyone signs in once more,
-- through it, which also sets their access_key.
DELETE FROM sessions;
