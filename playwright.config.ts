import { defineConfig, devices } from "@playwright/test";

// End-to-end tests run against a production build on a phone-sized screen, with a fresh in-memory
// database holding the sample club and emails written to e2e/.results/outbox.jsonl. A second server
// (port 3101) runs the same build with analytics switched on, for e2e/observability.spec.ts.
// Set E2E_DATABASE_URL to run against a real (empty, throwaway) Postgres instead.
// Set PLAYWRIGHT_CHROMIUM_PATH to use an already-installed Chromium instead of downloading one.

const shared = [
  "DEV_SEED=1",
  "ADMIN_EMAILS=",
  "CRON_SECRET=e2e-cron-secret",
  "QR_SECRET=e2e-qr-secret",
  "BANK_ACCOUNT_NAME='Deen Squad FA'",
  "BANK_SORT_CODE=00-00-00",
  "BANK_ACCOUNT_NUMBER=12345678",
  "ANTHROPIC_API_KEY=e2e-fake",
  "ANTHROPIC_API_URL=http://localhost:3199/v1/messages",
];
const env = [
  `DATABASE_URL=${process.env.E2E_DATABASE_URL ?? "pglite://memory"}`,
  "EMAIL_OUTBOX=e2e/.results/outbox.jsonl",
  "APP_URL=http://localhost:3100",
  // The club's own settings, on this server only: the 3101 server shows what parents see without them.
  "TEAMFEEPAY_URL=https://teamfeepay.example/deensquad",
  "CLUB_FEE_TEXT='£30 a month per child, paid by direct debit through TeamFeePay'",
  "CLUB_INFO_TEXT='Training is on Fridays at Bobby Moore Sports Hub. Sign up, then come along.'",
  ...shared,
].join(" ");
// The same build with page counting on (Umami), for e2e/observability.spec.ts. Its own in-memory database and outbox;
// the script address is never fetched (the test serves a stand-in with page.route). Read at run time, so no rebuild.
const analyticsEnv = [
  "DATABASE_URL=pglite://memory",
  "EMAIL_OUTBOX=e2e/.results/outbox-analytics.jsonl",
  "APP_URL=http://localhost:3101",
  "NEXT_PUBLIC_ANALYTICS=umami",
  "NEXT_PUBLIC_UMAMI_WEBSITE_ID=e2e-site",
  "NEXT_PUBLIC_UMAMI_SRC=https://analytics.e2e.invalid/script.js",
  ...shared,
].join(" ");

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
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
    {
      command: `rm -f e2e/.results/outbox-analytics.jsonl && ${analyticsEnv} npx next start --port 3101`,
      url: "http://localhost:3101/api/health",
      reuseExistingServer: false,
      timeout: 90_000,
    },
  ],
});
