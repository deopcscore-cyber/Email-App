import { defineConfig, devices } from "@playwright/test";

/**
 * E2E suite against a running NovaMail stack (API + web, migrated and
 * seeded). Unlike the Jest/Vitest suites, this doesn't boot the stack
 * itself — see README "Running tests" for the one-time setup. That keeps
 * the config honest about what's actually verified: the real app, not a
 * synthetic harness.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI === "1" ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: {
          executablePath: "/opt/pw-browsers/chromium",
        },
      },
    },
  ],
});
