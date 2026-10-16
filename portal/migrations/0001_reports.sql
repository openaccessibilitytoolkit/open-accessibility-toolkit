-- Websites managed in this portal. One portal can look after several websites.
CREATE TABLE sites (
  id TEXT PRIMARY KEY,                -- short name, e.g. "joesbakery-com"
  organization TEXT NOT NULL,
  website TEXT NOT NULL,
  contact_email TEXT NOT NULL,
  reply_days INTEGER NOT NULL DEFAULT 5,
  phone TEXT,
  created_at TEXT NOT NULL
);

-- Problems reported by visitors.
CREATE TABLE reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  page TEXT,
  email TEXT,
  assistive_tech TEXT NOT NULL DEFAULT '[]',  -- JSON list of fixed choices, e.g. ["keyboard"]
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'in_progress', 'fixed')),
  received_at TEXT NOT NULL
);
CREATE INDEX reports_by_site ON reports (site_id, received_at);

-- Everything that happened to a report, with the time: the record of effort.
CREATE TABLE report_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  report_id INTEGER NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  at TEXT NOT NULL,
  kind TEXT NOT NULL,                 -- received, owner_notified, auto_reply_sent, status_changed, note
  detail TEXT
);
CREATE INDEX report_events_by_report ON report_events (report_id, at);

-- Recent form submissions per visitor, to slow down robots. Visitors are
-- identified only by a salted hash of their IP address, never the address itself.
CREATE TABLE rate_limits (
  key TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL
);
