import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

describe("test settings", () => {
  it("never use a real email key, even when .dev.vars has one", () => {
    expect((env as { RESEND_API_KEY?: string }).RESEND_API_KEY).toBe("");
  });
});
