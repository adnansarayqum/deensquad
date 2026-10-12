import { existsSync, readFileSync } from "node:fs";
import { devices, expect, test, type Page } from "@playwright/test";
import { ADMIN_STATE, COACH_STATE, OUTBOX, RATINGS_PARENT_STATE, newContext, shot, signIn } from "./helpers";

// Player ratings and progress reports (migration 0026), hidden from parents until an admin switches them on. Runs
// after parent-app.spec.ts (files run in name order) and uses its saved sign-ins: Coach Hamza coaches the U7s by then.
// Yunus V. (parent19) and Dawud L. (parent18) are in the sample club's U7s.

test.describe.configure({ mode: "serial" });

const PHONE = { ...devices["Pixel 7"], viewport: { width: 390, height: 844 }, baseURL: "http://localhost:3100" };
const CATEGORIES = ["Technique", "Game understanding", "Physical", "Attitude and effort", "Teamwork"];

async function rate(page: Page, child: string, scores: number[]) {
  for (const [i, cat] of CATEGORIES.entries()) await page.getByLabel(`${cat} for ${child}: ${scores[i]} of 5`).check();
}

test("a coach rates two children after a session and writes Yunus's report; his parent sees nothing yet", async ({ browser }) => {
  test.skip(!existsSync(COACH_STATE), "run with parent-app.spec.ts: needs its saved coach sign-in");
  const context = await newContext(browser, { ...PHONE, storageState: COACH_STATE });
  const page = await context.newPage();
  await page.goto("/coach/awards");
  await page.getByRole("link", { name: "Rate players" }).click();
  await expect(page).toHaveURL(/\/coach\/ratings$/);
  await expect(page.getByRole("heading", { name: "Ratings", level: 1 })).toBeVisible();
  const u7 = page.getByRole("navigation", { name: "Groups" }).getByRole("link", { name: "U7", exact: true });
  if (await u7.count()) await u7.click();

  // Each score is a 48px tap target named for the child and category.
  const four = page.getByLabel("Technique for Yunus: 4 of 5");
  expect((await page.locator("label", { has: four }).boundingBox())!.height).toBeGreaterThanOrEqual(48);
  // A row with some scores but not all is refused by name, and nothing is saved.
  await rate(page, "Yunus", [4, 3, 5, 4, 3]);
  await page.getByLabel("Technique for Dawud: 2 of 5").check();
  await page.getByRole("button", { name: "Save ratings" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Finish all five" })).toContainText("Dawud (Game understanding, Physical, Attitude and effort, Teamwork)");
  await expect(page.getByLabel("Technique for Yunus: 4 of 5")).toBeChecked();
  await rate(page, "Dawud", [2, 3, 3, 4, 5]);
  await page.getByRole("button", { name: "Save ratings" }).click();
  await expect(page.getByText("Saved ratings for 2 children.")).toBeVisible();
  await page.screenshot({ path: shot("coach-ratings") });

  // Yunus's page: the pentagon and his scores, then his report, drafted by the (stand-in) AI and published.
  await page.goto("/coach/awards?group=U7");
  await page.getByRole("link", { name: /Yunus V/ }).click();
  await expect(page.getByRole("img", { name: /^Yunus's ratings, last 3 months: Technique 4\.0 of 5;/ })).toBeVisible();
  await expect(page.getByText("Physical 5.0 of 5")).toBeVisible();
  await expect(page.getByText(/^Rated once, in \w+ · last .+ by Coach Hamza$/)).toBeVisible();
  await page.getByRole("button", { name: "Draft with AI" }).click();
  const report = page.getByLabel(/^Yunus's report for /);
  await expect(report).toHaveValue(/^Yunus has worked hard this month\./);
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByText("Saved. Parents will see it once progress reports are switched on.")).toBeVisible();
  await expect(page.getByText(/^Published \d+ \w+ · last saved by Coach Hamza$/)).toBeVisible();
  await page.screenshot({ path: shot("coach-progress"), fullPage: true });
  // The switch is for admins only.
  await page.goto("/coach/ratings");
  await expect(page.getByText(/Parents see ratings and progress reports/)).toHaveCount(0);
  await context.close();

  const parentContext = await newContext(browser, PHONE);
  const parent = await parentContext.newPage();
  await signIn(parent, "parent19@example.com");
  await parent.goto("/player");
  await expect(parent.getByRole("heading", { name: "Yunus V." })).toBeVisible();
  await expect(parent.getByRole("heading", { name: "Progress", exact: true })).toHaveCount(0);
  await expect(parent.getByText(/worked hard this month/)).toHaveCount(0);
  expect((await parent.goto("/player/progress"))?.status()).toBe(404);
  await parentContext.storageState({ path: RATINGS_PARENT_STATE });
  await parentContext.close();
});

test("an admin switches progress on: the parent sees Yunus's pentagon and report, and nothing once it's off again", async ({ browser }) => {
  test.skip(!existsSync(ADMIN_STATE) || !existsSync(RATINGS_PARENT_STATE), "needs the saved admin sign-in and the test above");
  const admin = await newContext(browser, { ...PHONE, storageState: ADMIN_STATE });
  const page = await admin.newPage();
  await page.goto("/coach/ratings");
  await expect(page.getByRole("heading", { name: "Parents see ratings and progress reports: Off" })).toBeVisible();
  await page.getByLabel("Yes, show parents their child's ratings and published reports").check();
  await page.getByRole("button", { name: "Switch on" }).click();
  await expect(page.getByRole("heading", { name: "Parents see ratings and progress reports: On" })).toBeVisible();
  await expect(page.getByText(/No emails were sent for earlier reports/)).toBeVisible();
  // Staff only: group averages this month.
  await expect(page.getByRole("table", { name: "Average rating per category this month, by group" })).toBeVisible();

  const parentContext = await newContext(browser, { ...PHONE, storageState: RATINGS_PARENT_STATE });
  const parent = await parentContext.newPage();
  await parent.goto("/player");
  await expect(parent.getByRole("heading", { name: "Progress", exact: true })).toBeVisible();
  await expect(parent.getByRole("img", { name: /^Yunus's ratings, last 3 months:/ })).toBeVisible();
  await expect(parent.getByText("Technique 4.0 of 5")).toBeVisible();
  await expect(parent.getByText(/^Rated once, in \w+$/)).toBeVisible();
  await expect(parent.getByRole("heading", { name: /^Progress report: \w+ \d{4}$/ })).toBeVisible();
  await expect(parent.getByText("From Coach Hamza")).toBeVisible();
  await expect(parent.getByText(/^Yunus has worked hard this month\./)).toBeVisible();
  // Nothing about other children, groups or averages.
  await expect(parent.getByText(/Dawud|average/i)).toHaveCount(0);
  await parent.screenshot({ path: shot("parent-progress"), fullPage: true });
  await parent.emulateMedia({ colorScheme: "dark" });
  await parent.screenshot({ path: shot("parent-progress-dark"), fullPage: true });
  await parent.emulateMedia({ colorScheme: "light" });
  // Published while it was off: switching on emailed nobody.
  const mails = readFileSync(OUTBOX, "utf8").trim().split("\n").map((l) => JSON.parse(l) as { to: string; subject: string });
  expect(mails.filter((m) => /progress report/.test(m.subject))).toEqual([]);

  await page.getByRole("button", { name: "Switch off" }).click();
  await expect(page.getByRole("heading", { name: "Parents see ratings and progress reports: Off" })).toBeVisible();
  await parent.reload();
  await expect(parent.getByRole("heading", { name: "Yunus V." })).toBeVisible();
  await expect(parent.getByRole("heading", { name: "Progress", exact: true })).toHaveCount(0);
  await expect(parent.getByText(/worked hard this month/)).toHaveCount(0);
  await admin.close();
  await parentContext.close();
});
