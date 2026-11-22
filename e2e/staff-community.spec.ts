import { existsSync } from "node:fs";
import { devices, expect, test } from "@playwright/test";
import { ADMIN_STATE, COACH_STATE, newContext, shot, signIn } from "./helpers";

// The Community section (src/lib/community): an admin adds a weekly event and puts a practice sheet in Coach's
// corner; a parent sees both from Home; a coach has no Community screen and no Coach's corner tick. Runs after
// parent-app.spec.ts (its saved sign-ins) and removes what it added, so later specs see Home as before.

const PHONE = { ...devices["Pixel 7"], viewport: { width: 390, height: 844 }, baseURL: "http://localhost:3100" };

/** Next Thursday at 8pm London, as a datetime-local value. */
function nextThursday(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + ((4 - d.getUTCDay() + 7) % 7 || 7));
  return `${d.toISOString().slice(0, 10)}T20:00`;
}

test("an admin adds an event and shares a sheet; a parent sees them on the Community page", async ({ browser }) => {
  test.skip(!existsSync(ADMIN_STATE), "run with parent-app.spec.ts: needs its saved admin sign-in");
  const admin = await newContext(browser, { ...PHONE, storageState: ADMIN_STATE });
  const page = await admin.newPage();
  await page.goto("/admin/community");
  await expect(page.getByRole("heading", { name: "Community", level: 1 })).toBeVisible();
  // A finish before the start is refused, and what was typed stays.
  await page.getByLabel("Name", { exact: true }).fill("Brothers' football");
  await page.getByLabel("Who it's for").selectOption("brothers");
  await page.getByLabel("Day and start time").fill(nextThursday());
  await page.getByLabel(/^Finishes at/).fill("19:00");
  await page.getByRole("button", { name: "Add event" }).click();
  await expect(page.getByText("The finish time should be later the same day than the start.")).toBeVisible();
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue("Brothers' football");
  await page.getByLabel(/^Finishes at/).fill("21:00");
  await page.getByLabel("Every week, same day and time").check();
  await page.getByLabel(/^Where/).fill("Bobby Moore Sports Hub");
  await page.getByLabel(/^How to join/).fill("Just turn up");
  await page.getByRole("button", { name: "Add event" }).click();
  await expect(page.getByText("Event added.", { exact: true })).toBeVisible();
  await expect(page.getByText("Edit Brothers' football")).toBeVisible();
  await expect(page.getByText("Every Thursday · 8pm to 9pm")).toBeVisible();
  await page.screenshot({ path: shot("admin-community"), fullPage: true });

  // A practice sheet for U15 only, also put in Coach's corner.
  await page.goto("/coach/practice");
  await page.getByLabel("Title").fill("Ball mastery at home");
  await page.getByLabel(/^Instructions/).fill("1. Ten touches with each foot. 2. Toe taps for 30 seconds.");
  await page.getByText("Only these groups", { exact: true }).click();
  await page.getByRole("checkbox", { name: "U15" }).check();
  await page.getByLabel(/Also put it in Coach's corner/).check();
  await page.getByRole("button", { name: "Share with parents" }).click();
  await expect(page.getByText(/Shared\. Parents in those groups/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Take Ball mastery at home out of Coach's corner" })).toBeVisible();

  const family = await newContext(browser, PHONE);
  const parent = await family.newPage();
  await signIn(parent, "parent9@example.com");
  const row = parent.getByRole("link", { name: /^Community Brothers' football · Every Thursday · 8pm to 9pm$/ });
  await expect(row).toBeVisible();
  await row.click();
  await expect(parent).toHaveURL(/\/community\?from=\/news$/);
  await expect(parent.getByRole("heading", { name: "Community", level: 1 })).toBeVisible();
  await expect(parent.getByRole("link", { name: "What's on" })).toHaveAttribute("aria-current", "page");
  await expect(parent.getByRole("heading", { name: "Brothers' football" })).toBeVisible();
  await expect(parent.getByText("Every Thursday · 8pm to 9pm")).toBeVisible();
  await expect(parent.getByText("For brothers")).toBeVisible();
  await expect(parent.getByText("Just turn up")).toBeVisible();
  await expect(parent.getByRole("link", { name: "Directions to Brothers' football" })).toHaveAttribute("href", /google\.com\/maps\/search/);
  await parent.screenshot({ path: shot("parent-community-whats-on"), fullPage: true });

  await parent.getByRole("link", { name: "Coach's corner" }).click();
  await expect(parent).toHaveURL(/\/community\?show=corner$/);
  await expect(parent.getByRole("heading", { name: "Ball mastery at home" })).toBeVisible();
  // Numbered drills read as a list, as on the practice page.
  await expect(parent.getByRole("listitem").filter({ hasText: "Toe taps for 30 seconds." })).toBeVisible();
  expect(await parent.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await parent.screenshot({ path: shot("parent-community-corner"), fullPage: true });
  // It was written for U15, so it isn't in this family's own practice list.
  await parent.goto("/practice");
  await expect(parent.getByRole("heading", { name: "Ball mastery at home" })).toHaveCount(0);

  // Taken out of Coach's corner and the event removed: the Community row leaves Home.
  await page.getByRole("button", { name: "Take Ball mastery at home out of Coach's corner" }).click();
  await expect(page.getByRole("button", { name: "Put Ball mastery at home in Coach's corner" })).toBeVisible();
  await page.locator("summary[aria-label='Remove: Ball mastery at home']").click();
  await page.getByRole("button", { name: "Yes, remove it: Ball mastery at home" }).click();
  await expect(page.getByRole("heading", { name: "Ball mastery at home" })).toHaveCount(0);
  await page.goto("/admin/community");
  await page.locator("summary", { hasText: "Edit Brothers' football" }).click();
  await page.getByRole("button", { name: "Remove Brothers' football" }).click();
  await expect(page.getByText("Tick the box to remove this event.")).toBeVisible();
  await page.getByLabel("Yes, remove Brothers' football for good").check();
  await page.getByRole("button", { name: "Remove Brothers' football" }).click();
  await expect(page.getByText("Edit Brothers' football")).toHaveCount(0);
  await parent.goto("/news");
  await expect(parent.getByRole("link", { name: /^Community/ })).toHaveCount(0);
  await parent.goto("/community");
  await expect(parent.getByText("Nothing coming up yet.")).toBeVisible();
  await family.close();
  await admin.close();
});

test("a coach has no Community screen and can't put a sheet in Coach's corner", async ({ browser }) => {
  test.skip(!existsSync(COACH_STATE), "run with parent-app.spec.ts: needs its saved coach sign-in");
  const context = await newContext(browser, { ...PHONE, storageState: COACH_STATE });
  const page = await context.newPage();
  await page.goto("/admin/community");
  await expect(page).toHaveURL(/\/admin$/);
  await page.goto("/coach/practice");
  await expect(page.getByLabel("Title")).toBeVisible();
  await expect(page.getByLabel(/Also put it in Coach's corner/)).toHaveCount(0);
  await context.close();
});
