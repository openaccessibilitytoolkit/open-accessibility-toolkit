import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import app from "../src/index.js";

describe("a portal that isn't fully set up", () => {
  it("stops with a clear message instead of storing visitors' details unprotected", async () => {
    const ctx = createExecutionContext();
    const res = await app.fetch(
      new Request("https://portal.test/report/joesbakery-com"),
      { ...env, HASH_SALT: "" },
      ctx,
    );
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(503);
    const html = await res.text();
    expect(html).toContain("This portal isn&#39;t set up yet");
    expect(html).toContain("Missing setting: HASH_SALT.");
  });
});
