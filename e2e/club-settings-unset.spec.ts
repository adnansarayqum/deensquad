import { expect, test } from "@playwright/test";
import { ANALYTICS_OUTBOX, newContext, signIn } from "./helpers";

// What parents see before the club has set TEAMFEEPAY_URL, CLUB_FEE_TEXT and CLUB_INFO_TEXT. The second server
// (3101, playwright.config.ts) runs without them; the main server (3100) has all three, see parent-app.spec.ts.

const UNSET = "http://localhost:3101";

test("without the club's payment link and fee: parents are told to ask, and can't say they've set it up", async ({ browser }) => {
  const context = await newContext(browser, { baseURL: UNSET, viewport: { width: 390, height: 844 }, extraHTTPHeaders: { "x-forwarded-for": "10.0.5.1" } });
  const page = await context.newPage();

  // No "About the club" box on sign-up.
  await page.goto("/sign-up");
  await expect(page.getByRole("heading", { name: "Join the club" })).toBeVisible();
  await expect(page.getByRole("region", { name: "About the club" })).toHaveCount(0);

  await signIn(page, "parent6@example.com", ANALYTICS_OUTBOX);
  await page.goto("/checklist");
  await expect(page.getByRole("link", { name: /Set up payments.*Ask the club about fees/ })).toBeVisible();
  await page.getByRole("link", { name: /Set up payments/ }).click();
  await expect(page.getByText("Ask the club about fees.")).toBeVisible();
  await expect(page.getByText("The club will tell you how to pay.")).toBeVisible();
  await expect(page.getByRole("button", { name: /I've set it up/ })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Open TeamFeePay/ })).toHaveCount(0);
  await context.close();
});
