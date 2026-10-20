-- When each website's accessibility statement was last reviewed by a person. The
-- statement shows this date, so it's only ever set by a real review or a save.
ALTER TABLE sites ADD COLUMN reviewed_at TEXT;
UPDATE sites SET reviewed_at = updated_at WHERE reviewed_at IS NULL;

-- Every review, with who did it and how: a dated record of ongoing effort.
CREATE TABLE site_reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  at TEXT NOT NULL,
  actor TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('confirmed', 'updated'))
);
CREATE INDEX site_reviews_by_site ON site_reviews (site_id, at);
