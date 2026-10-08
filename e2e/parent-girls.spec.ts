import { existsSync } from "node:fs";
import { devices, expect, test } from "@playwright/test";
import { ADMIN_STATE, GIRLS_PARENT_STATE, latestCode, newContext, shot, unfold } from "./helpers";

// The Girls group (the owner's decision): a family signs up with a daughter in Girls, the admin adds a Girls
// session, her Friday shows it and its register lists her. Runs after parent-app.spec.ts (files run in name
// order), against the same server, and uses its saved admin sign-in. The session is days ahead and for Girls
// only, so no other family's Friday or today's register changes.

test.describe.configure({ mode: "serial" });

const PHONE = { ...devices["Pixel 7"], viewport: { width: 390, height: 844 }, baseURL: "http://localhost:3100" };
const EMAIL = "khadija.rahman@example.com";
const TITLE = "Girls training";
const AHEAD = new Date(Date.now() + 5 * 86400000);
const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(AHEAD);
const day = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", weekday: "short", day: "numeric", month: "short" }).format(AHEAD);
let sessionId = "";

test("a family signs up with a daughter in Girls", async ({ browser }) => {
  const context = await newContext(browser, { ...PHONE, extraHTTPHeaders: { "x-forwarded-for": "10.0.7.1" } });
  const page = await context.newPage();
  await page.goto("/sign-up");
  await page.getByLabel("First name").first().fill("Khadija");
  await page.getByLabel("Last name").first().fill("Rahman");
  await page.getByLabel("Email address").fill(EMAIL);
  await page.locator("#childFirstName-0").fill("Amina");
  await page.locator("#childDob-0").fill("2015-03-01");
  // Girls comes last in the picker, after the age groups.
  const options = await page.locator("#childGroup-0 option").allTextContents();
  expect(options.at(-1)).toBe("Girls (all ages)");
  expect(options).toContain("U6");
  await page.locator("#childGroup-0").selectOption({ label: "Girls (all ages)" });
  await page.getByRole("button", { name: "Sign up" }).click();
  await expect(page).toHaveURL(/\/sign-in\/code$/);
  await page.getByLabel("6-digit code").fill(latestCode(EMAIL));
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/checklist$/);
  await expect(page.getByText("Girls · joined", { exact: false })).toBeVisible();
  await context.storageState({ path: GIRLS_PARENT_STATE });
  await context.close();
});

test("the admin adds a Girls session; it's on her Friday and its register lists her", async ({ browser }) => {
  test.skip(!existsSync(ADMIN_STATE) || !existsSync(GIRLS_PARENT_STATE), "run with the earlier tests: needs their saved sign-in");
  const admin = await newContext(browser, { ...PHONE, storageState: ADMIN_STATE });
  const page = await admin.newPage();
  await page.goto("/admin/sessions");
  await unfold(page, "add-sessions");
  await page.getByLabel("Title").fill(TITLE);
  await page.getByLabel("Date", { exact: true }).fill(date);
  await page.getByLabel("Starts").fill("10:00");
  await page.getByLabel("Finishes").fill("11:00");
  // Girls trains on its own: the form opens with the age groups ticked and Girls not.
  for (const g of ["U6", "U7", "U10", "U12", "U15"]) await expect(page.getByLabel(g, { exact: true })).toBeChecked();
  await expect(page.getByLabel("Girls", { exact: true })).not.toBeChecked();
  for (const g of ["U6", "U7", "U10", "U12", "U15"]) await page.getByLabel(g, { exact: true }).uncheck();
  await page.getByLabel("Girls", { exact: true }).check();
  await page.getByRole("button", { name: "Add sessions" }).click();
  await expect(page.getByText(/^Added 1 session\./)).toBeVisible();
  sessionId = (await page.getByRole("link", { name: `Edit ${TITLE} ${day}` }).getAttribute("href"))!.split("/")[3];

  const parent = await newContext(browser, { ...PHONE, storageState: GIRLS_PARENT_STATE });
  const friday = await parent.newPage();
  await friday.goto("/friday");
  await expect(friday.getByText(`${day} · Girls`, { exact: true })).toBeVisible();
  await expect(friday.getByRole("group", { name: `Is Amina coming? ${day}` }).getByRole("button", { name: "Amina is coming" })).toBeVisible();
  await expect(friday.getByRole("heading", { name: `${TITLE} briefing` })).toBeVisible();
  await expect(friday.getByRole("region", { name: "Girls this week" })).toContainText("Girls coming this week");
  await expect(friday.locator("body")).not.toContainText("Girlss");
  await friday.screenshot({ path: shot("girls-friday") });
  await parent.close();

  await page.goto(`/coach?session=${sessionId}`);
  await expect(page.getByRole("heading", { name: "Girls", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Mark Amina R. here" })).toBeVisible();
  await expect(page.getByText("Not here yet (1)")).toBeVisible();
  await page.screenshot({ path: shot("girls-register") });
  await admin.close();
});
