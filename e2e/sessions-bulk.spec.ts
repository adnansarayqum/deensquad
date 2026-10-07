import { existsSync } from "node:fs";
import { devices, expect, test } from "@playwright/test";
import { ADMIN_STATE, GIRLS_PARENT_STATE, newContext, shot, unfold } from "./helpers";

// Bulk changes on Admin → Sessions: tick sessions, then Edit, Cancel, Restore or Delete them together from the
// sticky bar. Runs after parent-app.spec.ts and parent-girls.spec.ts (files run in name order) and uses their saved
// sign-ins: the admin's, and the family with a daughter in Girls (so her Friday shows the Girls-only sessions
// added here and no other family's changes). "Gate test" (today, with Musa checked in by parent-app.spec.ts) is
// the session a bulk delete must keep.

test.describe.configure({ mode: "serial" });

const PHONE = { ...devices["Pixel 7"], viewport: { width: 390, height: 844 }, baseURL: "http://localhost:3100" };
const TITLE = "Girls cup";
const dateOf = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(d);
const dayOf = (d: Date) => new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", weekday: "short", day: "numeric", month: "short" }).format(d);
// Two days ahead and three: before the Girls training parent-girls.spec.ts adds five days ahead, so once cancelled
// they show on her Friday ahead of it.
const DAYS = [new Date(Date.now() + 2 * 86400000), new Date(Date.now() + 3 * 86400000)];
const today = dayOf(new Date());

test("the admin adds two Girls sessions, bulk edits the venue only, bulk cancels them with a reason, and the parent sees both", async ({ browser }) => {
  test.skip(!existsSync(ADMIN_STATE) || !existsSync(GIRLS_PARENT_STATE), "run with the earlier tests: needs their saved sign-in");
  const admin = await newContext(browser, { ...PHONE, storageState: ADMIN_STATE });
  const page = await admin.newPage();
  for (const d of DAYS) {
    await page.goto("/admin/sessions");
    await unfold(page, "add-sessions");
    await page.getByLabel("Title").fill(TITLE);
    await page.getByLabel("Date", { exact: true }).fill(dateOf(d));
    await page.getByLabel("Starts").fill("10:00");
    await page.getByLabel("Finishes").fill("11:00");
    for (const g of ["U6", "U7", "U10", "U12", "U15"]) await page.getByLabel(g, { exact: true }).uncheck();
    await page.getByLabel("Girls", { exact: true }).check();
    await page.getByRole("button", { name: "Add sessions" }).click();
    await expect(page.getByText(/^Added 1 session\./)).toBeVisible();
  }

  // Nothing ticked: no bar. Tick both: the bar counts them.
  await page.goto("/admin/sessions?all=1");
  const bar = page.getByRole("group", { name: "With the ticked sessions" });
  await expect(bar).toHaveCount(0);
  // The phone cards' boxes (the lg table, display:none here, carries its own; the server reads them as one).
  const boxes = DAYS.map((d) => page.getByLabel(`Select ${TITLE}, ${dayOf(d)}`).filter({ visible: true }));
  for (const box of boxes) {
    expect((await box.locator("xpath=ancestor::label").boundingBox())!.height).toBeGreaterThanOrEqual(48);
    await box.check();
  }
  await expect(bar.getByText("2 selected")).toBeVisible();
  await expect(bar).toBeInViewport();
  await page.screenshot({ path: shot("bulk-sessions-phone") });

  // Bulk edit: the venue only. Times stay.
  await bar.getByRole("button", { name: "Edit" }).click();
  await expect(page.getByRole("heading", { name: "Edit 2 sessions" })).toBeVisible();
  await expect(page.getByText(`${dayOf(DAYS[0])} · ${TITLE} · 10:00am–11:00am · Girls`)).toBeVisible();
  await page.screenshot({ path: shot("bulk-edit-phone"), fullPage: true });
  await page.getByLabel("Venue").fill("Valentines Park");
  await page.getByRole("button", { name: "Save 2 sessions" }).click();
  await expect(page.getByText("Updated 2 sessions.")).toBeVisible();
  await page.goto("/admin/sessions?all=1");
  for (const d of DAYS) {
    const card = page.getByRole("listitem").filter({ hasText: `${dayOf(d)} · ${TITLE} 10:00am–11:00am` });
    await expect(card).toContainText("Girls · Valentines Park");
  }

  // Bulk cancel with one reason, telling the families (ticked already).
  for (const box of boxes) await box.check();
  await bar.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("heading", { name: "Cancel 2 sessions?" })).toBeVisible();
  await expect(page.getByLabel(/Tell the families now/)).toBeChecked();
  await page.getByLabel(/Reason/).fill("Half term");
  await page.getByRole("button", { name: "Cancel 2 sessions" }).click();
  await expect(page.getByText("Cancelled 2 sessions. The families have been told.")).toBeVisible();
  await page.goto("/admin/sessions?all=1");
  await expect(page.getByText("Reason: Half term").filter({ visible: true })).toHaveCount(2);

  // Her Friday shows both as cancelled, with the reason, and still asks about the Girls training after them.
  const parent = await newContext(browser, { ...PHONE, storageState: GIRLS_PARENT_STATE });
  const friday = await parent.newPage();
  await friday.goto("/friday");
  for (const d of DAYS) await expect(friday.getByText(`Cancelled: ${TITLE}, ${dayOf(d)} · Girls`)).toBeVisible();
  await expect(friday.getByText("Half term")).toHaveCount(2);
  await expect(friday.getByRole("group", { name: /Is Amina coming/ })).toBeVisible();
  await friday.goto("/news");
  await expect(friday.getByRole("heading", { name: `${TITLE} on ${dayOf(DAYS[0])} is cancelled` })).toBeVisible();
  await parent.close();

  // Cancelling again skips them; restore puts both back.
  await page.goto("/admin/sessions?all=1");
  for (const box of boxes) await box.check();
  await bar.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByText("Every session you ticked is already cancelled.")).toBeVisible();
  await page.getByRole("link", { name: "Back to Sessions" }).click();
  for (const box of boxes) await box.check();
  await bar.getByRole("button", { name: "Restore" }).click();
  await expect(page.getByRole("heading", { name: "Put 2 sessions back on?" })).toBeVisible();
  await page.getByLabel(/Tell the families now/).uncheck();
  await page.getByRole("button", { name: "Put 2 sessions back on" }).click();
  await expect(page.getByText("Put 2 sessions back on.", { exact: true })).toBeVisible();
  await page.goto("/admin/sessions?all=1");
  await expect(page.getByText("Reason: Half term").filter({ visible: true })).toHaveCount(0);
  await admin.close();
});

