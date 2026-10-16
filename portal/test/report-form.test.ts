// Tests the report form end to end inside the Workers runtime, with a real local database.

import { SELF } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";

const FORM = "https://portal.test/report/joesbakery-com";

beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM report_events"),
    env.DB.prepare("DELETE FROM reports"),
    env.DB.prepare("DELETE FROM rate_limits"),
    env.DB.prepare("DELETE FROM sites"),
    env.DB.prepare(
      `INSERT INTO sites (id, organization, website, contact_email, reply_days, created_at)
       VALUES ('joesbakery-com', 'Joe''s <Bakery>', 'https://joesbakery.com/', 'hello@joesbakery.com', 5, '2026-10-16T00:00:00Z')`,
    ),
  ]);
});

/** Sends the form as a browser would, started long enough ago to look human. */
function send(fields: Record<string, string | string[]>, ip = "203.0.113.7") {
  const body = new URLSearchParams();
  body.append("started", String(Date.now() - 10_000));
  for (const [name, value] of Object.entries(fields)) {
    for (const v of Array.isArray(value) ? value : [value]) body.append(name, v);
  }
  return SELF.fetch(FORM, { method: "POST", body, redirect: "manual", headers: { "CF-Connecting-IP": ip } });
}

async function reportCount() {
  return (await env.DB.prepare("SELECT count(*) AS n FROM reports").first<{ n: number }>())!.n;
}

describe("report form page", () => {
  it("shows the form for a known website, with safe headers", async () => {
    const res = await SELF.fetch(FORM);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("<h1>Report an accessibility problem</h1>");
    expect(html).toContain(`<label for="description">What went wrong? (required)</label>`);
    expect(html).toContain("Joe&#39;s &lt;Bakery&gt;");
    expect(res.headers.get("Content-Security-Policy")).toContain("script-src 'none'");
  });

  it("shows a friendly page for an unknown website", async () => {
    const res = await SELF.fetch("https://portal.test/report/nobody-com");
    expect(res.status).toBe(404);
    expect(await res.text()).toContain("We couldn&#39;t find that report form.");
  });
});

describe("sending a report", () => {
  it("saves the report, records when it arrived, and shows a reference number", async () => {
    const res = await send({
      description: "The Order button can't be reached with Tab.",
      page: "/shop",
      email: "visitor@example.com",
      assistive: ["keyboard", "screen-reader"],
    });
    expect(res.status).toBe(303);
    expect(res.headers.get("Location")).toBe("/report/joesbakery-com/thanks?ref=R-0001");

    const report = await env.DB.prepare("SELECT * FROM reports").first<Record<string, unknown>>();
    expect(report).toMatchObject({
      site_id: "joesbakery-com",
      description: "The Order button can't be reached with Tab.",
      page: "/shop",
      email: "visitor@example.com",
      assistive_tech: '["keyboard","screen-reader"]',
      status: "new",
    });
    const event = await env.DB.prepare("SELECT kind, at FROM report_events").first<{ kind: string; at: string }>();
    expect(event).toEqual({ kind: "received", at: report!.received_at });

    const thanks = await SELF.fetch("https://portal.test/report/joesbakery-com/thanks?ref=R-0001");
    expect(await thanks.text()).toContain(`<span class="reference">R-0001</span>`);
  });

  it("shows clear errors and keeps what the visitor typed", async () => {
    const res = await send({ description: "", email: "not-an-email", page: "<b>home</b>" });
    expect(res.status).toBe(400);
    const html = await res.text();
    expect(html).toContain("<title>Error: Report an accessibility problem");
    expect(html).toContain("Please fix 2 things");
    expect(html).toContain(`<a href="#description">Please tell us what went wrong.</a>`);
    expect(html).toMatch(/id="email"[^>]*aria-invalid="true"|aria-invalid="true"[^>]*id="email"/);
    expect(html).toContain("value=\"&lt;b&gt;home&lt;/b&gt;\"");
    expect(await reportCount()).toBe(0);
  });

  it("does not show a made-up reference number", async () => {
    const html = await (await SELF.fetch("https://portal.test/report/joesbakery-com/thanks?ref=<script>")).text();
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("reference number");
  });
});

describe("safeguards", () => {
  it("quietly ignores robots that fill in the hidden field", async () => {
    const res = await send({ description: "Buy cheap watches", website: "http://spam.example" });
    expect(res.headers.get("Location")).toBe("/report/joesbakery-com/thanks");
    expect(await reportCount()).toBe(0);
  });

  it("quietly ignores forms sent faster than a person could", async () => {
    const body = new URLSearchParams({ description: "fast", started: String(Date.now()) });
    const res = await SELF.fetch(FORM, { method: "POST", body, redirect: "manual" });
    expect(res.status).toBe(303);
    expect(await reportCount()).toBe(0);
  });

  it("asks people to wait after 5 reports in an hour, per visitor", async () => {
    for (let i = 0; i < 5; i++) expect((await send({ description: `report ${i}` })).status).toBe(303);
    const sixth = await send({ description: "one more" });
    expect(sixth.status).toBe(429);
    expect(await sixth.text()).toContain("Please wait a little");
    expect((await send({ description: "someone else" }, "198.51.100.9")).status).toBe(303);
    expect(await reportCount()).toBe(6);
  });

  it("never stores the visitor's IP address", async () => {
    await send({ description: "hello" });
    const rows = await env.DB.prepare("SELECT key FROM rate_limits").all<{ key: string }>();
    expect(rows.results[0].key).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(rows.results)).not.toContain("203.0.113.7");
  });
});
