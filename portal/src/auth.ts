// Logging in without passwords: one-time links sent by email, then a session
// cookie. Only hashes of the secrets are stored, so a copy of the database
// can't be used to log in.

import { isEmail } from "./validate.js";

export const LOGIN_LINK_MINUTES = 15;
export const SESSION_DAYS = 7;
/** At most this many login links per address per 15 minutes. */
export const LOGIN_LINKS_PER_WINDOW = 3;
export const SESSION_COOKIE = "a11y_session";

const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** The admin list from settings, cleaned up: lower case, no blanks, real addresses only. */
export function adminEmails(setting: string | undefined): string[] {
  return (setting ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter((e) => isEmail(e));
}

export function isAdmin(setting: string | undefined, email: string): boolean {
  return adminEmails(setting).includes(email.trim().toLowerCase());
}

/**
 * Creates a one-time login link secret for an admin, or returns null if this
 * address has asked for too many links recently.
 */
export async function createLoginToken(db: D1Database, email: string, now: number): Promise<string | null> {
  const recent = await db
    .prepare("SELECT count(*) AS n FROM login_tokens WHERE email = ? AND created_at > ?")
    .bind(email, now - LOGIN_LINK_MINUTES * MINUTE)
    .first<{ n: number }>();
  if ((recent?.n ?? 0) >= LOGIN_LINKS_PER_WINDOW) return null;
  const token = randomToken();
  await db
    .prepare("INSERT INTO login_tokens (token_hash, email, created_at, expires_at) VALUES (?, ?, ?, ?)")
    .bind(await sha256(token), email, now, now + LOGIN_LINK_MINUTES * MINUTE)
    .run();
  return token;
}

/** Uses up a login link. Returns the admin's email, or null if the link is wrong, used or expired. */
export async function consumeLoginToken(db: D1Database, token: string, now: number): Promise<string | null> {
  if (!token) return null;
  const row = await db
    .prepare(
      `UPDATE login_tokens SET used_at = ?1
       WHERE token_hash = ?2 AND used_at IS NULL AND expires_at > ?1
       RETURNING email`,
    )
    .bind(now, await sha256(token))
    .first<{ email: string }>();
  return row?.email ?? null;
}

export async function createSession(db: D1Database, email: string, now: number): Promise<string> {
  const token = randomToken();
  await db
    .prepare("INSERT INTO sessions (token_hash, email, expires_at) VALUES (?, ?, ?)")
    .bind(await sha256(token), email, now + SESSION_DAYS * DAY)
    .run();
  return token;
}

/** The logged-in admin's email, or null. Admins removed from the list are logged out. */
export async function getSessionEmail(
  db: D1Database,
  token: string | undefined,
  now: number,
  adminSetting: string | undefined,
): Promise<string | null> {
  if (!token) return null;
  const row = await db
    .prepare("SELECT email FROM sessions WHERE token_hash = ? AND expires_at > ?")
    .bind(await sha256(token), now)
    .first<{ email: string }>();
  return row && isAdmin(adminSetting, row.email) ? row.email : null;
}

/**
 * Clears out what's no longer needed: expired login links and sessions, old
 * robot-counting rows, and auto-reply records from before yesterday. Runs on
 * each login, so the database doesn't keep piling up.
 */
export async function deleteExpired(db: D1Database, now: number): Promise<void> {
  const beforeYesterday = new Date(now - DAY).toISOString().slice(0, 10);
  await db.batch([
    db.prepare("DELETE FROM login_tokens WHERE expires_at <= ?").bind(now),
    db.prepare("DELETE FROM sessions WHERE expires_at <= ?").bind(now),
    db.prepare("DELETE FROM rate_limits WHERE window_start <= ?").bind(now - DAY),
    db.prepare("DELETE FROM auto_replies WHERE day < ?").bind(beforeYesterday),
  ]);
}

export async function deleteSession(db: D1Database, token: string | undefined): Promise<void> {
  if (token) await db.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await sha256(token)).run();
}