test("at a desk, Select all ticks the table; a bulk delete keeps the session with a check-in", async ({ browser }) => {
  test.skip(!existsSync(ADMIN_STATE), "run with the earlier tests: needs their saved sign-in");
  const admin = await newContext(browser, { viewport: { width: 1440, height: 900 }, colorScheme: "dark", baseURL: "http://localhost:3100", storageState: ADMIN_STATE });
  const page = await admin.newPage();
  await page.goto("/admin/sessions?all=1");
  const table = page.getByRole("table", { name: "Sessions coming up" });
  const rows = await table.getByRole("checkbox", { name: /^Select .+, / }).count();
  expect(rows).toBeGreaterThanOrEqual(3);
  await table.getByRole("checkbox", { name: "Select all" }).check();
  const bar = page.getByRole("group", { name: "With the ticked sessions" });
  await expect(bar.getByText(`${rows} selected`)).toBeVisible();
  await page.screenshot({ path: shot("bulk-sessions-desk-dark"), fullPage: true });
  await table.getByRole("checkbox", { name: "Select all" }).uncheck();
  await expect(bar).toHaveCount(0);

  // Gate test (today) has Musa checked in: it's kept and named; the two Girls cups go.
  await table.getByRole("checkbox", { name: `Select Gate test, ${today}` }).check();
  for (const d of DAYS) await table.getByRole("checkbox", { name: `Select ${TITLE}, ${dayOf(d)}` }).check();
  await expect(bar.getByText("3 selected")).toBeVisible();
  await bar.getByRole("button", { name: "Delete" }).click();
  await expect(page.getByRole("heading", { name: "Delete 2 sessions?" })).toBeVisible();
  await expect(page.getByText("1 has check-ins, so it can't be deleted (cancel instead).")).toBeVisible();
  await expect(page.getByText("Has check-ins: kept")).toBeVisible();
  await page.screenshot({ path: shot("bulk-delete-desk-dark"), fullPage: true });
  await page.getByRole("link", { name: "Keep them" }).click();
  await expect(page.getByRole("heading", { name: "Sessions" })).toBeVisible();
  await expect(table.getByRole("checkbox", { name: `Select ${TITLE}, ${dayOf(DAYS[0])}` })).toBeVisible();

  await table.getByRole("checkbox", { name: `Select Gate test, ${today}` }).check();
  for (const d of DAYS) await table.getByRole("checkbox", { name: `Select ${TITLE}, ${dayOf(d)}` }).check();
  await bar.getByRole("button", { name: "Delete" }).click();
  await page.getByRole("button", { name: "Delete 2 sessions" }).click();
  await expect(page.getByText(`Deleted 2 sessions. 1 kept (${today}): children have been checked in.`)).toBeVisible();
  await expect(page.getByText(TITLE).filter({ visible: true })).toHaveCount(0);
  await expect(table.getByRole("checkbox", { name: `Select Gate test, ${today}` })).toBeVisible();

  // The bulk edit page at a desk, for the record.
  await table.getByRole("checkbox", { name: "Select all" }).check();
  await bar.getByRole("button", { name: "Edit" }).click();
  await expect(page.getByRole("heading", { name: /^Edit \d+ sessions$/ })).toBeVisible();
  await page.screenshot({ path: shot("bulk-edit-desk-dark"), fullPage: true });
  await admin.close();
});
