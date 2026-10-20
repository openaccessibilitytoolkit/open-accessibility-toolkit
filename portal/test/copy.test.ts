// Tests the "Copy" buttons: owner pages may run the portal's own small script, and
// visitors' pages still run no JavaScript at all.

import { SELF } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { createSession } from "../src/auth.js";

const ORIGIN = "https://portal.test";

beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM sessions"),
    env.DB.prepare("DELETE FROM sites"),
    env.DB.prepare(
      `INSERT INTO sites (id, organization, website, contact_email, created_at, updated_at, reviewed_at)
       VALUES ('joesbakery-com', 'Joe''s Bakery', 'https://joesbakery.com/', 'hello@joesbakery.com', '2026-10-01', '2026-10-01', '2026-10-01')`,
    ),
  ]);
});

async function ownerPage(path: string) {
  const cookie = `__Host-a11y_session=${await createSession(env.DB, "owner@joesbakery.com", Date.now())}`;
  return SELF.fetch(`${ORIGIN}${path}`, { headers: { Cookie: cookie } });
}

describe("copy buttons on a website's page", () => {
  it("offer to copy the footer code and both addresses, hidden until the script shows them", async () => {
    const res = await ownerPage("/admin/sites/joesbakery-com");
    const html = await res.text();
    expect(html).toMatch(/<button type="button" class="copy-button" hidden="" data-copy-target="footer-code" data-copy-status="copy-status-footer-code">Copy footer code<\/button>/);
    expect(html).toContain(`data-copy-text="${ORIGIN}/statement/joesbakery-com"`);
    expect(html).toContain(`data-copy-text="${ORIGIN}/report/joesbakery-com"`);
    expect(html).toContain(`<span id="copy-status-footer-code" class="copy-status" role="status"></span>`);
    expect(html).toContain(`<script src="/admin/copy.js" defer=""></script>`);
  });

  it("are allowed to run only the portal's own script", async () => {
    const res = await ownerPage("/admin/sites/joesbakery-com");
    const csp = res.headers.get("Content-Security-Policy")!;
    // Only the portal's own script file: no inline scripts, no other websites.
    const scriptRule = csp.split(";").map((p) => p.trim()).find((p) => p.startsWith("script-src"));
    expect(scriptRule).toBe("script-src 'self'");
  });
});

describe("the copy script", () => {
  it("is served by the portal as JavaScript, without needing a login", async () => {
    const res = await SELF.fetch(`${ORIGIN}/admin/copy.js`);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/javascript");
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=3600");
    const js = await res.text();
    expect(js).toContain("navigator.clipboard.writeText");
    expect(js).not.toMatch(/fetch\(|XMLHttpRequest|eval\(|innerHTML/);
  });
});

describe("visitors' pages", () => {
  it.each(["/", "/report/joesbakery-com", "/statement/joesbakery-com"])("%s still runs no JavaScript at all", async (path) => {
    const res = await SELF.fetch(`${ORIGIN}${path}`);
    expect(res.headers.get("Content-Security-Policy")).toContain("script-src 'none'");
    expect(await res.text()).not.toContain("<script");
  });
});
