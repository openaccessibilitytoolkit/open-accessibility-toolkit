-- Settings the portal manages by itself, such as the random key it creates on
-- first run to scramble visitors' addresses (so owners don't have to invent one).
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
