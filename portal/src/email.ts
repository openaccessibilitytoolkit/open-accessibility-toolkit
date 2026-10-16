// The emails the portal sends through Resend: a notification to the owner and an
// automatic reply to the visitor. Every email sent, skipped or failed is written
// to the report's timeline, so nothing goes missing silently.

import { addEvent, reference, type Site } from "./db.js";
import { formatTime } from "./timeline.js";
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
  /** Always set: the portal refuses to run without it (see missingSettings). */
  HASH_SALT?: string;
  EMAIL_FROM: string;
  TIME_ZONE: string;
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

/**
 * Turns plain text into simple, readable HTML paragraphs. Only our own `action`
 * link is clickable; links in visitors' text stay plain text, so they can't be
 * used to trick the owner.
 */
function htmlBody(title: string, paragraphs: string[], action?: { text: string; href: string }): string {
  const body = paragraphs
    .map((p) => `<p style="margin:0 0 16px">${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
    .concat(action ? [`<p style="margin:0 0 16px"><a href="${escapeHtml(action.href)}">${escapeHtml(action.text)}</a></p>`] : [])
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

export function ownerNotification(
  site: Site,
  reportId: number,
  input: ReportInput,
  receivedAt: Date,
  options: { portalOrigin: string; timeZone: string },
): OutgoingEmail {
  const ref = reference(reportId);
  const title = `New accessibility report ${ref} for ${headerSafe(site.organization)}`;
  const howUsed = input.assistiveTech.map((t) => ASSISTIVE_TECH[t]).join("; ");
  const reportUrl = `${options.portalOrigin}/admin/reports/${reportId}`;
  const paragraphs = [
    `Received: ${formatTime(receivedAt, options.timeZone)}`,
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
    text: [title, "", ...paragraphs.flatMap((p) => [p, ""]), `Open this report: ${reportUrl}`, ""].join("\n"),
    html: htmlBody(title, paragraphs, { text: `Open report ${ref} in your portal`, href: reportUrl }),
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
  const hash = await visitorKey(visitorEmail.toLowerCase(), "auto-reply", env.HASH_SALT!);
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
  portalOrigin: string,
  now: () => Date = () => new Date(),
): Promise<void> {
  if (!env.RESEND_API_KEY) {
    await addEvent(env.DB, reportId, "emails_not_set_up", "No emails were sent because email is not set up yet.", now());
    return;
  }
  const day = today(receivedAt);

  const owner = ownerNotification(site, reportId, input, receivedAt, { portalOrigin, timeZone: env.TIME_ZONE });
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

/** The one-time login link email. */
export function loginEmail(to: string, link: string, minutes: number): OutgoingEmail {
  const title = "Your login link for the accessibility portal";
  const paragraphs = [
    `Use the link below to log in to your accessibility portal. It works once and expires in ${minutes} minutes.`,
    "If you didn't ask to log in, you can ignore this email. Nobody can log in without this link.",
  ];
  return {
    to: [to],
    subject: title,
    text: [title, "", paragraphs[0], "", link, "", paragraphs[1], ""].join("\n"),
    html: htmlBody(title, paragraphs, { text: "Log in to your accessibility portal", href: link }),
    idempotencyKey: `login-${crypto.randomUUID()}`,
  };
}

/** Sends a login link, counting it toward today's emails. Problems are logged, not shown, so nobody learns who is an admin. */
export async function sendLoginEmail(env: EmailEnv, to: string, link: string, minutes: number): Promise<void> {
  if (!env.RESEND_API_KEY) {
    console.error("A login link was requested, but email is not set up (RESEND_API_KEY is missing).");
    return;
  }
  await countEmail(env.DB, today(new Date()));
  const result = await sendEmail(
    env.RESEND_API_KEY,
    fromAddress(env.EMAIL_FROM, "Accessibility portal"),
    loginEmail(to, link, minutes),
  );
  if (!result.ok) console.error(`Login link email could not be sent: ${result.error}`);
}

/** What a test email attempt found, in plain English. */
export interface TestEmailResult {
  ok: boolean;
  message: string;
  detail?: string;
}

/** Sends a test email to an admin and explains any problem in plain words. */
export async function sendTestEmail(env: EmailEnv, to: string): Promise<TestEmailResult> {
  if (!env.RESEND_API_KEY) {
    return { ok: false, message: "Email isn't connected yet, so no test email could be sent." };
  }
  await countEmail(env.DB, today(new Date()));
  const title = "Test email from your accessibility portal";
  const text = "This is a test. If you can read it, your portal can send you emails about new accessibility reports.";
  const result = await sendEmail(env.RESEND_API_KEY, fromAddress(env.EMAIL_FROM, "Accessibility portal"), {
    to: [to],
    subject: title,
    text: `${title}\n\n${text}\n`,
    html: htmlBody(title, [text]),
    idempotencyKey: `test-${crypto.randomUUID()}`,
  });
  if (result.ok) {
    return { ok: true, message: `Test email sent to ${to}. Check your inbox, and your spam folder if it isn't there.` };
  }
  const error = result.error.toLowerCase();
  if (error.includes("testing emails") || error.includes("own email")) {
    return {
      ok: false,
      message:
        "Resend only lets you send to the address you signed up with until you verify your domain. Log in with that address, or verify your domain.",
      detail: result.error,
    };
  }
  if (error.includes("domain") && (error.includes("verif") || error.includes("not"))) {
    return {
      ok: false,
      message: "The domain in your sending address isn't verified in Resend yet. Finish the domain step in Resend.",
      detail: result.error,
    };
  }
  if (error.startsWith("401") || error.includes("api key")) {
    return { ok: false, message: "Resend didn't accept your API key. Create a new one and save it again.", detail: result.error };
  }
  return { ok: false, message: "The test email couldn't be sent.", detail: result.error };
}
