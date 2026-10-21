-- "Check my website": each automated check of a website, and what it found on each
-- page. Kept so owners can see their progress over time.
CREATE TABLE scans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  started_at TEXT NOT NULL,
  started_by TEXT NOT NULL,
  finished_at TEXT,
  status TEXT NOT NULL CHECK (status IN ('running', 'done', 'stopped')),
  max_pages INTEGER NOT NULL,
  queue TEXT NOT NULL DEFAULT '[]',   -- JSON list of pages still to check
  seen TEXT NOT NULL DEFAULT '[]',    -- JSON list of every page found so far
  browser_session TEXT,               -- Cloudflare browser session, reused between pages
  busy_until INTEGER,                 -- a page is being checked until this time (ms)
  note TEXT                           -- why the check stopped early, in plain words
);
CREATE INDEX scans_by_site ON scans (site_id, started_at);

CREATE TABLE scan_pages (
  scan_id INTEGER NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,          -- the order pages were checked in
  url TEXT NOT NULL,
  title TEXT,
  error TEXT,                         -- why the page couldn't be checked, if it couldn't
  results TEXT,                       -- JSON: the problems found (see scans.ts)
  checked_at TEXT NOT NULL,
  PRIMARY KEY (scan_id, position)
);
