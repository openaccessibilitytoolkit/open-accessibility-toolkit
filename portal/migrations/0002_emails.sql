-- Extra people to notify about new reports for a website, besides its contact
-- email. A JSON list of addresses, e.g. ["owner@example.com", "web@example.com"].
ALTER TABLE sites ADD COLUMN notify_emails TEXT NOT NULL DEFAULT '[]';

-- One auto-reply per visitor email address per day. The address is stored only
-- as a salted hash, so this table can't be used to list visitors.
CREATE TABLE auto_replies (
  email_hash TEXT NOT NULL,
  day TEXT NOT NULL,                  -- e.g. 2026-10-16 (UTC)
  PRIMARY KEY (email_hash, day)
);

-- Emails sent per day, to stay inside the email service's free daily limit.
CREATE TABLE email_counts (
  day TEXT PRIMARY KEY,
  count INTEGER NOT NULL
);
