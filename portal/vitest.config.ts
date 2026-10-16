// Tests run inside Cloudflare's real Workers runtime, on this computer, with a
// local database that is set up fresh from the migrations.

import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig(async () => {
  const migrations = await readD1Migrations("./migrations");
  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: "./wrangler.jsonc" },
        miniflare: {
          bindings: {
            TEST_MIGRATIONS: migrations,
            // Tests must never send real emails, even if .dev.vars holds a real key.
            RESEND_API_KEY: "",
            HASH_SALT: "test-salt-that-is-long-enough",
            ADMIN_EMAILS: "owner@joesbakery.com, Second@Example.com",
            TIME_ZONE: "America/New_York",
            EMAIL_FROM: "Accessibility reports <onboarding@resend.dev>",
          },
        },
      }),
    ],
    test: {
      include: ["test/**/*.test.ts"],
      setupFiles: ["./test/apply-migrations.ts"],
    },
  };
});
