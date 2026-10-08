import { existsSync, readFileSync } from "node:fs";
import { devices, expect, test } from "@playwright/test";
import { ADMIN_STATE, CHOSEN_PARENT_STATE, newContext, shot, signIn } from "./helpers";

// News to chosen children, and "Add to calendar" under a Coming answer. Runs after parent-app.spec.ts (files run in
// name order) and uses its saved admin sign-in. Isa (parent17) and Dawud (parent18) are both in the sample club's U7s:
// a message chosen for Isa reaches Isa's parent only.

test.describe.configure({ mode: "serial" });

const PHONE = { ...devices["Pixel 7"], viewport: { width: 390, height: 844 }, baseURL: "http://localhost:3100" };
const HEADLINE = "Isa picked for the tournament squad";

test("the admin posts to one chosen child: that child's parent sees it, another parent in the same group doesn't", async ({ browser }) => {
  test.skip(!existsSync(ADMIN_STATE), "run with parent-app.spec.ts: needs its saved admin sign-in");
  const admin = await newContext(browser, { ...PHONE, storageState: ADMIN_STATE });
  const page = await admin.newPage();
  await page.goto("/admin/news");
  await page.getByLabel("Headline").fill(HEADLINE);
  await page.getByLabel("Message").fill("Well done Isa. Details to follow.");
  await page.getByLabel("Chosen children").check();
  // Nobody chosen yet: the line says so, and posting is refused with the text kept.
  await expect(page.getByText("Choose at least one child.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Post to parents" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Choose at least one child." })).toBeVisible();
  await expect(page.getByLabel("Headline")).toHaveValue(HEADLINE);

  // Find Isa by name; the other children are hidden, not removed.
  await page.getByLabel("Find a child").fill("isa");
  const isa = page.getByRole("checkbox", { name: "Choose Isa G. (U7)" });
  await expect(isa).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "Choose Dawud L. (U7)" })).toBeHidden();
  expect((await page.locator("label", { has: isa }).boundingBox())!.height).toBeGreaterThanOrEqual(48);
  await isa.check();
  await expect(page.getByText("1 chosen")).toBeVisible();
  await expect(page.getByText("This goes to 1 parent of Isa G.")).toBeVisible();
  await page.screenshot({ path: shot("admin-news-chosen"), fullPage: true });
  await page.getByRole("button", { name: "Post to parents" }).click();
  await expect(page).toHaveURL(/\/admin\/news\/[0-9a-f-]{36}\?posted=1$/);
  await expect(page.getByText("Posted. Sent to 1 parent: they see it at the top of Club news.")).toBeVisible();
  await expect(page.getByText(/1 child: Isa G\./)).toBeVisible();
  await expect(page.getByText("0 of 1 read")).toBeVisible();
  await page.goto("/admin/news");
  await expect(page.getByRole("link", { name: new RegExp(HEADLINE) })).toContainText("1 child: Isa G.");
  await admin.close();

  // Dawud's parent (U7 too) doesn't see it.
  const other = await newContext(browser, PHONE);
  const dawud = await other.newPage();
  await signIn(dawud, "parent18@example.com");
  await dawud.goto("/news");
  await expect(dawud.getByText(/Winter timings/).first()).toBeVisible();
  await expect(dawud.getByText(HEADLINE)).toHaveCount(0);
  await other.close();

  // Isa's parent does.
  const context = await newContext(browser, PHONE);
  const parent = await context.newPage();
  await signIn(parent, "parent17@example.com");
  await parent.goto("/news");
  await expect(parent.getByText(HEADLINE).first()).toBeVisible();
  await parent.getByRole("button", { name: `I've read this: ${HEADLINE}` }).click();
  await expect(parent.getByRole("button", { name: `I've read this: ${HEADLINE}` })).toHaveCount(0);
  await context.storageState({ path: CHOSEN_PARENT_STATE });
  await context.close();
});

test("after Coming, a parent can add that session to their calendar: Google or an .ics file", async ({ browser }) => {
  test.skip(!existsSync(CHOSEN_PARENT_STATE), "needs the sign-in from the test above");
  const context = await newContext(browser, { ...PHONE, storageState: CHOSEN_PARENT_STATE, acceptDownloads: true });
  const page = await context.newPage();
  await page.goto("/friday");
  const away = page.getByRole("button", { name: "Not this week: Isa isn't coming" });
  await away.click();
  await expect(away).toHaveAttribute("aria-pressed", "true");
  // Not this week: nothing to add.
  await expect(page.getByText("Add to calendar")).toHaveCount(0);
  const coming = page.getByRole("button", { name: "Isa is coming" });
  await coming.click();
  await expect(coming).toHaveAttribute("aria-pressed", "true");
  const add = page.locator("summary", { hasText: "Add to calendar" });
  await expect(add).toBeVisible();
  expect((await add.boundingBox())!.height).toBeGreaterThanOrEqual(48);
  await expect(page.getByRole("link", { name: "Add every session automatically" })).toHaveAttribute("href", "/player/calendar");
  await add.click();
  const google = page.getByRole("link", { name: "Google Calendar" });
  await expect(google).toHaveAttribute("href", /^https:\/\/calendar\.google\.com\/calendar\/render\?action=TEMPLATE&text=[^&]*\(Isa\)&dates=\d{8}T\d{6}Z%2F\d{8}T\d{6}Z/);
  await expect(google).toHaveAttribute("target", "_blank");
  expect((await google.boundingBox())!.height).toBeGreaterThanOrEqual(48);
  await page.screenshot({ path: shot("friday-add-to-calendar"), fullPage: true });

  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "Apple or other calendar (.ics)" }).click()]);
  expect(download.suggestedFilename()).toMatch(/^deen-squad-\d{4}-\d{2}-\d{2}\.ics$/);
  const ics = readFileSync((await download.path())!, "utf8");
  expect(ics).toContain("BEGIN:VEVENT");
  expect(ics).toMatch(/SUMMARY:.+ \(Isa\)/);
  expect(ics).toMatch(/UID:[0-9a-f-]{36}@thedeensquadfootballacademy\.co\.uk/);

  // A session that doesn't exist (or isn't this family's) is a plain 404.
  const missing = await page.request.get("/api/sessions/00000000-0000-4000-8000-000000000000/ics");
  expect(missing.status()).toBe(404);
  await context.close();
});
