-- Problems the owner already knows about, shown on the public statement (one per line).
ALTER TABLE sites ADD COLUMN known_problems TEXT NOT NULL DEFAULT '';
-- When the website's details were last changed; the statement shows this date.
ALTER TABLE sites ADD COLUMN updated_at TEXT;
UPDATE sites SET updated_at = created_at WHERE updated_at IS NULL;
