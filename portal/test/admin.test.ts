// Tests the owner's side: logging in, the inbox, a report's page, delete, and the spreadsheet.

import { SELF } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { createLoginToken, createSession, sha256 } from "../src/auth.js";

const ORIGIN = "https://portal.test";
const OWNER = "owner@joesbakery.com";

beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM report_events"),
    env.DB.prepare("DELETE FROM reports"),
    env.DB.prepare("DELETE FROM sessions"),
    env.DB.prepare("DELETE FROM login_tokens"),
    env.DB.prepare("DELETE FROM rate_limits"),
    env.DB.prepare("DELETE FROM sites"),
    env.DB.prepare(
      `INSERT INTO sites (id, organization, website, contact_email, created_at) VALUES
       ('joesbakery-com', 'Joe''s Bakery', 'https://joesbakery.com/', 'hello@joesbakery.com', '2026-10-16'),
       ('joescafe-com', 'Joe''s Cafe', 'https://joescafe.com/', 'cafe@joescafe.com', '2026-10-16')`,
    ),
    env.DB.prepare(
      `INSERT INTO reports (id, site_id, description, page, email, assistive_tech, status, received_at) VALUES
       (1, 'joesbakery-com', 'Menu is <script>alert(1)</script> unreadable', '/menu', 'v@example.com', '["zoom"]', 'new', '2026-10-15T14:00:00Z'),
       (2, 'joescafe-com', '=HYPERLINK("http://evil.example")', NULL, NULL, '[]', 'fixed', '2026-10-16T14:00:00Z'),
       (3, 'joesbakery-com', 'Order button not reachable', NULL, NULL, '["keyboard"]', 'in_progress', '2026-10-16T18:00:00Z')`,
    ),
    env.DB.prepare(
      "INSERT INTO report_events (report_id, at, kind) VALUES (1, '2026-10-15T14:00:00Z', 'received')",
    ),
  ]);
});

async function loggedIn(email = OWNER): Promise<string> {
  return `__Host-a11y_session=${await createSession(env.DB, email, Date.now())}`;
}

function get(path: string, cookie?: string) {
  return SELF.fetch(`${ORIGIN}${path}`, { redirect: "manual", headers: cookie ? { Cookie: cookie } : {} });
}

function post(path: string, fields: Record<string, string>, cookie?: string, origin = ORIGIN) {
  return SELF.fetch(`${ORIGIN}${path}`, {
    method: "POST",
    redirect: "manual",
    body: new URLSearchParams(fields),
    headers: {
      Origin: origin,
      "Content-Type": "application/x-www-form-urlencoded",
      ...(cookie ? { Cookie: cookie } : {}),
    },
  });
}

async function tokenCount(): Promise<number> {
  return (await env.DB.prepare("SELECT count(*) AS n FROM login_tokens").first<{ n: number }>())!.n;
}

