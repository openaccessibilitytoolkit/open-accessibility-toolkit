// Tests "Check my setup" with a pretend Resend and a pretend website: nothing real is contacted.

import { SELF } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSession } from "../src/auth.js";
import { sendTestEmail } from "../src/email.js";

const ORIGIN = "https://portal.test";
const OWNER = "owner@joesbakery.com";

beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM report_events"),
    env.DB.prepare("DELETE FROM reports"),
    env.DB.prepare("DELETE FROM sessions"),
    env.DB.prepare("DELETE FROM rate_limits"),
    env.DB.prepare("DELETE FROM sites"),
  ]);
});

afterEach(() => vi.restoreAllMocks());

async function cookie() {
  return `__Host-a11y_session=${await createSession(env.DB, OWNER, Date.now())}`;
}

async function addBakery() {
  await env.DB.prepare(
    `INSERT INTO sites (id, organization, website, contact_email, created_at, updated_at)
     VALUES ('joesbakery-com', 'Joe''s Bakery', 'https://joesbakery.com/', 'hello@joesbakery.com', '2026-10-16', '2026-10-16')`,
  ).run();
}

/** Pretends to be the bakery's website, with or without the footer links. */
function fakeWebsite(html: string) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    expect(String(input instanceof Request ? input.url : input)).toBe("https://joesbakery.com/");
    return new Response(html, { headers: { "Content-Type": "text/html" } });
  });
}

describe("Check my setup", () => {
  it("needs a login", async () => {
    const res = await SELF.fetch(`${ORIGIN}/admin/setup`, { redirect: "manual" });
    expect(res.headers.get("Location")).toBe("/admin/login");
  });

  it("points out everything that still needs doing, in plain words", async () => {
    const html = await (await SELF.fetch(`${ORIGIN}/admin/setup`, { headers: { Cookie: await cookie() } })).text();
    expect(html).toContain("Done:</strong> You can log in");
    expect(html).toContain("owner@joesbakery.com, second@example.com");
    expect(html).toContain("Needs attention:</strong> Email isn&#39;t connected");
    expect(html).toContain("Needs attention:</strong> You&#39;re using Resend&#39;s test address");
    expect(html).toContain("Needs attention:</strong> No websites added yet");
    expect(html).toContain("Done:</strong> Times are shown in America/New_York");
    expect(html).toContain("3 things need your attention.");
    expect(html).not.toContain("Send me a test email");
  });

  it("confirms when the footer links are on the website's home page", async () => {
    await addBakery();
    fakeWebsite(`<footer><a href="${ORIGIN}/statement/joesbakery-com">A</a> <a href="${ORIGIN}/report/joesbakery-com">R</a></footer>`);
    const html = await (await SELF.fetch(`${ORIGIN}/admin/setup`, { headers: { Cookie: await cookie() } })).text();
    expect(html).toContain("Done:</strong> joesbakery.com");
    expect(html).toContain("Both footer links are on your home page.");
  });

  it("says which footer link is missing", async () => {
    await addBakery();
    fakeWebsite(`<footer><a href="${ORIGIN}/statement/joesbakery-com">A</a></footer>`);
    const html = await (await SELF.fetch(`${ORIGIN}/admin/setup`, { headers: { Cookie: await cookie() } })).text();
    expect(html).toContain("Needs attention:</strong> joesbakery.com");
    expect(html).toContain("couldn&#39;t find the &quot;Report an accessibility problem&quot; link");
  });

  it("is honest when the website can't be reached", async () => {
    await addBakery();
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network down"));
    const html = await (await SELF.fetch(`${ORIGIN}/admin/setup`, { headers: { Cookie: await cookie() } })).text();
    expect(html).toContain("Couldn&#39;t check:</strong> joesbakery.com");
  });
});

describe("the test email", () => {
  const emailEnv = {
    ...env,
    RESEND_API_KEY: "re_test",
    HASH_SALT: "test-salt-that-is-long-enough",
    EMAIL_FROM: "Accessibility reports <onboarding@resend.dev>",
    TIME_ZONE: "America/New_York",
  };

  function resendAnswers(status: number, body: object) {
    return vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json(body, { status }));
  }

  it("confirms when it was sent", async () => {
    const spy = resendAnswers(200, { id: "x" });
    const result = await sendTestEmail(emailEnv, OWNER);
    expect(result).toEqual({ ok: true, message: expect.stringContaining(`Test email sent to ${OWNER}`) });
    expect(JSON.parse(String(spy.mock.calls[0][1]!.body)).to).toEqual([OWNER]);
  });

  it("explains Resend's test-mode limit in plain words", async () => {
    resendAnswers(403, { message: "You can only send testing emails to your own email address (you@example.com)." });
    const result = await sendTestEmail(emailEnv, OWNER);
    expect(result.ok).toBe(false);
    expect(result.message).toContain("only lets you send to the address you signed up with");
  });

  it("explains an unverified domain", async () => {
    resendAnswers(403, { message: "The joesbakery.com domain is not verified." });
    expect((await sendTestEmail(emailEnv, OWNER)).message).toContain("isn't verified in Resend yet");
  });

  it("explains a wrong API key", async () => {
    resendAnswers(401, { message: "API key is invalid" });
    expect((await sendTestEmail(emailEnv, OWNER)).message).toContain("didn't accept your API key");
  });

  it("says so when email isn't connected", async () => {
    expect((await sendTestEmail({ ...emailEnv, RESEND_API_KEY: "" }, OWNER)).message).toContain("isn't connected yet");
  });

  it("limits how many test emails can be sent in an hour", async () => {
    const c = await cookie();
    const send = () =>
      SELF.fetch(`${ORIGIN}/admin/setup/test-email`, { method: "POST", headers: { Cookie: c, Origin: ORIGIN } });
    for (let i = 0; i < 5; i++) await send();
    expect(await (await send()).text()).toContain("You&#39;ve sent several test emails in the last hour.");
  });
});
