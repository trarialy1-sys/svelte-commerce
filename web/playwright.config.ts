import { defineConfig, devices } from "@playwright/test";

// E2E runs against a seeded TEST DB with all external calls mocked — never prod,
// never live Ozon/Shopify/Resend (chunk 3.4 hard rules). Point E2E_BASE_URL at a
// running instance, or let Playwright boot `next start` locally.
const PORT = 3000;
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  globalSetup: "./e2e/global-setup.ts",
  timeout: 60_000,
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "npm run start",
        url: `${baseURL}/api/health`,
        timeout: 120_000,
        reuseExistingServer: !process.env.CI,
      },
});
