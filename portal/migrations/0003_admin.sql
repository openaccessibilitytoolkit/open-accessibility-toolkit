-- Who did something in the timeline: an admin's email, or empty for the portal itself.
ALTER TABLE report_events ADD COLUMN actor TEXT;

-- One-time login links. Only a hash of each link's secret is stored.
CREATE TABLE login_tokens (
  token_hash TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at INTEGER
);
CREATE INDEX login_tokens_by_email ON login_tokens (email, created_at);

-- Logged-in devices. Only a hash of each session's secret is stored.
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
