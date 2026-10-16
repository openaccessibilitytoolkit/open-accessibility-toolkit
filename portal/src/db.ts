// Reading and writing the portal's database (Cloudflare D1).

import type { ReportInput } from "./validate.js";

export interface Site {
  id: string;
  organization: string;
  website: string;
  contact_email: string;
  reply_days: number;
  phone: string | null;
  /** JSON list of extra addresses to notify about new reports. */
  notify_emails: string;
}

export function getSite(db: D1Database, id: string): Promise<Site | null> {
  return db
    .prepare("SELECT id, organization, website, contact_email, reply_days, phone, notify_emails FROM sites WHERE id = ?")
    .bind(id)
    .first<Site>();
}

/** The reference number visitors see, e.g. R-0042. */
export function reference(reportId: number): string {
  return `R-${String(reportId).padStart(4, "0")}`;
}

export async function createReport(db: D1Database, siteId: string, input: ReportInput, now: Date): Promise<number> {
  const at = now.toISOString();
  const row = await db
    .prepare(
      `INSERT INTO reports (site_id, description, page, email, assistive_tech, received_at)
       VALUES (?, ?, ?, ?, ?, ?) RETURNING id`,
    )
    .bind(siteId, input.description, input.page || null, input.email || null, JSON.stringify(input.assistiveTech), at)
    .first<{ id: number }>();
  if (!row) throw new Error("The report could not be saved.");
  await db
    .prepare("INSERT INTO report_events (report_id, at, kind) VALUES (?, ?, 'received')")
    .bind(row.id, at)
    .run();
  return row.id;
}

/**
 * Counts one more submission for this key in the current window and returns the
 * new count. A new window starts when the old one is over.
 */
export async function countSubmission(db: D1Database, key: string, now: number, windowMs: number): Promise<number> {
  const row = await db
    .prepare(
      `INSERT INTO rate_limits (key, window_start, count) VALUES (?1, ?2, 1)
       ON CONFLICT (key) DO UPDATE SET
         count = CASE WHEN window_start <= ?3 THEN 1 ELSE count + 1 END,
         window_start = CASE WHEN window_start <= ?3 THEN ?2 ELSE window_start END
       RETURNING count`,
    )
    .bind(key, now, now - windowMs)
    .first<{ count: number }>();
  return row?.count ?? 1;
}

export async function addEvent(db: D1Database, reportId: number, kind: string, detail: string | null, at: Date): Promise<void> {
  await db
    .prepare("INSERT INTO report_events (report_id, at, kind, detail) VALUES (?, ?, ?, ?)")
    .bind(reportId, at.toISOString(), kind, detail)
    .run();
}
