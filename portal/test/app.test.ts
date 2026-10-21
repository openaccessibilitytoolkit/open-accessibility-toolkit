// Tests the portal as a desktop app: the icons, the app settings Chrome and Edge read to
// offer "Install", and the Install button. Visitors' pages get only the tab icon.

import { SELF } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { createSession } from "../src/auth.js";

const ORIGIN = "https://portal.test";
const OWNER = "owner@joesbakery.com"; // in ADMIN_EMAILS for tests

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
  const cookie = `__Host-a11y_session=${await createSession(env.DB, OWNER, Date.now())}`;
  return (await SELF.fetch(`${ORIGIN}${path}`, { headers: { Cookie: cookie } })).text();
}

/** The width and height written in a PNG file's header. */
function pngSize(bytes: Uint8Array): [number, number] {
  expect([...bytes.slice(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  const view = new DataView(bytes.buffer, bytes.byteOffset);
  return [view.getUint32(16), view.getUint32(20)];
}

describe("the desktop app", () => {
  it("has app settings that Chrome and Edge accept for installing", async () => {
    const res = await SELF.fetch(`${ORIGIN}/admin/app.webmanifest`);
    expect(res.headers.get("Content-Type")).toContain("application/manifest+json");
    const manifest = (await res.json()) as { name: string; start_url: string; scope: string; display: string; icons: { src: string; sizes: string; type: string }[] };
    expect(manifest).toMatchObject({ name: "Accessibility portal", start_url: "/admin", scope: "/admin", display: "standalone" });
    // Every icon it lists is really there, at the size it says.
    for (const icon of manifest.icons) {
      const file = await SELF.fetch(`${ORIGIN}${icon.src}`);
      expect(file.status, icon.src).toBe(200);
      expect(file.headers.get("Content-Type"), icon.src).toContain(icon.type);
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (icon.type === "image/png") expect(pngSize(bytes).join("x"), icon.src).toBe(icon.sizes);
    }
    expect(manifest.icons.map((i) => i.sizes)).toEqual(expect.arrayContaining(["192x192", "512x512"]));
  });

  it("has a browser-tab icon with three sizes", async () => {
    const res = await SELF.fetch(`${ORIGIN}/favicon.ico`);
    expect(res.headers.get("Content-Type")).toBe("image/x-icon");
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect([...bytes.slice(0, 6)]).toEqual([0, 0, 1, 0, 3, 0]);
    expect((await SELF.fetch(`${ORIGIN}/icons/not-an-icon.png`)).status).toBe(404);
  });

  it("lets owner pages and the login page be installed", async () => {
    for (const html of [await ownerPage("/admin"), await (await SELF.fetch(`${ORIGIN}/admin/login`)).text()]) {
      expect(html).toContain(`<link rel="manifest" href="/admin/app.webmanifest"/>`);
      expect(html).toContain(`<link rel="icon" href="/favicon.ico" sizes="48x48"/>`);
    }
  });

  it("gives visitors' pages the tab icon, but no app and no script", async () => {
    for (const path of ["/report/joesbakery-com", "/statement/joesbakery-com"]) {
      const res = await SELF.fetch(`${ORIGIN}${path}`);
      const html = await res.text();
      expect(html, path).toContain(`<link rel="icon" href="/favicon.ico" sizes="48x48"/>`);
      expect(html, path).not.toContain("manifest");
      expect(html, path).not.toContain("<script");
      expect(res.headers.get("Content-Security-Policy"), path).toContain("script-src 'none'");
    }
  });

  it("explains how to install on Check my setup, with a button that waits for the browser", async () => {
    const html = await ownerPage("/admin/setup");
    expect(html).toContain("Put the portal on your desktop");
    expect(html).toMatch(/<button type="button" data-install(="[^"]*")? hidden="">Install<\/button>/);
    expect(html).toContain("Add to Dock");
    expect(html).toContain(`<script src="/admin/install.js" defer=""></script>`);
  });

  it("offers it on the Reports page only when the browser can install it", async () => {
    const html = await ownerPage("/admin");
    expect(html).toMatch(/<div class="notice install-offer" data-install-offer(="[^"]*")? hidden="">/);
    expect(html).toContain("Not now");
  });

  it("serves the Install button script", async () => {
    const res = await SELF.fetch(`${ORIGIN}/admin/install.js`);
    expect(res.headers.get("Content-Type")).toContain("javascript");
    expect(await res.text()).toContain("beforeinstallprompt");
  });
});