describe("logging in", () => {
  it("sends you to the login page when you're not logged in", async () => {
    for (const path of ["/admin", "/admin/reports/1", "/admin/reports.csv"]) {
      const res = await get(path);
      expect(res.status).toBe(303);
      expect(res.headers.get("Location")).toBe("/admin/login");
    }
  });

  it("creates a login link only for admins, but answers everyone the same way", async () => {
    const forAdmin = await post("/admin/login", { email: "OWNER@JoesBakery.com" });
    const forStranger = await post("/admin/login", { email: "stranger@example.com" });
    expect(forAdmin.status).toBe(200);
    expect(forStranger.status).toBe(200);
    const [adminText, strangerText] = [await forAdmin.text(), await forStranger.text()];
    expect(adminText).toContain("If that address can log in, we&#39;ve sent it a login link");
    expect(adminText).toBe(strangerText);
    const tokens = await env.DB.prepare("SELECT email FROM login_tokens").all<{ email: string }>();
    expect(tokens.results).toEqual([{ email: OWNER }]);
  });

  it("asks for a real email address", async () => {
    const res = await post("/admin/login", { email: "owner" });
    expect(res.status).toBe(400);
    expect(await res.text()).toContain("Error: Please type your email address");
  });

  it("sends at most 3 login links per address every 15 minutes", async () => {
    for (let i = 0; i < 4; i++) await post("/admin/login", { email: OWNER });
    expect(await tokenCount()).toBe(3);
  });

  it("only uses up a login link when you press the button, so email virus-scanners can't", async () => {
    const token = (await createLoginToken(env.DB, OWNER, Date.now()))!;
    const page = await get(`/admin/login/verify?token=${token}`);
    expect(await page.text()).toContain("Log me in");
    const used = await env.DB.prepare("SELECT used_at FROM login_tokens").first<{ used_at: number | null }>();
    expect(used!.used_at).toBeNull();

    const res = await post("/admin/login/verify", { token });
    expect(res.status).toBe(303);
    expect(res.headers.get("Location")).toBe("/admin");
    const cookie = res.headers.get("Set-Cookie")!;
    expect(cookie).toMatch(/^__Host-a11y_session=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/Secure/i);
    expect(cookie).toMatch(/SameSite=Lax/i);

    const inbox = await get("/admin", cookie.split(";")[0]);
    expect(inbox.status).toBe(200);
    expect(await inbox.text()).toContain(`Logged in as ${OWNER}`);
  });

  it("refuses used, expired or made-up login links", async () => {
    const token = (await createLoginToken(env.DB, OWNER, Date.now()))!;
    expect((await post("/admin/login/verify", { token })).status).toBe(303);
    expect((await post("/admin/login/verify", { token })).status).toBe(400);

    const old = (await createLoginToken(env.DB, OWNER, Date.now() - 16 * 60 * 1000))!;
    expect((await post("/admin/login/verify", { token: old })).status).toBe(400);
    expect((await post("/admin/login/verify", { token: "made-up" })).status).toBe(400);
  });

  it("stores only hashes of login links and sessions", async () => {
    const token = (await createLoginToken(env.DB, OWNER, Date.now()))!;
    const row = await env.DB.prepare("SELECT token_hash FROM login_tokens").first<{ token_hash: string }>();
    expect(row!.token_hash).toBe(await sha256(token));
    expect(row!.token_hash).not.toBe(token);
  });

  it("logs out people who are no longer on the admin list", async () => {
    const res = await get("/admin", await loggedIn("former@joesbakery.com"));
    expect(res.headers.get("Location")).toBe("/admin/login");
  });

  it("logs you out", async () => {
    const cookie = await loggedIn();
    const res = await post("/admin/logout", {}, cookie);
    expect(res.headers.get("Location")).toBe("/admin/login");
    expect((await get("/admin", cookie)).headers.get("Location")).toBe("/admin/login");
  });

  it("refuses forms sent from other websites", async () => {
    const res = await post("/admin/reports/1", { status: "fixed" }, await loggedIn(), "https://evil.example");
    expect(res.status).toBe(403);
    const status = await env.DB.prepare("SELECT status FROM reports WHERE id = 1").first<{ status: string }>();
    expect(status!.status).toBe("new");
  });

  it("never lets private pages be cached", async () => {
    expect((await get("/admin", await loggedIn())).headers.get("Cache-Control")).toBe("no-store");
  });
});

describe("the inbox", () => {
  it("lists every website's reports, newest first, with counts", async () => {
    const html = await (await get("/admin", await loggedIn())).text();
    expect(html.indexOf("R-0003")).toBeLessThan(html.indexOf("R-0002"));
    expect(html.indexOf("R-0002")).toBeLessThan(html.indexOf("R-0001"));
    expect(html).toContain("New: <strong>1</strong>");
    expect(html).toContain("In progress: <strong>1</strong>");
    expect(html).toContain("Fixed: <strong>1</strong>");
    expect(html).toContain("<caption>Reports, newest first</caption>");
    expect(html).toContain("Oct 16, 2026, 2:00 PM EDT");
  });

  it("filters by website and by status", async () => {
    const cookie = await loggedIn();
    const cafe = await (await get("/admin?site=joescafe-com", cookie)).text();
    expect(cafe).toContain("R-0002");
    expect(cafe).not.toContain("R-0001");
    const fixed = await (await get("/admin?status=fixed", cookie)).text();
    expect(fixed).toContain("R-0002");
    expect(fixed).not.toContain("R-0003");
  });

  it("shows visitors' text safely", async () => {
    const html = await (await get("/admin", await loggedIn())).text();
    expect(html).not.toContain("<script>alert(1)");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });
});

