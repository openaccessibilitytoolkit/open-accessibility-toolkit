// Everything the portal gets from Cloudflare: the database, settings from
// wrangler.jsonc, and private settings (secrets), which `wrangler types` can't see.
export type Bindings = Env & {
  /** Who can log in, separated by commas. */
  ADMIN_EMAILS?: string;
  /**
   * Optional: random text that scrambles visitors' addresses before they're stored.
   * If it isn't set, the portal creates its own (see settings.ts) and fills this in.
   */
  HASH_SALT?: string;
  /** Resend API key with sending access only. Without it, reports are saved but no emails are sent. */
  RESEND_API_KEY?: string;
  /** Filled in with DEFAULTS by the first step of every request if not set. */
  EMAIL_FROM: string;
  TIME_ZONE: string;
};

export const DEFAULTS = {
  EMAIL_FROM: "Accessibility reports <onboarding@resend.dev>",
  TIME_ZONE: "America/New_York",
};

