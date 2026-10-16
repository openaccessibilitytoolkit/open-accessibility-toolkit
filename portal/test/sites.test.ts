// Tests the Websites pages, the public accessibility statement, and the footer links.

import { SELF } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { createSession } from "../src/auth.js";
import { normalizeWebsite, siteIdFor, validateSite } from "../src/site-form.js";

const ORIGIN = "https://portal.test";

beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM report_events"),
    env.DB.prepare("DELETE FROM reports"),
    env.DB.prepare("DELETE FROM sessions"),
    env.DB.prepare("DELETE FROM sites"),
    env.DB.prepare(
      `INSERT INTO sites (id, organization, website, contact_email, reply_days, phone, notify_emails, known_problems, created_at, updated_at)
       VALUES ('joesbakery-com', 'Joe''s <Bakery>', 'https://joesbakery.com/', 'hello@joesbakery.com', 3, '555-0100',
               '["web@joesbakery.com"]', 'Some photos have no text description yet.
The menu PDF can''t be read by screen readers.', '2026-10-01T12:00:00Z', '2026-10-10T12:00:00Z')`,
    ),
    env.DB.prepare(
      `INSERT INTO reports (id, site_id, description, received_at) VALUES
       (1, 'joesbakery-com', 'a', '2026-10-15T14:00:00Z'), (2, 'joesbakery-com', 'b', '2026-10-15T15:00:00Z')`,
    ),
    env.DB.prepare("INSERT INTO report_events (report_id, at, kind) VALUES (1, '2026-10-15T14:00:00Z', 'received')"),
  ]);
});

async function cookie(): Promise<string> {
  return `__Host-a11y_session=${await createSession(env.DB, "owner@joesbakery.com", Date.now())}`;
}

async function get(path: string, withLogin = true) {
  return SELF.fetch(`${ORIGIN}${path}`, { redirect: "manual", headers: withLogin ? { Cookie: await cookie() } : {} });
}

async function post(path: string, fields: Record<string, string>) {
  return SELF.fetch(`${ORIGIN}${path}`, {
    method: "POST",
    redirect: "manual",
    body: new URLSearchParams(fields),
    headers: { Origin: ORIGIN, "Content-Type": "application/x-www-form-urlencoded", Cookie: await cookie() },
  });
}

const cafe = {
  organization: "Joe's Cafe",
  website: "www.JoesCafe.com",
  contactEmail: "cafe@joescafe.com",
  replyDays: "5",
  phone: "",
  notifyEmails: "Web@JoesCafe.com\n\nweb@joescafe.com\nowner@joescafe.com",
  knownProblems: "  Our booking calendar is hard to use with a keyboard.  \n\n",
};

describe("checking the website form", () => {
  it("cleans up addresses and lists", () => {
    const { input, errors } = validateSite(cafe);
    expect(errors).toEqual([]);
    expect(input).toEqual({
      organization: "Joe's Cafe",
      website: "https://www.joescafe.com/",
      contactEmail: "cafe@joescafe.com",
      replyDays: 5,
      phone: "",
      notifyEmails: ["web@joescafe.com", "owner@joescafe.com"],
      knownProblems: ["Our booking calendar is hard to use with a keyboard."],
    });
  });

  it("explains every problem in plain words", () => {
    const { errors } = validateSite({
      organization: "",
      website: "not a website",
      contactEmail: "nope",
      replyDays: "0",
      phone: "call me",
      notifyEmails: "fine@example.com\nbroken",
      knownProblems: "x".repeat(301),
    });
    expect(errors.map((e) => e.field)).toEqual([
      "organization",
      "website",
      "contactEmail",
      "replyDays",
      "phone",
      "notifyEmails",
      "knownProblems",
    ]);
    expect(errors.find((e) => e.field === "notifyEmails")!.message).toContain('"broken" is not an email address');
  });

  it("makes a short, fixed name from the address", () => {
    expect(siteIdFor(normalizeWebsite("www.Joes-Cafe.co.uk/menu")!)).toBe("joes-cafe-co-uk");
  });
});

