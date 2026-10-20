-- People who can log in besides the portal owners (who are set in Cloudflare as
-- ADMIN_EMAILS). Each person sees either every website, or only the ones listed in
-- person_sites.
CREATE TABLE people (
  email TEXT PRIMARY KEY,               -- always lower case
  all_sites INTEGER NOT NULL DEFAULT 1, -- 1 = every website; 0 = only those in person_sites
  added_by TEXT NOT NULL,
  added_at TEXT NOT NULL
);

CREATE TABLE person_sites (
  email TEXT NOT NULL REFERENCES people(email) ON DELETE CASCADE,
  site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  PRIMARY KEY (email, site_id)
);

-- Who added, removed or changed whom, and when.
CREATE TABLE people_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  actor TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('added', 'removed', 'access_changed')),
  email TEXT NOT NULL,
  detail TEXT
);
