// Tests the People page and per-website access. The most important promise: a person
// limited to some websites can't see, change, download or delete anything belonging to
// any other website, even by guessing addresses.

import { SELF } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { createLoginToken, createSession } from "../src/auth.js";
import { invitationEmail } from "../src/email.js";

const ORIGIN = "https://portal.test";
const OWNER = "owner@joesbakery.com"; // in ADMIN_EMAILS for tests
const DESIGNER = "web@designer.example"; // limited to the cafe
const MANAGER = "manager@joesbakery.com"; // sees every website

beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM people_events"),
    env.DB.prepare("DELETE FROM person_sites"),
    env.DB.prepare("DELETE FROM people"),
    env.DB.prepare("DELETE FROM site_reviews"),
    env.DB.prepare("DELETE FROM report_events"),
    env.DB.prepare("DELETE FROM reports"),
    env.DB.prepare("DELETE FROM sessions"),
    env.DB.prepare("DELETE FROM login_tokens"),
    env.DB.prepare("DELETE FROM rate_limits"),
    env.DB.prepare("DELETE FROM sites"),
    env.DB.prepare(
      `INSERT INTO sites (id, organization, website, contact_email, created_at, updated_at, reviewed_at) VALUES
       ('joesbakery-com', 'Joe''s Bakery', 'https://joesbakery.com/', 'hello@joesbakery.com', '2026-10-01', '2026-10-01', '2026-10-01'),
       ('joescafe-com', 'Joe''s Cafe', 'https://joescafe.com/', 'cafe@joescafe.com', '2026-10-01', '2026-10-01', '2026-10-01')`,
    ),
    env.DB.prepare(
      `INSERT INTO reports (id, site_id, description, status, received_at) VALUES
       (1, 'joesbakery-com', 'BAKERY-SECRET menu unreadable', 'new', '2026-10-15T14:00:00Z'),
       (2, 'joescafe-com', 'CAFE booking button missing a label', 'new', '2026-10-16T14:00:00Z')`,
    ),
    env.DB.prepare(
      `INSERT INTO people (email, all_sites, added_by, added_at) VALUES
       ('${DESIGNER}', 0, '${OWNER}', '2026-10-18T10:00:00Z'),
       ('${MANAGER}', 1, '${OWNER}', '2026-10-18T10:00:00Z')`,
    ),
    env.DB.prepare(`INSERT INTO person_sites (email, site_id) VALUES ('${DESIGNER}', 'joescafe-com')`),
  ]);
});

async function cookieFor(email: string) {
  return `__Host-a11y_session=${await createSession(env.DB, email, Date.now())}`;
}

function get(path: string, cookie: string) {
  return SELF.fetch(`${ORIGIN}${path}`, { redirect: "manual", headers: { Cookie: cookie } });
}

function post(path: string, cookie: string, fields: Record<string, string | string[]> = {}) {
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(fields)) for (const one of Array.isArray(v) ? v : [v]) body.append(k, one);
  return SELF.fetch(`${ORIGIN}${path}`, {
    method: "POST",
    redirect: "manual",
    body,
    headers: { Origin: ORIGIN, "Content-Type": "application/x-www-form-urlencoded", Cookie: cookie },
  });
}

async function reportStatus(id: number) {
  return (await env.DB.prepare("SELECT status FROM reports WHERE id = ?").bind(id).first<{ status: string }>())?.status;
}

