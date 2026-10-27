import { existsSync, writeFileSync } from "node:fs";
import { devices, expect, test } from "@playwright/test";
import { ADMIN_STATE, COACH_STATE, newContext, shot, signIn } from "./helpers";

// The four gaps from the FootballPro comparison (Oct 2026): staff checks, TeamFeePay import, away trips with
// consent, and wellbeing check-ins. Runs after parent-app.spec.ts (its saved admin and coach sign-ins). Parent 14
// (Ibrahim M., U10) is used by no other spec.

test.describe.configure({ mode: "serial" });

const PHONE = { ...devices["Pixel 7"], viewport: { width: 390, height: 844 }, baseURL: "http://localhost:3100" };
const PARENT = "parent14@example.com";

test("an admin records a coach's DBS; the coach drops off 'Checks to sort'", async ({ browser }) => {
  test.skip(!existsSync(ADMIN_STATE), "run with parent-app.spec.ts: needs its saved admin sign-in");
  const admin = await newContext(browser, { ...PHONE, storageState: ADMIN_STATE });
  const page = await admin.newPage();
  await page.goto("/admin/staff");
  const card = page.getByRole("region", { name: /^Checks to sort/ }).or(page.locator("section").filter({ hasText: /^Checks to sort/ })).first();
  await expect(card).toBeVisible();
  await card.getByRole("link", { name: /Coach Hamza/ }).click();
  await expect(page.getByRole("heading", { name: "Coach Hamza", level: 1 })).toBeVisible();
  await expect(page.getByText("No DBS check")).toBeVisible();
  await page.getByLabel("What it is").selectOption("dbs");
  await page.getByLabel(/^Runs out/).fill("2029-03-01");
  await page.getByLabel(/^Certificate number/).fill("001234567890");
  await page.getByRole("button", { name: "Add" }).click();
  await expect(page.getByText("Checks up to date")).toBeVisible();
  await expect(page.getByText(/Runs out 1 Mar 2029/)).toBeVisible();
  await page.screenshot({ path: shot("admin-staff-checks"), fullPage: true });
  await page.goto("/admin/staff");
  await expect(page.getByRole("link", { name: "DBS and certificates for Coach Hamza: Checks up to date" })).toBeVisible();
  await admin.close();
});

test("an admin updates plans from a TeamFeePay export: preview, then apply", async ({ browser }, info) => {
  test.skip(!existsSync(ADMIN_STATE), "run with parent-app.spec.ts: needs its saved admin sign-in");
  const admin = await newContext(browser, { ...PHONE, storageState: ADMIN_STATE });
  const page = await admin.newPage();
  const file = info.outputPath("teamfeepay.csv");
  writeFileSync(file, `Member Name,Payer Email,Subscription Status\nIbrahim M,${PARENT},Active\nNobody Here,nobody@example.com,Active\n`);
  await page.goto("/admin/families");
  await page.getByRole("link", { name: "Update plans from TeamFeePay" }).click();
  await page.getByLabel("TeamFeePay export (CSV)").setInputFiles(file);
  await page.getByRole("button", { name: "Check the file" }).click();
  await expect(page.getByRole("heading", { name: "1 plan will change" })).toBeVisible();
  await expect(page.getByRole("row", { name: /Ibrahim M.*Monthly plan/ })).toBeVisible();
  await expect(page.getByText(/Row 3, Nobody Here: No child with this name in the app/)).toBeVisible();
  await page.screenshot({ path: shot("admin-teamfeepay-preview"), fullPage: true });
  await page.getByRole("button", { name: "Update 1 plan" }).click();
  await expect(page.getByText(/^Done\. 1 plan updated/)).toBeVisible();
  await admin.close();
});

