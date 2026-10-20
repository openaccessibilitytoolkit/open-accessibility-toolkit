// Tests the emails with a pretend Resend: no real emails are sent.

import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Site } from "../src/db.js";
import {
  AUTO_REPLY_DAILY_LIMIT,
  autoReply,
  emailNewReport,
  fromAddress,
  ownerNotification,
  ownerRecipients,
} from "../src/email.js";
import type { ReportInput } from "../src/validate.js";

const site: Site = {
  id: "joesbakery-com",
  organization: "Joe's Bakery",
  website: "https://joesbakery.com/",
  contact_email: "hello@joesbakery.com",
  reply_days: 5,
  phone: null,
  notify_emails: '["web@joesbakery.com", "HELLO@joesbakery.com"]',
  known_problems: "",
  updated_at: null,
  reviewed_at: null,
};

const input: ReportInput = {
  description: "The <b>Order</b> button can't be reached with Tab. Visit http://evil.example now!",
  page: "/shop",
  email: "visitor@example.com",
  assistiveTech: ["keyboard", "screen-reader"],
};

const receivedAt = new Date("2026-10-16T20:18:00.000Z");

describe("ownerNotification", () => {
  const email = ownerNotification(site, 7, input, receivedAt, {
    portalOrigin: "https://portal.test",
    timeZone: "America/New_York",
  });

  it("goes to the contact email and extra addresses, once each", () => {
    expect(email.to).toEqual(["hello@joesbakery.com", "web@joesbakery.com"]);
    expect(ownerRecipients({ ...site, notify_emails: "not json" })).toEqual(["hello@joesbakery.com"]);
  });

  it("has everything the owner needs to act on it", () => {
    expect(email.subject).toBe("New accessibility report R-0007 for Joe's Bakery");
    expect(email.text).toContain("Received: Oct 16, 2026, 4:18 PM EDT");
    expect(email.text).toContain("Open this report: https://portal.test/admin/reports/7");
    expect(email.text).toContain("Page: /shop");
    expect(email.text).toContain("How they were using the site: Keyboard only, no mouse; A screen reader");
    expect(email.text).toContain("Visitor's email: visitor@example.com");
    expect(email.text).toContain("The <b>Order</b> button");
    expect(email.replyTo).toBe("visitor@example.com");
  });

  it("links to the report in the portal, but never makes the visitor's links clickable", () => {
    expect(email.html).toContain('<a href="https://portal.test/admin/reports/7">Open report R-0007 in your portal</a>');
    expect(email.html).not.toContain('href="http://evil.example');
  });

  it("shows the visitor's text safely in the HTML version", () => {
    expect(email.html).toContain("The &lt;b&gt;Order&lt;/b&gt; button");
    expect(email.html).not.toContain("<b>Order</b>");
    expect(email.html).toContain('<html lang="en">');
  });
});

describe("autoReply", () => {
  const email = autoReply(site, 7, "visitor@example.com");

  it("thanks the visitor and gives the reference number and reply time", () => {
    expect(email.to).toEqual(["visitor@example.com"]);
    expect(email.subject).toBe("We've received your accessibility report (R-0007)");
    expect(email.text).toContain("Your reference number is R-0007.");
    expect(email.text).toContain("We aim to reply within 5 working days.");
    expect(email.replyTo).toBe("hello@joesbakery.com");
  });

  it("never repeats anything the visitor typed", () => {
    for (const part of [email.subject, email.text, email.html]) {
      expect(part).not.toContain("Order");
      expect(part).not.toContain("evil.example");
      expect(part).not.toContain("/shop");
    }
  });
});

describe("fromAddress", () => {
  it("shows the organization's name with the configured address", () => {
    expect(fromAddress("Accessibility reports <onboarding@resend.dev>", "Joe's Bakery")).toBe(
      "Joe's Bakery <onboarding@resend.dev>",
    );
    expect(fromAddress("reports@joesbakery.com", 'Evil "Name"\r\nBcc: x')).toBe("Evil Name Bcc: x <reports@joesbakery.com>");
  });
});

