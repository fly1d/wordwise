import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/site",
  timeout: 20_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? [["html", { open: "never" }], ["list"]] : "list",
  use: {
    baseURL: "http://127.0.0.1:4317",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-chromium", use: { ...devices["iPhone 13"], browserName: "chromium" } },
  ],
  webServer: {
    command: "npm run dev:site",
    url: "http://127.0.0.1:4317",
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
