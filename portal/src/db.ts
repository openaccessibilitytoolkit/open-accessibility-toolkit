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
  /** Problems the owner knows about, one per line. */
  known_problems: string;
  updated_at: string | null;
  /** When a person last reviewed this website's statement (or saved its details). */
  reviewed_at: string | null;
}

const SITE_COLUMNS =
  "id, organization, website, contact_email, reply_days, phone, notify_emails, known_problems, updated_at, reviewed_at";

export function getSite(db: D1Database, id: string): Promise<Site | null> {
  return db
    .prepare(`SELECT ${SITE_COLUMNS} FROM sites WHERE id = ?`)
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

// ---- For the owner's inbox ----

export interface ReportRow {
  id: number;
  site_id: string;
  website: string;
  organization: string;
  description: string;
  page: string | null;
  email: string | null;
  assistive_tech: string;
  status: string;
  received_at: string;
}

export interface ReportFilter {
  siteId?: string;
  status?: string;
}

function whereClause(filter: ReportFilter): { sql: string; params: string[] } {
  const parts: string[] = [];
  const params: string[] = [];
  if (filter.siteId) {
    parts.push("r.site_id = ?");
    params.push(filter.siteId);
  }
  if (filter.status) {
    parts.push("r.status = ?");
    params.push(filter.status);
  }
  return { sql: parts.length ? `WHERE ${parts.join(" AND ")}` : "", params };
}

const REPORT_COLUMNS = `r.id, r.site_id, s.website, s.organization, r.description, r.page, r.email,
  r.assistive_tech, r.status, r.received_at`;

export async function listReports(
  db: D1Database,
  filter: ReportFilter,
  limit: number,
  offset: number,
): Promise<ReportRow[]> {
  const where = whereClause(filter);
  const rows = await db
    .prepare(
      `SELECT ${REPORT_COLUMNS} FROM reports r JOIN sites s ON s.id = r.site_id
       ${where.sql} ORDER BY r.received_at DESC, r.id DESC LIMIT ? OFFSET ?`,
    )
    .bind(...where.params, limit, offset)
    .all<ReportRow>();
  return rows.results;
}

/** How many reports have each status, for the chosen website (or all). */
export async function countByStatus(db: D1Database, siteId?: string): Promise<Record<string, number>> {
  const where = whereClause({ siteId });
  const rows = await db
    .prepare(`SELECT r.status, count(*) AS n FROM reports r ${where.sql} GROUP BY r.status`)
    .bind(...where.params)
    .all<{ status: string; n: number }>();
  return Object.fromEntries(rows.results.map((r) => [r.status, r.n]));
}

export async function listSites(db: D1Database): Promise<Site[]> {
  const rows = await db
    .prepare(`SELECT ${SITE_COLUMNS} FROM sites ORDER BY organization`)
    .all<Site>();
  return rows.results;
}

export function getReport(db: D1Database, id: number): Promise<ReportRow | null> {
  return db
    .prepare(`SELECT ${REPORT_COLUMNS} FROM reports r JOIN sites s ON s.id = r.site_id WHERE r.id = ?`)
    .bind(id)
    .first<ReportRow>();
}

export async function listEvents(
  db: D1Database,
  reportId: number,
): Promise<{ at: string; kind: string; detail: string | null; actor: string | null }[]> {
  const rows = await db
    .prepare("SELECT at, kind, detail, actor FROM report_events WHERE report_id = ? ORDER BY at, id")
    .bind(reportId)
    .all<{ at: string; kind: string; detail: string | null; actor: string | null }>();
  return rows.results;
}

/** Changes the status and/or adds a note, recording who did it and when. */
export async function updateReport(
  db: D1Database,
  report: ReportRow,
  change: { status: string; note: string },
  actor: string,
  now: Date,
): Promise<void> {
  const at = now.toISOString();
  const statements: D1PreparedStatement[] = [];
  if (change.status !== report.status) {
    statements.push(db.prepare("UPDATE reports SET status = ? WHERE id = ?").bind(change.status, report.id));
    statements.push(
      db
        .prepare("INSERT INTO report_events (report_id, at, kind, detail, actor) VALUES (?, ?, 'status_changed', ?, ?)")
        .bind(report.id, at, `${report.status}>${change.status}`, actor),
    );
  }
  if (change.note) {
    statements.push(
      db
        .prepare("INSERT INTO report_events (report_id, at, kind, detail, actor) VALUES (?, ?, 'note', ?, ?)")
        .bind(report.id, at, change.note, actor),
    );
  }
  if (statements.length) await db.batch(statements);
}

export async function deleteReport(db: D1Database, id: number): Promise<void> {
  await db.batch([
    db.prepare("DELETE FROM report_events WHERE report_id = ?").bind(id),
    db.prepare("DELETE FROM reports WHERE id = ?").bind(id),
  ]);
}

// ---- Websites ----

export interface SiteInput {
  organization: string;
  website: string;
  contactEmail: string;
  replyDays: number;
  phone: string;
  notifyEmails: string[];
  knownProblems: string[];
}

export async function createSite(db: D1Database, id: string, input: SiteInput, now: Date): Promise<void> {
  const at = now.toISOString();
  await db
    .prepare(
      `INSERT INTO sites (id, organization, website, contact_email, reply_days, phone, notify_emails, known_problems, created_at, updated_at, reviewed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      input.organization,
      input.website,
      input.contactEmail,
      input.replyDays,
      input.phone || null,
      JSON.stringify(input.notifyEmails),
      input.knownProblems.join("\n"),
      at,
      at,
      at,
    )
    .run();
}

export async function updateSite(db: D1Database, id: string, input: SiteInput, now: Date): Promise<void> {
  await db
    .prepare(
      `UPDATE sites SET organization = ?, website = ?, contact_email = ?, reply_days = ?, phone = ?,
         notify_emails = ?, known_problems = ?, updated_at = ?, reviewed_at = ? WHERE id = ?`,
    )
    .bind(
      input.organization,
      input.website,
      input.contactEmail,
      input.replyDays,
      input.phone || null,
      JSON.stringify(input.notifyEmails),
      input.knownProblems.join("\n"),
      now.toISOString(),
      now.toISOString(),
      id,
    )
    .run();
}

export async function reportCountsBySite(db: D1Database): Promise<Record<string, number>> {
  const rows = await db.prepare("SELECT site_id, count(*) AS n FROM reports GROUP BY site_id").all<{ site_id: string; n: number }>();
  return Object.fromEntries(rows.results.map((r) => [r.site_id, r.n]));
}

/** Deletes a website with all its reports and their timelines. */
export async function deleteSite(db: D1Database, id: string): Promise<void> {
  await db.batch([
    db.prepare("DELETE FROM report_events WHERE report_id IN (SELECT id FROM reports WHERE site_id = ?)").bind(id),
    db.prepare("DELETE FROM reports WHERE site_id = ?").bind(id),
    db.prepare("DELETE FROM sites WHERE id = ?").bind(id),
  ]);
}

// ---- Monthly statement reviews ----

export type ReviewOutcome = "confirmed" | "updated";

/** Records a review: "confirmed" (still accurate) or "updated" (details were saved). */
export async function recordReview(
  db: D1Database,
  siteId: string,
  outcome: ReviewOutcome,
  actor: string,
  now: Date,
): Promise<void> {
  const at = now.toISOString();
  await db.batch([
    db.prepare("UPDATE sites SET reviewed_at = ? WHERE id = ?").bind(at, siteId),
    db
      .prepare("INSERT INTO site_reviews (site_id, at, actor, outcome) VALUES (?, ?, ?, ?)")
      .bind(siteId, at, actor, outcome),
  ]);
}

export interface Review {
  at: string;
  actor: string;
  outcome: ReviewOutcome;
}

export async function listReviews(db: D1Database, siteId: string, limit = 12): Promise<Review[]> {
  const rows = await db
    .prepare("SELECT at, actor, outcome FROM site_reviews WHERE site_id = ? ORDER BY at DESC, id DESC LIMIT ?")
    .bind(siteId, limit)
    .all<Review>();
  return rows.results;
}

export async function getSetting(db: D1Database, key: string): Promise<string | null> {
  const row = await db.prepare("SELECT value FROM settings WHERE key = ?").bind(key).first<{ value: string }>();
  return row?.value ?? null;
}

export async function setSetting(db: D1Database, key: string, value: string): Promise<void> {
  await db
    .prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value")
    .bind(key, value)
    .run();
}
