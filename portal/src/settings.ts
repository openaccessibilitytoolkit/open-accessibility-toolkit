// Settings the portal manages by itself, stored in its own database.

/**
 * The random key that scrambles visitors' IP and email addresses before they're
 * stored. A HASH_SALT secret is used if the owner set one; otherwise the portal
 * creates a random key the first time it runs and keeps using it.
 */
export async function hashSalt(db: D1Database, configured: string | undefined): Promise<string> {
  if (configured && configured.length >= 16) return configured;
  const existing = await db.prepare("SELECT value FROM settings WHERE key = 'hash_salt'").first<{ value: string }>();
  if (existing) return existing.value;
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const fresh = btoa(String.fromCharCode(...bytes));
  // If two requests race here, only the first key is kept and both use it.
  await db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('hash_salt', ?)").bind(fresh).run();
  const stored = await db.prepare("SELECT value FROM settings WHERE key = 'hash_salt'").first<{ value: string }>();
  return stored!.value;
}
