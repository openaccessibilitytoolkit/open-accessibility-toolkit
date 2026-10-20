// Tests the monthly statement review: the one-click review page, the dated record,
// the date on the public statement, "Check my setup", and the monthly reminder email.

import { SELF } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSession } from "../src/auth.js";
import { getSetting, listSites, setSetting } from "../src/db.js";
import { PORTAL_ORIGIN_SETTING, REVIEW_REMINDER_SETTING, sendMonthlyReviewReminder } from "../src/email.js";
import { runMonthlyReview } from "../src/index.js";

const ORIGIN = "https://portal.test";
const OWNER = "owner@joesbakery.com";

beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM site_reviews"),
    env.DB.prepare("DELETE FROM report_events"),
    env.DB.prepare("DELETE FROM reports"),
    env.DB.prepare("DELETE FROM sessions"),
    env.DB.prepare("DELETE FROM settings"),
    env.DB.prepare("DELETE FROM sites"),
    env.DB.prepare(
      `INSERT INTO sites (id, organization, website, contact_email, reply_days, known_problems, created_at, updated_at, reviewed_at) VALUES
       ('joesbakery-com', 'Joe''s Bakery', 'https://joesbakery.com/', 'hello@joesbakery.com', 5, 'Some photos have no text description yet.', '2026-08-01T12:00:00Z', '2026-08-01T12:00:00Z', '2026-08-01T12:00:00Z'),
       ('joescafe-com', 'Joe''s Cafe', 'https://joescafe.com/', 'cafe@joescafe.com', 3, '', '2026-08-01T12:00:00Z', '2026-08-01T12:00:00Z', '2026-08-01T12:00:00Z')`,
    ),
  ]);
});

afterEach(() => vi.restoreAllMocks());

async function cookie() {
  return `__Host-a11y_session=${await createSession(env.DB, OWNER, Date.now())}`;
}

async function get(path: string, withLogin = true) {
  return SELF.fetch(`${ORIGIN}${path}`, { redirect: "manual", headers: withLogin ? { Cookie: await cookie() } : {} });
}

async function post(path: string, fields: Record<string, string> = {}) {
  return SELF.fetch(`${ORIGIN}${path}`, {
    method: "POST",
    redirect: "manual",
    body: new URLSearchParams(fields),
    headers: { Origin: ORIGIN, "Content-Type": "application/x-www-form-urlencoded", Cookie: await cookie() },
  });
}

async function reviewedAt(siteId: string) {
  const row = await env.DB.prepare("SELECT reviewed_at FROM sites WHERE id = ?").bind(siteId).first<{ reviewed_at: string }>();
  return row!.reviewed_at;
}

describe("the review page", () => {
  it("needs a login", async () => {
    expect((await get("/admin/sites/joesbakery-com/review", false)).headers.get("Location")).toBe("/admin/login");
  });

  it("shows the details on the statement, with a one-click confirm button", async () => {
    const html = await (await get("/admin/sites/joesbakery-com/review")).text();
    expect(html).toContain("Review the statement for joesbakery.com");
    expect(html).toContain("hello@joesbakery.com");
    expect(html).toContain("<li>Some photos have no text description yet.</li>");
    expect(html).toContain("Yes, it&#39;s still accurate");
    expect(html).toContain(`href="/admin/sites/joesbakery-com#settings"`);
  });

  it("records the review with who did it, and updates the public statement's date", async () => {
    const res = await post("/admin/sites/joesbakery-com/review");
    expect(res.headers.get("Location")).toBe("/admin/sites/joesbakery-com/review?done=1");
    expect(await reviewedAt("joesbakery-com")).not.toBe("2026-08-01T12:00:00Z");
    const review = await env.DB.prepare("SELECT actor, outcome FROM site_reviews").first();
    expect(review).toEqual({ actor: OWNER, outcome: "confirmed" });

    const page = await (await get("/admin/sites/joesbakery-com/review?done=1")).text();
    expect(page).toContain("Thank you. Your statement now shows it was reviewed on");
    expect(page).toContain(`Confirmed still accurate by ${OWNER}`);

    const statement = await (await get("/statement/joesbakery-com", false)).text();
    expect(statement).not.toContain("last reviewed on August 1, 2026");
    expect(statement).toContain("This statement was last reviewed on");
  });

  it("counts saving the website's details as a review", async () => {
    await post("/admin/sites/joescafe-com", {
      organization: "Joe's Cafe",
      website: "joescafe.com",
      contactEmail: "cafe@joescafe.com",
      replyDays: "3",
    });
    expect(await reviewedAt("joescafe-com")).not.toBe("2026-08-01T12:00:00Z");
    const review = await env.DB.prepare("SELECT outcome FROM site_reviews WHERE site_id = 'joescafe-com'").first();
    expect(review).toEqual({ outcome: "updated" });
  });

  it("shows a friendly page for an unknown website", async () => {
    expect((await get("/admin/sites/nobody-com/review")).status).toBe(404);
  });
});

