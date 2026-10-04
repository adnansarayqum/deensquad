import { defineConfig, devices } from "@playwright/test";

// End-to-end tests run against a production build on a phone-sized screen.
// Set PLAYWRIGHT_CHROMIUM_PATH to use an already-installed Chromium instead of downloading one.
export default defineConfig({
  testDir: "./e2e",
  outputDir: "./e2e/.results",
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    ...devices["Pixel 7"],
    viewport: { width: 390, height: 844 },
    baseURL: "http://localhost:3100",
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } : {},
  },
  webServer: {
    command: "npm run start -- --port 3100",
    url: "http://localhost:3100/news",
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
