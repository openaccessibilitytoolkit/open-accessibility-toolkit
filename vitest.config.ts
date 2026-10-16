import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    // End-to-end tests start a real browser, which can take a while on a cold start.
    testTimeout: 60_000,
  },
});
