import { existsSync, readFileSync } from "node:fs";
import { devices, expect, test } from "@playwright/test";
import { ADMIN_STATE, OUTBOX, YOUR_DATA_PARENT_STATE, newContext, shot } from "./helpers";

// A parent keeps their own details and their children's up to date, and adds a child, from the Player screen
// (Player → Your family). Uses the family that signed itself up in parent-your-data.spec.ts (Maryam Haddad: Layla
// in U10, Zaid in U7; files run in name order, so that spec's saved sign-in is there) and the admin sign-in saved
// by parent-app.spec.ts to check what the club sees.

test.describe.configure({ mode: "serial" });

const PHONE = { ...devices["Pixel 7"], viewport: { width: 390, height: 844 }, baseURL: "http://localhost:3100" };

test("a parent changes their mobile and a child's date of birth; the admin's child page shows both", async ({ browser }) => {
  test.skip(!existsSync(YOUR_DATA_PARENT_STATE), "needs the sign-up in parent-your-data.spec.ts");
  const context = await newContext(browser, { ...PHONE, storageState: YOUR_DATA_PARENT_STATE });
  const page = await context.newPage();
  await page.goto("/player");
  const family = page.getByRole("region", { name: "Your family" });
  for (const name of ["Layla's details", "Your details", "Add a child"]) {
    expect((await family.getByRole("link", { name }).boundingBox())!.height).toBeGreaterThanOrEqual(48);
  }

  // Your details: the mobile changes, the email can't.
  await family.getByRole("link", { name: "Your details" }).click();
  await expect(page).toHaveURL(/\/player\/me$/);
  await expect(page.getByLabel("First name")).toHaveValue("Maryam");
  await expect(page.getByLabel("Mobile number")).toHaveValue("07700 900777");
  await expect(page.getByText("maryam.haddad@example.com")).toBeVisible();
  await expect(page.getByText("To change your email, ask the club")).toBeVisible();
  await expect(page.getByLabel("Email address")).toHaveCount(0);
  await page.getByLabel("Mobile number").fill("not a number");
  await page.getByRole("button", { name: "Save my details" }).click();
  await expect(page.locator("main").getByRole("alert")).toHaveText("Check your mobile number, like 07700 900123.");
  // What was typed elsewhere is kept.
  await expect(page.getByLabel("First name")).toHaveValue("Maryam");
  await page.getByLabel("Mobile number").fill("+44 7700 900888");
  await page.getByRole("button", { name: "Save my details" }).click();
  await expect(page.locator("main").getByRole("status")).toHaveText("Your details are saved.");
  await expect(page.getByLabel("Mobile number")).toHaveValue("07700 900888");
  await page.screenshot({ path: shot("player-me"), fullPage: true });

  // Layla's details: the date of birth changes; the group is read-only.
  await page.goto("/player");
  await family.getByRole("link", { name: "Layla's details" }).click();
  await expect(page).toHaveURL(/\/player\/child\/[0-9a-f-]{36}$/);
  const childUrl = page.url();
  await expect(page.getByRole("heading", { name: "Layla's details" })).toBeVisible();
  await expect(page.getByLabel("Date of birth")).toHaveValue("2016-04-01");
  await expect(page.getByText("Groups are set by the club. Ask a coach if it looks wrong.")).toBeVisible();
  await expect(page.getByLabel("Group")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Emergency contacts for Layla" })).toHaveAttribute("href", /^\/checklist\/contacts\?child=/);
  await expect(page.getByRole("link", { name: "Photo consent for Layla" })).toHaveAttribute("href", /^\/checklist\/consent\?child=/);
  await page.getByLabel("Date of birth").fill("2030-01-01");
  await page.getByRole("button", { name: "Save details" }).click();
  await expect(page.locator("main").getByRole("alert")).toHaveText("Layla's date of birth can't be in the future.");
  await page.getByLabel("Date of birth").fill("2016-04-02");
  await page.getByRole("button", { name: "Save details" }).click();
  await expect(page.locator("main").getByRole("status")).toHaveText("Layla's details are saved.");
  await page.screenshot({ path: shot("player-child"), fullPage: true });

  // Another family's child, by id, is a 404, not a page.
  const otherId = childUrl.replace(/[0-9a-f]{8}-/, "00000000-");
  const res = await page.goto(otherId);
  expect(res?.status()).toBe(404);
  await context.close();

  test.skip(!existsSync(ADMIN_STATE), "run with parent-app.spec.ts: needs its saved admin sign-in");
  const adminContext = await newContext(browser, { ...PHONE, storageState: ADMIN_STATE });
  const admin = await adminContext.newPage();
  await admin.goto(childUrl.replace("/player/child/", "/admin/families/"));
  await expect(admin.getByRole("heading", { name: "Layla Haddad" })).toBeVisible();
  await expect(admin.getByLabel("Date of birth")).toHaveValue("2016-04-02");
  await expect(admin.getByText(/^Last changed by the parent on \d{1,2} \w{3}\.$/)).toBeVisible();
  await expect(admin.getByText("07700 900888")).toBeVisible();
  await adminContext.close();
});

test("a parent adds a child in U10: on Player, on Friday, on the admin's Families, and the club is emailed", async ({ browser }) => {
  test.skip(!existsSync(YOUR_DATA_PARENT_STATE), "needs the sign-up in parent-your-data.spec.ts");
  const context = await newContext(browser, { ...PHONE, storageState: YOUR_DATA_PARENT_STATE });
  const page = await context.newPage();
  await page.goto("/player/add-child");
  await expect(page.getByRole("heading", { name: "Add a child" })).toBeVisible();
  await expect(page.getByLabel("Last name")).toHaveValue("Haddad");
  await expect(page.getByText("Other parents can be added by the club.")).toBeVisible();
  await page.screenshot({ path: shot("player-add-child"), fullPage: true });

  // A child already on the account (same first name and date of birth) is refused.
  await page.getByLabel("First name").fill("Zaid");
  await page.getByLabel("Date of birth").fill("2019-02-01");
  await page.getByLabel("Group").selectOption("U7");
  await page.getByRole("button", { name: "Add child" }).click();
  await expect(page.locator("main").getByRole("alert")).toHaveText("Zaid is already on your account.");

  const before = readFileSync(OUTBOX, "utf8").trim().split("\n").length;
  await page.getByLabel("First name").fill("Omar");
  await page.getByLabel("Date of birth").fill("2017-09-09");
  await page.getByLabel("Group").selectOption("U10");
  await page.getByRole("button", { name: "Add child" }).click();
  await expect(page).toHaveURL(/\/player\?child=[0-9a-f-]{36}&added=1$/);
  await expect(page.locator("main").getByRole("status").filter({ hasText: "Omar" })).toHaveText("Omar is now on your account. The club has been told and will check their group.");
  await expect(page.getByRole("heading", { name: "Omar H." })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Choose a child" }).getByRole("link", { name: "Omar" })).toBeVisible();

  // Friday asks about him with the U10s.
  await page.goto("/friday");
  await expect(page.getByRole("group", { name: /Is Omar coming/ })).toBeVisible();

  const mails = readFileSync(OUTBOX, "utf8")
    .trim()
    .split("\n")
    .slice(before)
    .map((l) => JSON.parse(l) as { to: string; subject: string; text: string });
  const told = mails.filter((m) => m.subject === "New child added by Maryam Haddad: Omar (U10)");
  expect(told.map((m) => m.to)).toEqual(["admin@deensquad.test"]);
  expect(told[0].text).toContain("check the group is right");
  await context.close();

  test.skip(!existsSync(ADMIN_STATE), "run with parent-app.spec.ts: needs its saved admin sign-in");
  const adminContext = await newContext(browser, { ...PHONE, storageState: ADMIN_STATE });
  const admin = await adminContext.newPage();
  await admin.goto("/admin/families?group=U10&q=Omar");
  await expect(admin.getByText("Omar Haddad").filter({ visible: true })).toBeVisible();
  await adminContext.close();
});