test("an away trip: staff add it, the parent says yes with a number, staff see the child cleared", async ({ browser }) => {
  test.skip(!existsSync(ADMIN_STATE), "run with parent-app.spec.ts: needs its saved admin sign-in");
  const admin = await newContext(browser, { ...PHONE, storageState: ADMIN_STATE });
  const page = await admin.newPage();
  await page.goto("/admin/sessions?all=1");
  await page.getByRole("link", { name: /^Away trip for Autumn Cup / }).first().click();
  await expect(page.getByRole("heading", { name: "Autumn Cup: away trip" })).toBeVisible();
  const cupDay = (await page.getByText(/^\w{3} \d{1,2} \w{3} · /).first().textContent())!;
  const href = page.url();
  // Meet the morning of the cup at 8:30.
  const [, d, mon] = /^\w{3} (\d{1,2}) (\w{3})/.exec(cupDay)!;
  const monthIndex = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"].indexOf(mon);
  const year = new Date().getFullYear() + (monthIndex < new Date().getMonth() ? 1 : 0);
  const month = String(monthIndex + 1).padStart(2, "0");
  await page.getByLabel("Meet at").fill(`${year}-${month}-${d.padStart(2, "0")}T08:30`);
  await page.getByLabel("Where to meet").fill("Hub car park");
  await page.getByLabel(/^How they/).fill("Minibus");
  await page.getByLabel(/^Cost in £/).fill("5");
  await page.getByRole("button", { name: "Save and ask the parents" }).click();
  await expect(page.getByText("Saved. Parents can now say yes or no in the app.")).toBeVisible();

  const parent = await newContext(browser, PHONE);
  const p = await parent.newPage();
  await signIn(p, PARENT);
  await p.goto("/news");
  const tripCard = p.getByRole("link", { name: /Away trip: Autumn Cup.*Say if Ibrahim can go/ });
  await expect(tripCard).toBeVisible();
  await tripCard.click();
  await expect(p.getByText("Hub car park", { exact: false })).toBeVisible();
  await expect(p.getByText("£5")).toBeVisible();
  await p.getByLabel("Yes, I give permission for Ibrahim to go").check();
  await p.getByLabel("Your mobile on the day").fill("07700 900314");
  await p.getByLabel(/^Anything the coaches should know/).fill("Gets travel sick");
  await p.getByRole("button", { name: "Send answer" }).click();
  await expect(p.getByText("Sent to the coaches.")).toBeVisible();
  await p.screenshot({ path: shot("parent-trip-consent"), fullPage: true });
  await p.goto("/news");
  await expect(p.getByRole("link", { name: /Say if Ibrahim can go/ })).toHaveCount(0);

  await page.goto(href);
  const cleared = page.locator("section").filter({ has: page.getByRole("heading", { name: /^Cleared to travel \(1\)/ }) });
  await expect(cleared.getByText(/Ibrahim M/)).toBeVisible();
  await expect(cleared.getByText("On the day: 07700 900314")).toBeVisible();
  await expect(cleared.getByText("Note: Gets travel sick")).toBeVisible();
  await page.screenshot({ path: shot("admin-trip"), fullPage: true });
  await parent.close();
  await admin.close();
});

test("a wellbeing check-in: the parent sends 'Not great'; only admins see it and follow it up", async ({ browser }) => {
  test.skip(!existsSync(ADMIN_STATE) || !existsSync(COACH_STATE), "run with parent-app.spec.ts: needs its saved sign-ins");
  const parent = await newContext(browser, PHONE);
  const p = await parent.newPage();
  await signIn(p, PARENT);
  await p.goto("/player");
  await p.getByRole("link", { name: /How's Ibrahim finding football\?/ }).click();
  await p.getByText("Not great", { exact: true }).click();
  await p.getByLabel(/^Anything you'd like the club to know/).fill("Finding it hard to settle in");
  // Consent is needed every time.
  await p.getByRole("button", { name: "Send to the club" }).click();
  await expect(p.getByText(/^Thank you/)).toHaveCount(0);
  await p.getByLabel(/^I'm happy for the club's admins to see this/).check();
  await p.getByRole("button", { name: "Send to the club" }).click();
  await expect(p.getByText("Thank you. The club's admins will see this and may be in touch.")).toBeVisible();
  await p.screenshot({ path: shot("parent-wellbeing"), fullPage: true });
  await parent.close();

  const coach = await newContext(browser, { ...PHONE, storageState: COACH_STATE });
  const c = await coach.newPage();
  const res = await c.goto("/admin/wellbeing");
  expect(c.url()).not.toMatch(/\/admin\/wellbeing$/);
  expect(res?.status()).not.toBe(500);
  await coach.close();

  const admin = await newContext(browser, { ...PHONE, storageState: ADMIN_STATE });
  const page = await admin.newPage();
  await page.goto("/admin");
  await page.getByRole("link", { name: /wellbeing check-ins? to look at$/ }).click();
  await expect(page.getByText("Finding it hard to settle in")).toBeVisible();
  await page.screenshot({ path: shot("admin-wellbeing"), fullPage: true });
  await page.getByRole("button", { name: /^Mark Ibrahim M.*'s check-in as followed up$/ }).click();
  await expect(page.getByText("Nothing to follow up.")).toBeVisible();
  await admin.close();
});
