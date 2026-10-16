// The emails the portal sends through Resend: a notification to the owner and an
// automatic reply to the visitor. Every email sent, skipped or failed is written
// to the report's timeline, so nothing goes missing silently.

import { addEvent, reference, type Site } from "./db.js";
import { visitorKey } from "./safeguards.js";
import { ASSISTIVE_TECH, isEmail, type ReportInput } from "./validate.js";

/** Resend's free plan allows 100 emails a day. Auto-replies pause after this many. */
export const AUTO_REPLY_DAILY_LIMIT = 90;

export interface OutgoingEmail {
  to: string[];
  subject: string;
  text: string;
  html: string;
  replyTo?: string;
  /** Stops the same email being sent twice if a request is retried. */
  idempotencyKey: string;
}

type SendResult = { ok: true } | { ok: false; error: string };

export interface EmailEnv {
  DB: D1Database;
  HASH_SALT: string;
  EMAIL_FROM: string;
  RESEND_API_KEY?: string;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Keeps names safe to use in an email header. */
function headerSafe(text: string): string {
  return text.replace(/[\r\n<>"]/g, " ").replace(/\s+/g, " ").trim();
}

/** "Accessibility reports <a@b.com>" becomes "Joe's Bakery <a@b.com>". */
export function fromAddress(emailFrom: string, organization: string): string {
  const address = /<([^>]+)>/.exec(emailFrom)?.[1] ?? emailFrom.trim();
  return `${headerSafe(organization)} <${address}>`;
}

export function formatTime(at: Date): string {
  return `${at.toLocaleString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  })} UTC`;
}

function host(site: Site): string {
  return new URL(site.website).host;
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

/** Everyone who should hear about new reports for this website, without repeats. */
export function ownerRecipients(site: Site): string[] {
  let extra: unknown = [];
  try {
    extra = JSON.parse(site.notify_emails || "[]");
  } catch {
    // A broken list shouldn't stop the main contact being notified.
  }
  const all = [site.contact_email, ...(Array.isArray(extra) ? extra : [])];
  return [...new Set(all.filter((e): e is string => typeof e === "string" && isEmail(e)).map((e) => e.toLowerCase()))];
}

/** Turns plain text into simple, readable HTML paragraphs. */
function htmlBody(title: string, paragraphs: string[]): string {
  const body = paragraphs
    .map((p) => `<p style="margin:0 0 16px">${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("\n");
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head>
<body style="margin:0;padding:24px;background:#ffffff;color:#1a1a1a;font:16px/1.6 Arial,Helvetica,sans-serif">
<h1 style="font-size:22px;margin:0 0 16px">${escapeHtml(title)}</h1>
${body}
</body>
</html>`;
}

export function ownerNotification(site: Site, reportId: number, input: ReportInput, receivedAt: Date): OutgoingEmail {
  const ref = reference(reportId);
  const title = `New accessibility report ${ref} for ${headerSafe(site.organization)}`;
  const howUsed = input.assistiveTech.map((t) => ASSISTIVE_TECH[t]).join("; ");
  const paragraphs = [
    `Received: ${formatTime(receivedAt)}`,
    `Page: ${input.page || "Not given"}`,
    `How they were using the site: ${howUsed || "Not given"}`,
    input.email
      ? `Visitor's email: ${input.email} (reply to this email to answer them)`
      : "Visitor's email: Not given",
    `What went wrong:\n${input.description}`,
    `You received this because you look after accessibility reports for ${host(site)}.`,
  ];
  return {
    to: ownerRecipients(site),
    subject: title,
    text: [title, "", ...paragraphs.flatMap((p) => [p, ""])].join("\n"),
    html: htmlBody(title, paragraphs),
    ...(input.email ? { replyTo: input.email } : {}),
    idempotencyKey: `report-${reportId}-owner`,
  };
}

/** The visitor's confirmation. Fixed wording: it never repeats anything the visitor typed. */
export function autoReply(site: Site, reportId: number, visitorEmail: string): OutgoingEmail {
  const ref = reference(reportId);
  const org = headerSafe(site.organization);
  const title = `We've received your accessibility report (${ref})`;
  const paragraphs = [
    `Thank you for telling ${org} about an accessibility problem on ${host(site)}.`,
    `Your reference number is ${ref}.`,
    `We aim to reply within ${plural(site.reply_days, "working day")}. If you'd like to add anything, just reply to this email.`,
    org,
  ];
  return {
    to: [visitorEmail],
    subject: title,
    text: [title, "", ...paragraphs.flatMap((p) => [p, ""])].join("\n"),
    html: htmlBody(title, paragraphs),
    replyTo: site.contact_email,
    idempotencyKey: `report-${reportId}-auto-reply`,
  };
}

export async function sendEmail(apiKey: string, from: string, email: OutgoingEmail): Promise<SendResult> {
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": email.idempotencyKey,
      },
      body: JSON.stringify({
        from,
        to: email.to,
        subject: email.subject,
        text: email.text,
        html: email.html,
        ...(email.replyTo ? { reply_to: email.replyTo } : {}),
      }),
    });
    if (res.ok) return { ok: true };
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    return { ok: false, error: `${res.status} ${body.message ?? res.statusText}`.trim() };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

function today(at: Date): string {
  return at.toISOString().slice(0, 10);
}

/** Adds one to today's email count and returns the count before this email. */
async function countEmail(db: D1Database, day: string): Promise<number> {
  const row = await db
    .prepare(
      `INSERT INTO email_counts (day, count) VALUES (?, 1)
       ON CONFLICT (day) DO UPDATE SET count = count + 1 RETURNING count`,
    )
    .bind(day)
    .first<{ count: number }>();
  return (row?.count ?? 1) - 1;
}

async function sentToday(db: D1Database, day: string): Promise<number> {
  const row = await db.prepare("SELECT count FROM email_counts WHERE day = ?").bind(day).first<{ count: number }>();
  return row?.count ?? 0;
}

/** True the first time today this address asks for an auto-reply. */
async function firstAutoReplyToday(env: EmailEnv, visitorEmail: string, day: string): Promise<boolean> {
  const hash = await visitorKey(visitorEmail.toLowerCase(), "auto-reply", env.HASH_SALT);
  const result = await env.DB.prepare("INSERT OR IGNORE INTO auto_replies (email_hash, day) VALUES (?, ?)")
    .bind(hash, day)
    .run();
  return result.meta.changes === 1;
}

/** Sends the emails for a new report and records each outcome in its timeline. */
export async function emailNewReport(
  env: EmailEnv,
  site: Site,
  reportId: number,
  input: ReportInput,
  receivedAt: Date,
  now: () => Date = () => new Date(),
): Promise<void> {
  if (!env.RESEND_API_KEY) {
    await addEvent(env.DB, reportId, "emails_not_set_up", "No emails were sent because email is not set up yet.", now());
    return;
  }
  const day = today(receivedAt);

  const owner = ownerNotification(site, reportId, input, receivedAt);
  await countEmail(env.DB, day);
  const ownerResult = await sendEmail(env.RESEND_API_KEY, fromAddress(env.EMAIL_FROM, site.organization), owner);
  await addEvent(
    env.DB,
    reportId,
    ownerResult.ok ? "owner_notified" : "email_failed",
    ownerResult.ok
      ? `Sent to ${owner.to.join(", ")}`
      : `Owner notification could not be sent: ${ownerResult.error}`,
    now(),
  );

  if (!input.email) return;
  if ((await sentToday(env.DB, day)) >= AUTO_REPLY_DAILY_LIMIT) {
    await addEvent(env.DB, reportId, "auto_reply_skipped", "Daily email limit reached, so no auto-reply was sent.", now());
    return;
  }
  if (!(await firstAutoReplyToday(env, input.email, day))) {
    await addEvent(env.DB, reportId, "auto_reply_skipped", "This address already received an auto-reply today.", now());
    return;
  }
  await countEmail(env.DB, day);
  const replyResult = await sendEmail(
    env.RESEND_API_KEY,
    fromAddress(env.EMAIL_FROM, site.organization),
    autoReply(site, reportId, input.email),
  );
  await addEvent(
    env.DB,
    reportId,
    replyResult.ok ? "auto_reply_sent" : "email_failed",
    replyResult.ok ? "Auto-reply sent to the visitor" : `Auto-reply could not be sent: ${replyResult.error}`,
    now(),
  );
}
