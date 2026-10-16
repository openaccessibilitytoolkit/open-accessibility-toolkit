// Everything the portal gets from Cloudflare: the database, settings from
// wrangler.jsonc, and private settings (secrets), which `wrangler types` can't see.
export type Bindings = Env & {
  /** Who can log in, separated by commas. */
  ADMIN_EMAILS?: string;
  /** Random text that scrambles visitors' addresses before they're stored. Required. */
  HASH_SALT?: string;
  /** Resend API key with sending access only. Without it, reports are saved but no emails are sent. */
  RESEND_API_KEY?: string;
  EMAIL_FROM: string;
  TIME_ZONE: string;
};

/** The private settings the portal can't work safely without. */
export function missingSettings(env: Bindings): string[] {
  const missing: string[] = [];
  if (!env.HASH_SALT || env.HASH_SALT.length < 16) missing.push("HASH_SALT");
  return missing;
}
