// Keeps robots and floods of reports out, without puzzles that would themselves
// be a barrier for disabled visitors.

/** The hidden "leave this empty" field. People never see it; robots fill it in. */
export const HONEYPOT_FIELD = "website";

/** Real people take longer than this to read the form and describe a problem. */
export const MIN_FILL_MS = 3000;

export const RATE_LIMIT = { max: 5, windowMs: 60 * 60 * 1000 };

/** True when the form looks like it was filled in by a robot. */
export function looksAutomated(form: Record<string, unknown>, now: number): boolean {
  const trap = form[HONEYPOT_FIELD];
  if (typeof trap === "string" && trap.trim() !== "") return true;
  const started = Number(form.started);
  // A missing start time (for example an old cached form) is allowed through.
  return Number.isFinite(started) && started > 0 && now - started < MIN_FILL_MS;
}

/** A salted hash of the visitor's IP address, so the address itself is never stored. */
export async function visitorKey(ip: string, siteId: string, salt: string): Promise<string> {
  const data = new TextEncoder().encode(`${salt}|${siteId}|${ip}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
