import { existsSync } from "node:fs";
import { devices, expect, test } from "@playwright/test";
import { ADMIN_STATE, COACH_STATE, newContext, shot, signIn } from "./helpers";

// Sponsors (src/lib/sponsors): an admin adds one with a logo, link and offer; a parent sees it on Home and on the
// Our sponsors page; a coach has no Sponsors screen. Runs after parent-app.spec.ts (its saved admin sign-in) and
// removes the sponsor at the end, so later specs see Home as before.

const PHONE = { ...devices["Pixel 7"], viewport: { width: 390, height: 844 }, baseURL: "http://localhost:3100" };

test("an admin adds a sponsor; a parent sees it on Home and its page; then it's removed", async ({ browser }) => {
  test.skip(!existsSync(ADMIN_STATE), "run with parent-app.spec.ts: needs its saved admin sign-in");
  const admin = await newContext(browser, { ...PHONE, storageState: ADMIN_STATE });
  const page = await admin.newPage();
  await page.goto("/admin/sponsors");
  await expect(page.getByRole("heading", { name: "Sponsors", level: 1 })).toBeVisible();
  // With none yet the form is open. A link that isn't https is refused and what was typed stays.
  await page.getByLabel("Name", { exact: true }).fill("Corner Bakery");
  await page.getByLabel(/^What they sponsor/).fill("U10 tournament kit");
  await page.getByLabel(/^About them/).fill("Fresh bread on the high street since 2009.");
  await page.getByLabel(/^Website or social page/).fill("http://example.com");
  await page.getByRole("button", { name: "Add sponsor" }).click();
  await expect(page.getByText("The link should be a full address starting with https://")).toBeVisible();
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue("Corner Bakery");
  await page.getByLabel(/^Website or social page/).fill("https://www.instagram.com/cornerbakery");
  await page.getByLabel(/^Offer for Deen Squad families/).fill("10% off");
  await page.getByLabel(/^How to claim it/).fill("Show this screen at the till");
  await page.getByLabel("Add a logo").setInputFiles("public/crest.png");
  await page.getByRole("button", { name: "Add sponsor" }).click();
  await expect(page.getByText("Sponsor added.", { exact: true })).toBeVisible();
  await expect(page.getByText("Edit Corner Bakery")).toBeVisible();
  await page.screenshot({ path: shot("admin-sponsors"), fullPage: true });

  const family = await newContext(browser, PHONE);
  const parent = await family.newPage();
  await signIn(parent, "parent9@example.com");
  const row = parent.getByRole("link", { name: "Our sponsors: 1 offer for Deen Squad families" });
  await expect(row).toBeVisible();
  await row.click();
  await expect(parent).toHaveURL(/\/sponsors\?from=\/news$/);
  await expect(parent.getByRole("heading", { name: "Our sponsors", level: 1 })).toBeVisible();
  await expect(parent.getByRole("banner").getByRole("link", { name: "Home" })).toBeVisible();
  await expect(parent.getByRole("heading", { name: "Corner Bakery" })).toBeVisible();
  await expect(parent.getByText("Sponsors the U10 tournament kit")).toBeVisible();
  await expect(parent.getByText("10% off", { exact: true })).toBeVisible();
  await expect(parent.getByText("Show this screen at the till")).toBeVisible();
  const link = parent.getByRole("link", { name: "See them on Instagram: Corner Bakery (opens outside the app)" });
  await expect(link).toHaveAttribute("href", "https://www.instagram.com/cornerbakery");
  await expect(link).toHaveAttribute("target", "_blank");
  await expect(link).toHaveAttribute("rel", "noopener noreferrer");
  // The logo is the club's stored copy, and it loads for a parent.
  const logo = parent.locator('main img[src^="/api/files/"]');
  await expect(logo).toHaveCount(1);
  expect((await parent.request.get((await logo.getAttribute("src"))!)).status()).toBe(200);
  expect(await parent.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await parent.screenshot({ path: shot("parent-sponsors"), fullPage: true });

  // Hidden: gone from the parent's Home and page at once.
  await page.locator("summary", { hasText: "Edit Corner Bakery" }).click();
  await page.getByLabel("Show to parents").last().uncheck();
  await page.getByRole("button", { name: "Save Corner Bakery" }).click();
  await expect(page.getByText("Saved.", { exact: true })).toBeVisible();
  await parent.goto("/sponsors");
  await expect(parent.getByText("No sponsors to show yet.")).toBeVisible();
  await parent.goto("/news");
  await expect(parent.getByRole("link", { name: /^Our sponsors/ })).toHaveCount(0);

  // Removing needs the box ticked.
  await page.getByRole("button", { name: "Remove Corner Bakery" }).click();
  await expect(page.getByText("Tick the box to remove this sponsor.")).toBeVisible();
  await page.getByLabel("Yes, remove Corner Bakery and its logo for good").check();
  await page.getByRole("button", { name: "Remove Corner Bakery" }).click();
  await expect(page.getByText("Edit Corner Bakery")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Add sponsor" })).toBeVisible();
  await family.close();
  await admin.close();
});

test("a coach has no Sponsors screen", async ({ browser }) => {
  test.skip(!existsSync(COACH_STATE), "run with parent-app.spec.ts: needs its saved coach sign-in");
  const context = await newContext(browser, { ...PHONE, storageState: COACH_STATE });
  const page = await context.newPage();
  await page.goto("/admin/sponsors");
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole("link", { name: "Sponsors" })).toHaveCount(0);
  await context.close();
});
