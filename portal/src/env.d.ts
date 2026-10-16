// Secrets are not in wrangler.jsonc, so `wrangler types` can't see them. Declared here.
interface Env {
  /** Resend API key with sending access only. Without it, reports are saved but no emails are sent. */
  RESEND_API_KEY?: string;
}