describe("the Websites pages", () => {
  it("need a login", async () => {
    expect((await get("/admin/sites", false)).headers.get("Location")).toBe("/admin/login");
  });

  it("list each website with its report count", async () => {
    const html = await (await get("/admin/sites")).text();
    expect(html).toContain(`<a href="/admin/sites/joesbakery-com">joesbakery.com</a>`);
    expect(html).toContain("Joe&#39;s &lt;Bakery&gt;");
    expect(html).toContain("<td>2</td>");
  });

  it("add a website, then show its links", async () => {
    const res = await post("/admin/sites", cafe);
    expect(res.headers.get("Location")).toBe("/admin/sites/joescafe-com?saved=1");
    const site = await env.DB.prepare("SELECT * FROM sites WHERE id = 'joescafe-com'").first<Record<string, unknown>>();
    expect(site).toMatchObject({
      organization: "Joe's Cafe",
      website: "https://www.joescafe.com/",
      notify_emails: '["web@joescafe.com","owner@joescafe.com"]',
      known_problems: "Our booking calendar is hard to use with a keyboard.",
    });
    const page = await (await get("/admin/sites/joescafe-com?saved=1")).text();
    expect(page).toContain("Your changes were saved.");
    // The footer code is shown as text in a copy box, so it appears escaped.
    expect(page).toContain(`href=&quot;${ORIGIN}/statement/joescafe-com&quot;&gt;Accessibility statement&lt;/a&gt;`);
    expect(page).toContain(`href=&quot;${ORIGIN}/report/joescafe-com&quot;&gt;Report an accessibility problem&lt;/a&gt;`);
    expect(page).toContain(`<a href="/statement/joescafe-com">${ORIGIN}/statement/joescafe-com</a>`);
  });

  it("refuse a website that's already set up", async () => {
    const res = await post("/admin/sites", { ...cafe, website: "https://joesbakery.com/about" });
    expect(res.status).toBe(400);
    expect(await res.text()).toContain("joesbakery.com is already set up in this portal.");
  });

  it("show the form again with clear errors", async () => {
    const res = await post("/admin/sites", { ...cafe, contactEmail: "nope" });
    expect(res.status).toBe(400);
    const html = await res.text();
    expect(html).toContain("<title>Error: Add a website");
    expect(html).toContain(`<a href="#contactEmail">Please type an email address`);
    expect(html).toContain(`value="Joe&#39;s Cafe"`);
  });

  it("save changes without changing the website's short name", async () => {
    const res = await post("/admin/sites/joesbakery-com", { ...cafe, website: "joesbakery.co.uk", knownProblems: "" });
    expect(res.headers.get("Location")).toBe("/admin/sites/joesbakery-com?saved=1");
    const site = await env.DB.prepare("SELECT website, known_problems, updated_at FROM sites WHERE id = 'joesbakery-com'").first<{
      website: string;
      known_problems: string;
      updated_at: string;
    }>();
    expect(site!.website).toBe("https://joesbakery.co.uk/");
    expect(site!.known_problems).toBe("");
    expect(site!.updated_at > "2026-10-10T12:00:00Z").toBe(true);
  });

  it("warn before deleting, then delete the website, its reports and timelines", async () => {
    const confirm = await (await get("/admin/sites/joesbakery-com/delete")).text();
    expect(confirm).toContain("Delete joesbakery.com?");
    expect(confirm).toContain("its 2 reports");
    const res = await post("/admin/sites/joesbakery-com/delete", {});
    expect(res.headers.get("Location")).toBe("/admin/sites?deleted=joesbakery.com");
    for (const table of ["sites", "reports", "report_events"]) {
      const n = await env.DB.prepare(`SELECT count(*) AS n FROM ${table}`).first<{ n: number }>();
      expect(n!.n).toBe(0);
    }
    expect((await SELF.fetch(`${ORIGIN}/statement/joesbakery-com`)).status).toBe(404);
  });
});

describe("the public accessibility statement", () => {
  it("is honest, complete, and needs no login", async () => {
    const res = await get("/statement/joesbakery-com", false);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("<h1>Accessibility statement for Joe&#39;s &lt;Bakery&gt;</h1>");
    expect(html).toContain("joesbakery.com partially conforms with WCAG 2.2 Level AA");
    expect(html).toContain("<li>Some photos have no text description yet.</li>");
    expect(html).toContain("<li>The menu PDF can&#39;t be read by screen readers.</li>");
    expect(html).toContain(`<a href="/report/joesbakery-com">Report an accessibility problem online</a>`);
    expect(html).toContain(">hello@joesbakery.com</a>");
    expect(html).toContain(`<a href="tel:5550100">555-0100</a>`);
    expect(html).toContain("We aim to reply within 3 working days.");
    expect(html).toContain("This statement was last updated on October 10, 2026.");
  });

  it("never claims the website is compliant", async () => {
    const html = await (await get("/statement/joesbakery-com", false)).text();
    expect(html).not.toMatch(/complian|lawsuit|fully conform|guarantee/i);
  });

  it("says so when no problems are listed yet", async () => {
    await env.DB.prepare("UPDATE sites SET known_problems = '' WHERE id = 'joesbakery-com'").run();
    const html = await (await get("/statement/joesbakery-com", false)).text();
    expect(html).toContain("We have not listed any known problems yet.");
  });

  it("shows a friendly page for an unknown website", async () => {
    expect((await get("/statement/nobody-com", false)).status).toBe(404);
  });
});
