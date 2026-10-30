import { existsSync } from "node:fs";
import { devices, expect, test, type Page } from "@playwright/test";
import { ADMIN_STATE, newContext, signIn } from "./helpers";

// The flows that matter most on a Friday, as a quick pass on the phone people actually use. In the normal run this
// is one more Chrome test (named zz- so it runs last, after every other spec). With E2E_WEBKIT=1 (the GitHub run) it
// also runs in WebKit, Safari's engine, on an iPhone screen: most of the club's parents and coaches are on iPhones,
// and until Oct 2026 every test ran in Chrome only. Each page is also checked for errors in the browser.
//
// Uses parent7 (a U10 family no other spec touches) and the admin sign-in saved by parent-app.spec.ts.

test.describe.configure({ mode: "serial" });

/** An iPhone in WebKit, the usual Android phone in Chrome. */
const phone = (browserName: string) => ({ ...devices[browserName === "webkit" ? "iPhone 13" : "Pixel 7"], baseURL: "http://localhost:3100" });

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  return errors;
}

test("a parent: News, says their child is coming, the attendance QR code and the To-do list", async ({ browser, browserName }) => {
  const context = await newContext(browser, phone(browserName));
  const page = await context.newPage();
  const errors = watchErrors(page);
  await signIn(page, "parent7@example.com");
  await expect(page).toHaveURL(/\/news$/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  await page.getByRole("link", { name: "Sessions" }).first().click();
  await expect(page).toHaveURL(/\/friday/);
  const coming = page.getByRole("button", { name: /is coming$/ }).first();
  await coming.click();
  await expect(coming).toHaveAttribute("aria-pressed", "true");

  await page.goto("/pass");
  const qr = page.getByRole("img", { name: /^QR code that checks .+ in$/ }).first();
  await expect(qr).toBeVisible();
  await expect.poll(() => qr.evaluate((img) => (img as HTMLImageElement).complete && (img as HTMLImageElement).naturalWidth > 0)).toBe(true);

  await page.goto("/checklist");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  expect(errors, `browser errors in ${browserName}`).toEqual([]);
  await context.close();
});

test("staff: the register opens with Mark here and Undo, and the overview and assistant load", async ({ browser, browserName }) => {
  test.skip(!existsSync(ADMIN_STATE), "run after parent-app.spec.ts: needs its saved admin sign-in");
  const context = await newContext(browser, { ...phone(browserName), storageState: ADMIN_STATE });
  const page = await context.newPage();
  const errors = watchErrors(page);
  await page.goto("/coach?group=U7");
  const gateTest = page.getByRole("navigation", { name: "Today's sessions" }).getByRole("link", { name: /Gate test/ });
  if (await gateTest.count()) await gateTest.click();
  await expect(page.getByText(/^Gate test · /)).toBeVisible();
  await expect(page.getByRole("button", { name: "Scan QR codes" })).toBeEnabled();
  const here = page.getByRole("region", { name: /^Here/ });
  await page.getByRole("button", { name: "Mark Nuh E. here" }).click();
  await expect(here.getByRole("button", { name: "Undo check-in for Nuh E." })).toBeVisible();
  await here.getByRole("button", { name: "Undo check-in for Nuh E." }).click();
  await expect(here.getByRole("button", { name: "Undo check-in for Nuh E." })).toHaveCount(0);

  await page.goto("/admin");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.goto("/admin/assistant");
  await expect(page.getByRole("heading", { name: "Assistant", level: 1 })).toBeVisible();
  expect(errors, `browser errors in ${browserName}`).toEqual([]);
  await context.close();
});
