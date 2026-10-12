import { existsSync } from "node:fs";
import { devices, expect, test } from "@playwright/test";
import { ADMIN_STATE, newContext, shot, unfold } from "./helpers";

// Admin → Sessions: the weekly "Is <child> coming?" reminder card (src/lib/reminders). Runs after parent-app.spec.ts
// and uses its saved admin sign-in. Nothing is sent here: only the setting is changed and changed back.

const PHONE = { ...devices["Pixel 7"], viewport: { width: 390, height: 844 }, baseURL: "http://localhost:3100" };

test("the admin sees the weekly reminder, moves it to Thursdays at 6pm and back", async ({ browser }) => {
  test.skip(!existsSync(ADMIN_STATE), "run with the earlier tests: needs their saved sign-in");
  const context = await newContext(browser, { ...PHONE, storageState: ADMIN_STATE });
  const page = await context.newPage();
  await page.goto("/admin/sessions");
  const toggle = page.locator('label[for="weekly-reminder"]');
  await expect(toggle).toHaveText("Weekly reminder: Wednesdays at 5pm");
  // Folded: the sessions list still starts on the first screen.
  await expect(page.getByRole("heading", { name: "Coming up" })).toBeInViewport();

  await unfold(page, "weekly-reminder");
  await expect(page.getByText(/^Last sent: |^Not sent yet\.$/)).toBeVisible();
  await expect(page.getByLabel("Send the weekly reminder")).toBeChecked();
  await expect(page.getByLabel("Day", { exact: true })).toHaveValue("3");
  await expect(page.getByLabel("Time", { exact: true })).toHaveValue("17");
  await page.getByLabel("Day", { exact: true }).selectOption({ label: "Thursday" });
  await page.getByLabel("Time", { exact: true }).selectOption({ label: "18:00" });
  await page.screenshot({ path: shot("weekly-reminder-phone"), fullPage: true });
  await page.getByRole("button", { name: "Save reminder" }).click();
  await expect(page.getByText("Saved.", { exact: true })).toBeVisible();
  await expect(toggle).toHaveText("Weekly reminder: Thursdays at 6pm");
  await expect(page.getByLabel("Day", { exact: true })).toHaveValue("4");
  await expect(page.getByLabel("Time", { exact: true })).toHaveValue("18");

  // Off, then back to the owner's Wednesday at 5pm.
  await page.getByLabel("Send the weekly reminder").uncheck();
  await page.getByRole("button", { name: "Save reminder" }).click();
  await expect(toggle).toHaveText("Weekly reminder: Off");
  await page.getByLabel("Send the weekly reminder").check();
  await page.getByLabel("Day", { exact: true }).selectOption({ label: "Wednesday" });
  await page.getByLabel("Time", { exact: true }).selectOption({ label: "17:00" });
  await page.getByRole("button", { name: "Save reminder" }).click();
  await expect(toggle).toHaveText("Weekly reminder: Wednesdays at 5pm");
  await context.close();
});