describe("Check my setup", () => {
  it("asks for a review once a statement is more than a month old, with a link", async () => {
    const html = await (await get("/admin/setup")).text();
    expect(html).toContain("The statement for joesbakery.com needs its monthly review");
    expect(html).toContain(`href="/admin/sites/joescafe-com/review"`);
  });

  it("is happy once every statement has been reviewed", async () => {
    await post("/admin/sites/joesbakery-com/review");
    await post("/admin/sites/joescafe-com/review");
    const html = await (await get("/admin/setup")).text();
    expect(html).toContain("Statements reviewed this month");
    expect(html).not.toContain("needs its monthly review");
  });
});

describe("the monthly reminder email", () => {
  const firstOfMonth = new Date("2026-11-01T13:00:00Z");
  const emailEnv = {
    ...env,
    RESEND_API_KEY: "re_test",
    HASH_SALT: "test-salt-that-is-long-enough",
    EMAIL_FROM: "Accessibility reports <onboarding@resend.dev>",
    TIME_ZONE: "America/New_York",
  };
  const admins = ["owner@joesbakery.com", "second@example.com"];
  const settings = {
    get: (key: string) => getSetting(env.DB, key),
    set: (key: string, value: string) => setSetting(env.DB, key, value),
  };
  let sent: { to: string[]; subject: string; text: string; html: string }[];

  beforeEach(async () => {
    sent = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      expect(String(url)).toBe("https://api.resend.com/emails");
      sent.push(JSON.parse(String(init?.body)));
      return Response.json({ id: "email-id" });
    });
    await setSetting(env.DB, PORTAL_ORIGIN_SETTING, ORIGIN);
  });

  const remind = async (now = firstOfMonth, e = emailEnv) =>
    sendMonthlyReviewReminder(e, admins, await listSites(env.DB), settings.get, settings.set, now);

  it("sends one email to all admins, listing every website with its review link", async () => {
    expect(await remind()).toBe("sent");
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toEqual(admins);
    expect(sent[0].subject).toBe("Time for your monthly accessibility statement review (November 2026)");
    expect(sent[0].text).toContain(`- joesbakery.com: ${ORIGIN}/admin/sites/joesbakery-com/review`);
    expect(sent[0].text).toContain(`- joescafe.com: ${ORIGIN}/admin/sites/joescafe-com/review`);
    expect(sent[0].html).toContain(`<a href="${ORIGIN}/admin/sites/joescafe-com/review">Review joescafe.com</a>`);
  });

  it("sends only once a month, even though the schedule runs every day", async () => {
    expect(await remind()).toBe("sent");
    expect(await remind(new Date("2026-11-02T13:00:00Z"))).toBe("already-sent");
    expect(sent).toHaveLength(1);
    expect(await settings.get(REVIEW_REMINDER_SETTING)).toBe("2026-11");
    expect(await remind(new Date("2026-12-01T13:00:00Z"))).toBe("sent");
    expect(sent).toHaveLength(2);
  });

  it("only sends in the first week, so a new portal isn't reminded mid-month", async () => {
    expect(await remind(new Date("2026-11-08T13:00:00Z"))).toBe("not-due");
    expect(sent).toHaveLength(0);
  });

  it("tries again the next day if sending failed", async () => {
    vi.restoreAllMocks();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ message: "down" }, { status: 500 }));
    expect(await remind()).toBe("failed");
    expect(await settings.get(REVIEW_REMINDER_SETTING)).toBeNull();
  });

  it("waits until it knows the portal's address, email is set up, and there are websites", async () => {
    await env.DB.prepare("DELETE FROM settings WHERE key = ?").bind(PORTAL_ORIGIN_SETTING).run();
    expect(await remind()).toBe("no-portal-address");
    expect(await remind(firstOfMonth, { ...emailEnv, RESEND_API_KEY: "" })).toBe("no-email");
    await env.DB.prepare("DELETE FROM sites").run();
    await setSetting(env.DB, PORTAL_ORIGIN_SETTING, ORIGIN);
    expect(await remind()).toBe("no-sites");
    expect(sent).toHaveLength(0);
  });

  it("runs from the daily schedule without real email in tests", async () => {
    // Tests have no real email key, so the schedule stops before sending anything.
    expect(await runMonthlyReview(env as never, firstOfMonth)).toBe("no-email");
    expect(sent).toHaveLength(0);
  });
});

describe("logging in", () => {
  it("remembers the portal's own address, for the monthly email's links", async () => {
    const { createLoginToken } = await import("../src/auth.js");
    const token = (await createLoginToken(env.DB, OWNER, Date.now()))!;
    await SELF.fetch(`${ORIGIN}/admin/login/verify`, {
      method: "POST",
      redirect: "manual",
      body: new URLSearchParams({ token }),
      headers: { Origin: ORIGIN, "Content-Type": "application/x-www-form-urlencoded" },
    });
    expect(await getSetting(env.DB, PORTAL_ORIGIN_SETTING)).toBe(ORIGIN);
  });
});
