// Everything the portal gets from Cloudflare: the database, settings from
// wrangler.jsonc, and secrets (which `wrangler types` can't see, so they're added here).
export type Bindings = Env & {
  /** Resend API key with sending access only. Without it, reports are saved but no emails are sent. */
  RESEND_API_KEY?: string;
  ADMIN_EMAILS: string;
  TIME_ZONE: string;
};