describe("a person limited to some websites", () => {
  let designer: string;
  beforeEach(async () => {
    designer = await cookieFor(DESIGNER);
  });

  it("only sees their own websites' reports in the inbox, even when asking for another website", async () => {
    const inbox = await (await get("/admin", designer)).text();
    expect(inbox).toContain("R-0002");
    expect(inbox).not.toContain("R-0001");
    const asked = await (await get("/admin?site=joesbakery-com", designer)).text();
    expect(asked).not.toContain("R-0001");
    expect(asked).not.toContain("BAKERY-SECRET");
  });

  it("can't open, change or delete another website's report by guessing its address", async () => {
    expect((await get("/admin/reports/1", designer)).status).toBe(404);
    expect((await post("/admin/reports/1", designer, { status: "fixed" })).status).toBe(404);
    expect(await reportStatus(1)).toBe("new");
    expect((await get("/admin/reports/1/delete", designer)).status).toBe(404);
    expect((await post("/admin/reports/1/delete", designer)).status).toBe(404);
    expect(await reportStatus(1)).toBe("new");
  });

  it("can work on their own website's reports", async () => {
    expect((await get("/admin/reports/2", designer)).status).toBe(200);
    expect((await post("/admin/reports/2", designer, { status: "in_progress" })).status).toBe(303);
    expect(await reportStatus(2)).toBe("in_progress");
  });

  it("only downloads their own websites' reports", async () => {
    const csv = await (await get("/admin/reports.csv", designer)).text();
    expect(csv).toContain("CAFE booking button");
    expect(csv).not.toContain("BAKERY-SECRET");
  });

  it("can't open or change another website's page, statement review or settings", async () => {
    expect((await get("/admin/sites/joesbakery-com", designer)).status).toBe(404);
    expect((await get("/admin/sites/joesbakery-com/review", designer)).status).toBe(404);
    expect((await post("/admin/sites/joesbakery-com/review", designer)).status).toBe(404);
    expect(
      (await post("/admin/sites/joesbakery-com", designer, {
        organization: "Hacked",
        website: "joesbakery.com",
        contactEmail: "x@example.com",
        replyDays: "5",
      })).status,
    ).toBe(404);
    const site = await env.DB.prepare("SELECT organization FROM sites WHERE id = 'joesbakery-com'").first();
    expect(site).toEqual({ organization: "Joe's Bakery" });
  });

  it("sees only their websites, and can edit and review them, but not add or delete websites", async () => {
    const list = await (await get("/admin/sites", designer)).text();
    expect(list).toContain("joescafe.com");
    expect(list).not.toContain("joesbakery.com");
    expect(list).not.toContain("Add a website");
    expect((await get("/admin/sites/joescafe-com", designer)).status).toBe(200);
    expect((await post("/admin/sites/joescafe-com/review", designer)).status).toBe(303);
    expect((await get("/admin/sites/new", designer)).status).toBe(403);
    expect((await post("/admin/sites", designer, { organization: "X", website: "x.com", contactEmail: "a@b.co", replyDays: "5" })).status).toBe(403);
    expect((await post("/admin/sites/joescafe-com/delete", designer)).status).toBe(403);
    expect(await env.DB.prepare("SELECT id FROM sites WHERE id = 'joescafe-com'").first()).not.toBeNull();
  });

  it("can't use Check my setup or the People page, and the menu doesn't offer them", async () => {
    expect((await get("/admin/setup", designer)).status).toBe(403);
    expect((await get("/admin/people", designer)).status).toBe(403);
    expect((await post("/admin/people", designer, { email: "friend@example.com", access: "all" })).status).toBe(403);
    expect(await env.DB.prepare("SELECT email FROM people WHERE email = 'friend@example.com'").first()).toBeNull();
    const html = await (await get("/admin", designer)).text();
    expect(html).not.toContain(`href="/admin/people"`);
    expect(html).not.toContain(`href="/admin/setup"`);
  });
});

describe("a person who sees every website", () => {
  it("sees every report and can manage websites, but not people", async () => {
    const manager = await cookieFor(MANAGER);
    const inbox = await (await get("/admin", manager)).text();
    expect(inbox).toContain("R-0001");
    expect(inbox).toContain("R-0002");
    expect((await get("/admin/sites/new", manager)).status).toBe(200);
    expect((await get("/admin/setup", manager)).status).toBe(200);
    expect((await get("/admin/people", manager)).status).toBe(403);
    expect(await (await get("/admin", manager)).text()).not.toContain(`href="/admin/people"`);
  });
});