describe("a report's page", () => {
  it("shows everything the visitor sent and the timeline", async () => {
    const html = await (await get("/admin/reports/1", await loggedIn())).text();
    expect(html).toContain("<h1>Report R-0001</h1>");
    expect(html).toContain("Zoom or a screen magnifier");
    expect(html).toContain(`href="mailto:v@example.com?subject=Your%20accessibility%20report%20R-0001"`);
    expect(html).toContain("Report received");
  });

  it("changes the status and adds a note, recording who did it", async () => {
    const cookie = await loggedIn();
    const res = await post("/admin/reports/1", { status: "in_progress", note: "Made the menu text bigger." }, cookie);
    expect(res.headers.get("Location")).toBe("/admin/reports/1?saved=1");
    const html = await (await get("/admin/reports/1?saved=1", cookie)).text();
    expect(html).toContain("Your changes were saved.");
    expect(html).toContain(`${OWNER} changed the status from New to In progress`);
    expect(html).toContain(`${OWNER} added a note: &quot;Made the menu text bigger.&quot;`);
    const events = await env.DB.prepare("SELECT kind, actor FROM report_events WHERE report_id = 1 AND actor IS NOT NULL").all();
    expect(events.results).toEqual([
      { kind: "status_changed", actor: OWNER },
      { kind: "note", actor: OWNER },
    ]);
  });

  it("ignores made-up statuses and records nothing when nothing changed", async () => {
    await post("/admin/reports/1", { status: "hacked", note: "" }, await loggedIn());
    const report = await env.DB.prepare("SELECT status FROM reports WHERE id = 1").first<{ status: string }>();
    expect(report!.status).toBe("new");
    const n = await env.DB.prepare("SELECT count(*) AS n FROM report_events WHERE report_id = 1").first<{ n: number }>();
    expect(n!.n).toBe(1);
  });

  it("shows a friendly page for a report that doesn't exist", async () => {
    expect((await get("/admin/reports/999", await loggedIn())).status).toBe(404);
  });
});

describe("deleting a report", () => {
  it("asks first, then deletes the report and its timeline for good", async () => {
    const cookie = await loggedIn();
    const confirm = await (await get("/admin/reports/1/delete", cookie)).text();
    expect(confirm).toContain("Delete report R-0001?");
    expect(confirm).toContain("It can&#39;t be undone.");

    const res = await post("/admin/reports/1/delete", {}, cookie);
    expect(res.headers.get("Location")).toBe("/admin?deleted=R-0001");
    expect(await env.DB.prepare("SELECT id FROM reports WHERE id = 1").first()).toBeNull();
    expect(await env.DB.prepare("SELECT id FROM report_events WHERE report_id = 1").first()).toBeNull();
    expect(await (await get("/admin?deleted=R-0001", cookie)).text()).toContain("Report R-0001 was deleted.");
  });
});

describe("the spreadsheet download", () => {
  it("includes every report and can't run formulas in Excel", async () => {
    const res = await get("/admin/reports.csv", await loggedIn());
    expect(res.headers.get("Content-Type")).toContain("text/csv");
    expect(res.headers.get("Content-Disposition")).toMatch(/attachment; filename="accessibility-reports-\d{4}-\d{2}-\d{2}\.csv"/);
    const csv = await res.text();
    expect(csv).toContain('"Reference","Website","Received","Status"');
    expect(csv).toContain(`"'=HYPERLINK(""http://evil.example"")"`);
    expect(csv.split("\r\n").filter(Boolean)).toHaveLength(4);
  });
});
