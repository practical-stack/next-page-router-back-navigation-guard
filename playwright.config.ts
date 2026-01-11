import { defineConfig, devices } from "@playwright/test";

const PORT = process.env.PORT || 30000;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: [["html", { open: "never" }]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "on-first-retry",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "firefox",
      use: {
        ...devices["Desktop Firefox"],
        // [Playwright + Firefox Bug Workaround]
        // Issue: page.goBack() after page.reload() doesn't trigger popstate events in Firefox.
        // Root cause: Firefox Fission (Site Isolation) with default strategy (2) causes
        // history navigation issues in Playwright's CDP-like protocol.
        // Fix: Set fission.webContentIsolationStrategy to 1 (isolateHighValue) instead of
        // default 2 (isolateEverything) to restore correct popstate behavior.
        // Reference: https://github.com/microsoft/playwright/issues/23210
        // Related: https://github.com/microsoft/playwright/issues/22640
        launchOptions: {
          firefoxUserPrefs: {
            "fission.webContentIsolationStrategy": 1,
          },
        },
      },
    },
    {
      name: "webkit",
      use: { ...devices["Desktop Safari"] },
    },
  ],

  webServer: process.env.CI
    ? undefined
    : {
        command: `cd example && PORT=${PORT} pnpm dev`,
        port: Number(PORT),
        reuseExistingServer: false,
      },
});