describe("the People page (owners only)", () => {
  let owner: string;
  beforeEach(async () => {
    owner = await cookieFor(OWNER);
  });

  it("lists owners and added people with what they can see", async () => {
    const html = await (await get("/admin/people", owner)).text();
    expect(html).toContain("<h2>Portal owners</h2>");
    expect(html).toContain(`<li>${OWNER}</li>`);
    expect(html).toContain(`<td>${DESIGNER}</td>`);
    expect(html).toContain("Only joescafe.com");
    expect(html).toContain("All websites");
    expect(html).toContain(`href="/admin/people"`);
  });

  it("adds a person limited to chosen websites, records who did it, and they can then log in", async () => {
    const res = await post("/admin/people", owner, { email: "Helper@Example.com", access: "some", sites: ["joesbakery-com"] });
    expect(res.headers.get("Location")).toBe("/admin/people?added=helper%40example.com&invited=0");
    const access = await env.DB.prepare("SELECT site_id FROM person_sites WHERE email = 'helper@example.com'").all();
    expect(access.results).toEqual([{ site_id: "joesbakery-com" }]);
    const event = await env.DB.prepare("SELECT actor, kind, detail FROM people_events WHERE email = 'helper@example.com'").first();
    expect(event).toEqual({ actor: OWNER, kind: "added", detail: "Only joesbakery.com" });

    // Tests have no email key, so the page says the invitation couldn't be sent and explains what to do.
    const notice = await (await get("/admin/people?added=helper%40example.com&invited=0", owner)).text();
    expect(notice).toContain("couldn&#39;t be sent. Ask them to go to https://portal.test/admin/login");

    await SELF.fetch(`${ORIGIN}/admin/login`, {
      method: "POST",
      body: new URLSearchParams({ email: "helper@example.com" }),
      headers: { Origin: ORIGIN, "Content-Type": "application/x-www-form-urlencoded" },
    });
    expect(await env.DB.prepare("SELECT email FROM login_tokens WHERE email = 'helper@example.com'").first()).not.toBeNull();
  });

  it("explains mistakes in plain words", async () => {
    const bad = await (await post("/admin/people", owner, { email: "nope", access: "all" })).text();
    expect(bad).toContain("Please type their email address");
    const none = await (await post("/admin/people", owner, { email: "a@example.com", access: "some" })).text();
    expect(none).toContain("Please tick at least one website");
    const ownerAgain = await (await post("/admin/people", owner, { email: OWNER, access: "all" })).text();
    expect(ownerAgain).toContain("is already a portal owner");
    const twice = await (await post("/admin/people", owner, { email: DESIGNER, access: "all" })).text();
    expect(twice).toContain("has already been added");
  });

  it("ignores made-up website ids", async () => {
    await post("/admin/people", owner, { email: "sneaky@example.com", access: "some", sites: ["joescafe-com", "not-a-site"] });
    const access = await env.DB.prepare("SELECT site_id FROM person_sites WHERE email = 'sneaky@example.com'").all();
    expect(access.results).toEqual([{ site_id: "joescafe-com" }]);
  });

  it("changes what someone can see, taking effect straight away", async () => {
    const designer = await cookieFor(DESIGNER);
    const res = await post(`/admin/people/${encodeURIComponent(DESIGNER)}`, owner, { access: "some", sites: ["joesbakery-com"] });
    expect(res.headers.get("Location")).toBe(`/admin/people?changed=${encodeURIComponent(DESIGNER)}`);
    expect((await get("/admin/reports/1", designer)).status).toBe(200);
    expect((await get("/admin/reports/2", designer)).status).toBe(404);
  });

  it("removes someone, logs them out at once, and they can't log in again", async () => {
    const designer = await cookieFor(DESIGNER);
    expect((await get(`/admin/people/${encodeURIComponent(DESIGNER)}/remove`, owner)).status).toBe(200);
    const res = await post(`/admin/people/${encodeURIComponent(DESIGNER)}/remove`, owner);
    expect(res.headers.get("Location")).toBe(`/admin/people?removed=${encodeURIComponent(DESIGNER)}`);
    expect((await get("/admin", designer)).headers.get("Location")).toBe("/admin/login");
    expect(await env.DB.prepare("SELECT email FROM sessions WHERE email = ?").bind(DESIGNER).first()).toBeNull();
    const token = await createLoginToken(env.DB, DESIGNER, Date.now());
    const verify = await SELF.fetch(`${ORIGIN}/admin/login/verify`, {
      method: "POST",
      redirect: "manual",
      body: new URLSearchParams({ token: token! }),
      headers: { Origin: ORIGIN, "Content-Type": "application/x-www-form-urlencoded" },
    });
    expect(verify.status).toBe(400);
    const event = await env.DB.prepare("SELECT kind FROM people_events WHERE email = ? AND kind = 'removed'").bind(DESIGNER).first();
    expect(event).toEqual({ kind: "removed" });
  });

  it("can't remove a portal owner from here", async () => {
    expect((await get(`/admin/people/${encodeURIComponent(OWNER)}/remove`, owner)).status).toBe(404);
  });

  it("deleting a website also removes it from people's access lists", async () => {
    await post("/admin/sites/joescafe-com/delete", owner);
    expect(await env.DB.prepare("SELECT * FROM person_sites WHERE site_id = 'joescafe-com'").first()).toBeNull();
  });
});

describe("the invitation email", () => {
  it("says who added them, what they can see, and how to log in, with no password", () => {
    const email = invitationEmail("helper@example.com", OWNER, ORIGIN, "joescafe.com");
    expect(email.to).toEqual(["helper@example.com"]);
    expect(email.text).toContain(`${OWNER} added you to their accessibility portal`);
    expect(email.text).toContain("You can see: joescafe.com.");
    expect(email.text).toContain(`${ORIGIN}/admin/login`);
    expect(email.text).toContain("There's no password.");
    expect(email.html).toContain(`<a href="${ORIGIN}/admin/login">Log in to the accessibility portal</a>`);
  });
});
