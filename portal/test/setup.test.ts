import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import app from "../src/index.js";
import type { Bindings } from "../src/bindings.js";
import { hashSalt } from "../src/settings.js";

// Settings may be missing on purpose here: the portal fills in defaults or stops safely.
async function fetchWith(testEnv: Partial<Bindings>, path: string) {
  const ctx = createExecutionContext();
  const res = await app.fetch(new Request(`https://portal.test${path}`), testEnv as Bindings, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

describe("the privacy key", () => {
  beforeEach(async () => {
    await env.DB.prepare("DELETE FROM settings").run();
  });

  it("is created by the portal itself when the owner didn't set one, and then kept", async () => {
    const first = await hashSalt(env.DB, "");
    expect(first.length).toBeGreaterThanOrEqual(40);
    expect(await hashSalt(env.DB, undefined)).toBe(first);
    const stored = await env.DB.prepare("SELECT value FROM settings WHERE key = 'hash_salt'").first<{ value: string }>();
    expect(stored!.value).toBe(first);
  });

  it("uses the owner's own key when one is set", async () => {
    expect(await hashSalt(env.DB, "an-owner-chosen-key-1234")).toBe("an-owner-chosen-key-1234");
    expect(await env.DB.prepare("SELECT value FROM settings").first()).toBeNull();
  });

  it("lets the portal work without the owner setting a key", async () => {
    const res = await fetchWith({ ...env, HASH_SALT: "" }, "/");
    expect(res.status).toBe(200);
  });
});

describe("a portal whose database isn't ready", () => {
  it("stops with a clear message", async () => {
    const brokenDb = {
      prepare() {
        throw new Error("no such table: settings");
      },
    } as unknown as D1Database;
    const res = await fetchWith({ ...env, HASH_SALT: "", DB: brokenDb }, "/report/joesbakery-com");
    expect(res.status).toBe(503);
    const html = await res.text();
    expect(html).toContain("This portal isn&#39;t set up yet");
    expect(html).toContain("its database isn&#39;t ready yet");
  });
});
