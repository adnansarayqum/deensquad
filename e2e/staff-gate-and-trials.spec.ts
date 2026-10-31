import { existsSync } from "node:fs";
import { devices, expect, test } from "@playwright/test";
import { ADMIN_STATE, newContext, shot } from "./helpers";

// Gate payments, accidents and incidents, and paid trials (migration 0032). Runs after parent-app.spec.ts (files run
// in name order): uses its saved admin sign-in and its "Gate test" session today, with Musa (U7) checked in.

test.describe.configure({ mode: "serial" });

const PHONE = { ...devices["Pixel 7"], viewport: { width: 390, height: 844 }, baseURL: "http://localhost:3100" };

test("a pay-as-you-go child pays £7 at the gate, and it's counted", async ({ browser }) => {
  test.skip(!existsSync(ADMIN_STATE), "run with parent-app.spec.ts: needs its saved admin sign-in");
  const admin = await newContext(browser, { ...PHONE, storageState: ADMIN_STATE });
  const page = await admin.newPage();
  // The fee setting shows £7 by default.
  await page.goto("/admin/sessions");
  await expect(page.getByText("Session fee at the gate: £7")).toBeVisible();
  // Musa's family pays as they go.
  await page.goto("/admin/families?q=musa");
  await page.getByRole("link", { name: /Musa Sample/ }).first().click();
  await page.getByRole("button", { name: "Pay as you go" }).click();
  await expect(page.getByText("Pay as you go", { exact: true }).first()).toBeVisible();

  await page.goto("/coach?group=U7");
  const gateTest = page.getByRole("navigation", { name: "Today's sessions" }).getByRole("link", { name: /Gate test/ });
  if (await gateTest.count()) await gateTest.click();
  await expect(page.getByText(/^Gate test · /)).toBeVisible();
  const here = page.getByRole("region", { name: /^Here/ });
  const pay = here.getByRole("button", { name: "Musa S. paid £7" });
  await expect(pay).toBeVisible();
  expect((await pay.boundingBox())!.height).toBeGreaterThanOrEqual(48);
  await pay.click();
  await expect(here.getByText("Paid £7")).toBeVisible();
  await expect(page.getByText(/Paid at the gate for this session: £7 from 1 child\./)).toBeVisible();
  await page.screenshot({ path: shot("coach-gate-paid"), fullPage: true });
  // A tap by mistake can be undone.
  await here.getByRole("button", { name: "Undo payment for Musa S." }).click();
  await expect(here.getByRole("button", { name: "Musa S. paid £7" })).toBeVisible();
  await expect(page.getByText(/Paid at the gate for this session/)).toHaveCount(0);
  await here.getByRole("button", { name: "Musa S. paid £7" }).click();
  await expect(here.getByText("Paid £7")).toBeVisible();

  // The session's totals: who came by group and what was taken, to check against the card machine.
  await page.getByRole("link", { name: "Session totals" }).click();
  await expect(page.getByRole("heading", { name: /: totals$/ })).toBeVisible();
  await expect(page.getByText("Pay as you go who came")).toBeVisible();
  await expect(page.locator("dd", { hasText: "£7" }).first()).toBeVisible();
  await admin.close();
});

test("a coach logs an accident from the register; the parents are sent it", async ({ browser }) => {
  test.skip(!existsSync(ADMIN_STATE), "run with parent-app.spec.ts: needs its saved admin sign-in");
  const admin = await newContext(browser, { ...PHONE, storageState: ADMIN_STATE });
  const page = await admin.newPage();
  await page.goto("/coach?group=U7");
  const gateTest = page.getByRole("navigation", { name: "Today's sessions" }).getByRole("link", { name: /Gate test/ });
  if (await gateTest.count()) await gateTest.click();
  await page.getByRole("link", { name: "Log an accident or incident" }).click();
  await expect(page.getByRole("heading", { name: "Log an accident or incident" })).toBeVisible();
  await page.getByLabel("Child", { exact: true }).selectOption({ label: "Musa Sample" });
  await page.getByText("Injury", { exact: true }).click();
  await page.getByLabel("What happened").fill("Fell in a tackle and hurt his left knee.");
  await page.getByLabel("What we did").fill("Ice pack, sat out 10 minutes, carried on.");
  await page.screenshot({ path: shot("coach-incident-form"), fullPage: true });
  await page.getByLabel(/I've checked the child, the time and the words/).check();
  await page.getByRole("button", { name: "Log it and tell the parents" }).click();
  await expect(page).toHaveURL(/\/coach\/incidents\?logged=1$/);
  await expect(page.getByText("Logged. The parents have been sent it in the app, and the admins told.")).toBeVisible();
  const entry = page.getByRole("listitem").filter({ hasText: "Musa S." });
  await expect(entry).toContainText("Fell in a tackle");
  await expect(entry).toContainText("Ice pack");
  // The message to the parents, from the coach.
  await entry.getByRole("link", { name: "Messages with the parents" }).click();
  await expect(page.getByText(/^Injury: Musa, at Gate test, /)).toBeVisible();
  // And on the child's page.
  await page.goto("/admin/families?q=musa");
  await page.getByRole("link", { name: /Musa Sample/ }).first().click();
  await expect(page.getByRole("heading", { name: "Accidents and incidents" })).toBeVisible();
  await expect(page.getByText("Fell in a tackle and hurt his left knee.")).toBeVisible();
  await admin.close();
});

test("a new family books a paid trial on the public page; the club sees it", async ({ browser }) => {
  test.skip(!existsSync(ADMIN_STATE), "run with parent-app.spec.ts: needs its saved admin sign-in");
  const visitor = await newContext(browser, PHONE);
  const page = await visitor.newPage();
  const response = await page.goto("/trial");
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "Book a trial session" })).toBeVisible();
  await expect(page.getByText("A trial session costs £7, paid by card or cash at the gate on the day.")).toBeVisible();
  await page.getByLabel("First name").first().fill("Idris");
  await page.getByLabel("Last name").first().fill("Newfamily");
  await page.getByLabel("Date of birth").fill("2019-05-04");
  await page.getByLabel("Group").selectOption("U7");
  // Only U7 sessions are listed once the group is chosen.
  const sessions = page.getByRole("group", { name: "Which session" }).getByRole("radio");
  await expect(sessions.first()).toBeVisible();
  await sessions.first().check();
  await page.getByRole("group", { name: "You", exact: true }).getByLabel("First name").fill("Amina");
  await page.getByRole("group", { name: "You", exact: true }).getByLabel("Last name").fill("Newfamily");
  await page.getByLabel("Email").fill("amina.newfamily@example.com");
  await page.getByLabel(/I've read/).check();
  await page.screenshot({ path: shot("trial-booking"), fullPage: true });
  await page.getByRole("button", { name: "Book the trial" }).click();
  await expect(page).toHaveURL(/\/trial\?booked=1$/);
  await expect(page.getByRole("heading", { name: "Trial booked" })).toBeVisible();
  await visitor.close();

  const admin = await newContext(browser, { ...PHONE, storageState: ADMIN_STATE });
  const staff = await admin.newPage();
  await staff.goto("/admin/sessions");
  await staff.getByRole("link", { name: "Trials" }).click();
  const card = staff.getByRole("listitem").filter({ hasText: "Idris Newfamily" });
  await expect(card).toContainText("Booked");
  await expect(card).toContainText("amina.newfamily@example.com");
  await admin.close();
});
