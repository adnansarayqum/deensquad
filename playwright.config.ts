import { defineConfig, devices } from "@playwright/test";

// End-to-end tests run against a production build on a phone-sized screen, with a fresh in-memory
// database holding the sample club and emails written to e2e/.results/outbox.jsonl.
// Set E2E_DATABASE_URL to run against a real (empty, throwaway) Postgres instead.
// Set PLAYWRIGHT_CHROMIUM_PATH to use an already-installed Chromium instead of downloading one.

const env = [
  `DATABASE_URL=${process.env.E2E_DATABASE_URL ?? "pglite://memory"}`,
  "DEV_SEED=1",
  "EMAIL_OUTBOX=e2e/.results/outbox.jsonl",
  "ADMIN_EMAILS=",
  "APP_URL=http://localhost:3100",
  "CRON_SECRET=e2e-cron-secret",
  "QR_SECRET=e2e-qr-secret",
  "BANK_ACCOUNT_NAME='Deen Squad FA'",
  "BANK_SORT_CODE=00-00-00",
  "BANK_ACCOUNT_NUMBER=12345678",
  "ANTHROPIC_API_KEY=e2e-fake",
  "ANTHROPIC_API_URL=http://localhost:3199/v1/messages",
].join(" ");

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./e2e/.results/artifacts",
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    ...devices["Pixel 7"],
    viewport: { width: 390, height: 844 },
    baseURL: "http://localhost:3100",
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } : {},
  },
  webServer: [
    { command: "node e2e/fake-claude.mjs", url: "http://localhost:3199/health", reuseExistingServer: false },
    {
      command: `rm -f e2e/.results/outbox.jsonl && ${env} npx next start --port 3100`,
      url: "http://localhost:3100/api/health",
      reuseExistingServer: false,
      timeout: 90_000,
    },
  ],
});
