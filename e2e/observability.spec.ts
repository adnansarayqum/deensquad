import { expect, test, type Page, type Request } from "@playwright/test";
import { ANALYTICS_OUTBOX, newContext, signIn } from "./helpers";

// Error tracking (Sentry) and page counting (Plausible/Umami) are off unless configured (src/lib/observability).
// The main server (3100) is built and run with neither: nothing may go to Sentry, its /monitoring tunnel or an
// analytics tool. The second server (3101, playwright.config.ts) is the same build with Umami switched on; the
// script is a stand-in served here, which records what the real one would have sent.

const ON = "http://localhost:3101";
const FAMILY = "3f2b8c1e-9a4d-4e6f-8b2a-1c3d5e7f9a0b";
const NOT_ALLOWED = /sentry\.io|\/monitoring|plausible|umami|analytics\.e2e\.invalid/;

test("with Sentry and analytics off, nothing is sent to either", async ({ browser }) => {
  const context = await newContext(browser, { extraHTTPHeaders: { "x-forwarded-for": "10.0.4.1" } });
  const page = await context.newPage();
  const requests: string[] = [];
  page.on("request", (r: Request) => requests.push(r.url()));

  await page.goto("/sign-in?next=%2Fadmin%2Ffamilies%3Fneed%3Dcontract");
  // An in-app navigation, then a full page load.
  await page.getByRole("link", { name: "Sign up" }).click();
  await expect(page).toHaveURL(/\/sign-up$/);
  await page.goto("/sign-in");
  await page.getByRole("link", { name: "How the club uses your information" }).click();
  await expect(page).toHaveURL(/\/privacy$/);
  await page.goto(`/sign-in/${FAMILY}`);
  await page.goto("/privacy");
  await page.waitForLoadState("networkidle");

  expect(requests.filter((url) => NOT_ALLOWED.test(url))).toEqual([]);
  await expect(page.locator("script#ds-analytics")).toHaveCount(0);
  // Sentry's tunnel isn't open either: signed out, /monitoring is like any other private address.
  const tunnel = await context.request.post("/monitoring", { data: '{"dsn":"https://public@o0.ingest.de.sentry.io/0"}\n', maxRedirects: 0 });
  expect(tunnel.status()).toBe(307);
  expect(tunnel.headers().location).toMatch(/\/sign-in/);
  // The privacy notice lists neither while they're off.
  await expect(page.getByText("Sentry", { exact: false })).toHaveCount(0);
  await expect(page.getByText(/Umami|Plausible/)).toHaveCount(0);
  await context.close();
});

/** The stand-in Umami script: records each payload the app hands to umami.track. */
async function fakeUmami(page: Page) {
  await page.route("https://analytics.e2e.invalid/**", (route) =>
    route.fulfill({
      contentType: "text/javascript",
      body: `window.umami = { track: function (p) {
        var base = { website: "e2e-site", hostname: location.hostname, url: location.pathname + location.search, referrer: document.referrer, title: document.title };
        (window.__umami = window.__umami || []).push(typeof p === "function" ? p(base) : p);
      } };`,
    }),
  );
}

const sent = (page: Page) => page.evaluate(() => (window as Window & { __umami?: Record<string, unknown>[] }).__umami ?? []);

test("with analytics on, page views are counted at an address with no ids or query", async ({ browser }) => {
  const context = await newContext(browser, { baseURL: ON, extraHTTPHeaders: { "x-forwarded-for": "10.0.4.2" } });
  const page = await context.newPage();
  await fakeUmami(page);
  const requests: string[] = [];
  page.on("request", (r: Request) => requests.push(r.url()));

  await page.goto("/sign-in/link?token=Zx9_Qw-12345678901234567890");
  await expect(page.locator("script#ds-analytics")).toHaveAttribute("data-auto-track", "false");
  await expect.poll(async () => (await sent(page)).map((p) => p.url)).toContain(`${ON}/sign-in/link`);

  await signIn(page, "admin@deensquad.test", ANALYTICS_OUTBOX);
  await page.goto(`/admin/families/${FAMILY}?need=contract`);
  await expect.poll(async () => (await sent(page)).map((p) => p.url)).toContain(`${ON}/admin/families/:id`);

  const payloads = await sent(page);
  for (const p of payloads) {
    expect(String(p.url)).not.toMatch(/[?#]|3f2b8c1e|token/);
    expect(p.referrer).toBe("");
  }
  // The page counts went to the stand-in only; Sentry is still off on this server.
  expect(requests.filter((url) => /sentry\.io|\/monitoring/.test(url))).toEqual([]);

  // The privacy notice now lists the analytics tool.
  await page.goto("/privacy");
  await expect(page.getByText("counts how often each screen is opened")).toBeVisible();
  await context.close();
});