describe("emailNewReport", () => {
  let sent: { to: string[]; subject: string; text: string; from: string; reply_to?: string }[];
  let resendAnswer: () => Response;

  beforeEach(async () => {
    sent = [];
    resendAnswer = () => Response.json({ id: "email-id" });
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      expect(String(url)).toBe("https://api.resend.com/emails");
      sent.push(JSON.parse(String(init?.body)));
      return resendAnswer();
    });
    await env.DB.batch([
      env.DB.prepare("DELETE FROM report_events"),
      env.DB.prepare("DELETE FROM reports"),
      env.DB.prepare("DELETE FROM auto_replies"),
      env.DB.prepare("DELETE FROM email_counts"),
      env.DB.prepare("DELETE FROM sites"),
      env.DB.prepare(
        `INSERT INTO sites (id, organization, website, contact_email, reply_days, created_at)
         VALUES ('joesbakery-com', 'Joe''s Bakery', 'https://joesbakery.com/', 'hello@joesbakery.com', 5, '2026-10-16')`,
      ),
    ]);
  });

  afterEach(() => vi.restoreAllMocks());

  const emailEnv = (key = "re_test") => ({
    ...env,
    RESEND_API_KEY: key,
    EMAIL_FROM: "Accessibility reports <onboarding@resend.dev>",
    TIME_ZONE: "America/New_York",
  });

  async function newReport(email = "visitor@example.com"): Promise<number> {
    const row = await env.DB.prepare(
      "INSERT INTO reports (site_id, description, email, received_at) VALUES ('joesbakery-com', 'x', ?, ?) RETURNING id",
    )
      .bind(email || null, receivedAt.toISOString())
      .first<{ id: number }>();
    return row!.id;
  }

  async function timeline(reportId: number): Promise<string[]> {
    const rows = await env.DB.prepare("SELECT kind FROM report_events WHERE report_id = ? ORDER BY id")
      .bind(reportId)
      .all<{ kind: string }>();
    return rows.results.map((r) => r.kind);
  }

  it("notifies the owner and auto-replies, and records both in the timeline", async () => {
    const id = await newReport();
    await emailNewReport(emailEnv(), site, id, input, receivedAt, "https://portal.test");
    expect(sent.map((e) => e.to)).toEqual([["hello@joesbakery.com", "web@joesbakery.com"], ["visitor@example.com"]]);
    expect(sent[0].from).toBe("Joe's Bakery <onboarding@resend.dev>");
    expect(await timeline(id)).toEqual(["owner_notified", "auto_reply_sent"]);
  });

  it("only notifies the owner when the visitor gave no email", async () => {
    const id = await newReport("");
    await emailNewReport(emailEnv(), site, id, { ...input, email: "" }, receivedAt, "https://portal.test");
    expect(sent).toHaveLength(1);
    expect(await timeline(id)).toEqual(["owner_notified"]);
  });

  it("sends at most one auto-reply per address per day", async () => {
    const first = await newReport();
    const second = await newReport();
    await emailNewReport(emailEnv(), site, first, input, receivedAt, "https://portal.test");
    await emailNewReport(emailEnv(), site, second, { ...input, email: "VISITOR@example.com" }, receivedAt, "https://portal.test");
    expect(sent.filter((e) => e.to[0] === "visitor@example.com" || e.to[0] === "VISITOR@example.com")).toHaveLength(1);
    expect(await timeline(second)).toEqual(["owner_notified", "auto_reply_skipped"]);
  });

  it(`pauses auto-replies after ${AUTO_REPLY_DAILY_LIMIT} emails in a day, but keeps notifying the owner`, async () => {
    await env.DB.prepare("INSERT INTO email_counts (day, count) VALUES ('2026-10-16', ?)")
      .bind(AUTO_REPLY_DAILY_LIMIT)
      .run();
    const id = await newReport();
    await emailNewReport(emailEnv(), site, id, input, receivedAt, "https://portal.test");
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toContain("hello@joesbakery.com");
    expect(await timeline(id)).toEqual(["owner_notified", "auto_reply_skipped"]);
  });

  it("records a failed email instead of losing it", async () => {
    resendAnswer = () => Response.json({ message: "The from address is not verified" }, { status: 403 });
    const id = await newReport("");
    await emailNewReport(emailEnv(), site, id, { ...input, email: "" }, receivedAt, "https://portal.test");
    const row = await env.DB.prepare("SELECT kind, detail FROM report_events WHERE report_id = ?")
      .bind(id)
      .first<{ kind: string; detail: string }>();
    expect(row).toEqual({
      kind: "email_failed",
      detail: "Owner notification could not be sent: 403 The from address is not verified",
    });
  });

  it("still saves reports when email isn't set up, and says so", async () => {
    const id = await newReport();
    await emailNewReport(emailEnv(""), site, id, input, receivedAt, "https://portal.test");
    expect(sent).toHaveLength(0);
    expect(await timeline(id)).toEqual(["emails_not_set_up"]);
  });
});
