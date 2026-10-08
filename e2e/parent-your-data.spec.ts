import { existsSync, readFileSync } from "node:fs";
import { devices, expect, test, type Page } from "@playwright/test";
import { ADMIN_STATE, OUTBOX, YOUR_DATA_PARENT_STATE, latestCode, newContext, shot } from "./helpers";

// A parent's own data (Player → Your data: download, ask to be deleted) and the accessibility repairs a parent meets:
// the QR codes by keyboard, and Friday at 200% zoom. A new family signs itself up with two children (its own address,
// so no other spec's codes are used up). Runs after parent-app.spec.ts (files run in name order), against the same
// server, and uses its saved admin sign-in for the overview.

test.describe.configure({ mode: "serial" });

const PHONE = { ...devices["Pixel 7"], viewport: { width: 390, height: 844 }, baseURL: "http://localhost:3100" };
const EMAIL = "maryam.haddad@example.com";

/** True when the page scrolls sideways (wider than the screen). */
const scrollsSideways = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);

test("a family with two children signs up", async ({ browser }) => {
  const context = await newContext(browser, { ...PHONE, extraHTTPHeaders: { "x-forwarded-for": "10.0.6.1" } });
  const page = await context.newPage();
  await page.goto("/sign-up");
  await page.getByLabel("First name").first().fill("Maryam");
  await page.getByLabel("Last name").first().fill("Haddad");
  await page.getByLabel("Email address").fill(EMAIL);
  await page.getByLabel("Mobile number").fill("07700 900777");
  await page.locator("#childFirstName-0").fill("Layla");
  await page.locator("#childDob-0").fill("2016-04-01");
  await page.locator("#childGroup-0").selectOption("U10");
  await page.getByRole("button", { name: "Add another child" }).click();
  await page.locator("#childFirstName-1").fill("Zaid");
  await page.locator("#childDob-1").fill("2019-02-01");
  await page.locator("#childGroup-1").selectOption("U7");
  await page.getByRole("button", { name: "Sign up" }).click();
  await expect(page).toHaveURL(/\/sign-in\/code$/);
  await page.getByLabel("6-digit code").fill(latestCode(EMAIL));
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/checklist$/);
  await context.storageState({ path: YOUR_DATA_PARENT_STATE });
  await context.close();
});

test("QR codes: every child can be reached by keyboard, and the screen says whose code is showing", async ({ browser }) => {
  test.skip(!existsSync(YOUR_DATA_PARENT_STATE), "needs the sign-up test above");
  const context = await newContext(browser, { ...PHONE, storageState: YOUR_DATA_PARENT_STATE });
  const page = await context.newPage();
  await page.goto("/pass");
  const choose = page.getByRole("group", { name: "Choose a child" });
  await expect(choose.getByRole("button", { name: "Layla" })).toHaveAttribute("aria-pressed", "true");
  await expect(choose.getByRole("button", { name: "Zaid" })).toHaveAttribute("aria-pressed", "false");
  const announced = page.getByText("Layla's QR code, 1 of 2", { exact: true });
  await expect(announced).toHaveAttribute("aria-live", "polite");

  const next = page.getByRole("button", { name: "Next child" });
  const previous = page.getByRole("button", { name: "Previous child" });
  for (const b of [next, previous, choose.getByRole("button", { name: "Zaid" })]) expect((await b.boundingBox())!.height).toBeGreaterThanOrEqual(48);

  // Keyboard only: Tab to Next child and press Enter.
  await next.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText("Zaid's QR code, 2 of 2", { exact: true })).toBeAttached();
  await expect(choose.getByRole("button", { name: "Zaid" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("img", { name: "QR code that checks Zaid in" })).toBeInViewport({ ratio: 0.9 });
  await page.screenshot({ path: shot("pass-keyboard") });

  // The codes themselves can take focus (a scrolling area a keyboard can't reach is an axe failure) and move with the arrows.
  const codes = page.getByRole("region", { name: /Attendance QR codes/ });
  await expect(codes).toHaveAttribute("tabindex", "0");
  await codes.focus();
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByText("Layla's QR code, 1 of 2", { exact: true })).toBeAttached();
  await expect(page.getByRole("img", { name: "QR code that checks Layla in" })).toBeInViewport({ ratio: 0.9 });
  // A switch user's Previous child from the first goes round to the last.
  await previous.click();
  await expect(page.getByText("Zaid's QR code, 2 of 2", { exact: true })).toBeAttached();
  await context.close();
});

test("Friday at 200% zoom (195px wide) doesn't scroll sideways, and the tab bar keeps its names", async ({ browser }) => {
  test.skip(!existsSync(YOUR_DATA_PARENT_STATE), "needs the sign-up test above");
  const context = await newContext(browser, { ...PHONE, viewport: { width: 195, height: 422 }, storageState: YOUR_DATA_PARENT_STATE });
  const page = await context.newPage();
  for (const path of ["/friday", "/pass", "/player"]) {
    await page.goto(path);
    await expect(page.locator("h1")).toBeVisible();
    expect(await scrollsSideways(page), `${path} scrolls sideways at 195px`).toBe(false);
  }
  await page.goto("/friday");
  // The QR card's heading wraps between words, never inside one ("Atten-dance").
  const heading = page.locator("main").getByText(/^(Show )?attendance QR codes?$/i).first();
  await expect(heading).toBeVisible();
  const brokenWords = await heading.evaluate((el) => {
    const text = el.firstChild!;
    const broken: string[] = [];
    for (const m of (text.textContent ?? "").matchAll(/\S+/g)) {
      const range = document.createRange();
      range.setStart(text, m.index);
      range.setEnd(text, m.index + m[0].length);
      if (new Set([...range.getClientRects()].map((r) => Math.round(r.top))).size > 1) broken.push(m[0]);
    }
    return broken;
  });
  expect(brokenWords).toEqual([]);
  await page.screenshot({ path: shot("friday-195px"), fullPage: true });
  const tabs = page.getByRole("navigation", { name: "Main" });
  for (const name of ["News", "Friday", "To-do", "Shop", "Players"]) await expect(tabs.getByRole("link", { name })).toBeVisible();
  // No label is cut off: at this width they're icons, each still named.
  const clipped = await tabs.locator("a span").evaluateAll((spans) =>
    spans.filter((s) => getComputedStyle(s).position !== "absolute" && s.scrollWidth > s.clientWidth + 1).map((s) => s.textContent),
  );
  expect(clipped).toEqual([]);
  await context.close();
});

test("your data: a parent downloads their family's data, which holds their children and no one else's", async ({ browser }) => {
  test.skip(!existsSync(YOUR_DATA_PARENT_STATE), "needs the sign-up test above");
  const context = await newContext(browser, { ...PHONE, storageState: YOUR_DATA_PARENT_STATE, acceptDownloads: true });
  const page = await context.newPage();
  await page.goto("/player");
  const section = page.getByRole("region", { name: "Your data" });
  await expect(section).toBeVisible();
  const [download] = await Promise.all([page.waitForEvent("download"), section.getByRole("link", { name: "Download my data" }).click()]);
  expect(download.suggestedFilename()).toMatch(/^deen-squad-my-data-\d{4}-\d{2}-\d{2}\.json$/);
  const text = readFileSync((await download.path())!, "utf8");
  const data = JSON.parse(text) as { you: { email: string }; children: { firstName: string; ageGroup: string }[] };
  expect(data.you.email).toBe(EMAIL);
  expect(data.children.map((c) => `${c.firstName} ${c.ageGroup}`)).toEqual(["Layla U10", "Zaid U7"]);
  // Not another family's children or parents (the sample club's, and the sign-up test's in parent-app.spec.ts).
  for (const other of ["Yusuf", "Musa", "Ahmed", "Ilyas", "adnan@example.com", "sara@example.com", "Aunt Hafsa"]) expect(text).not.toContain(other);
  const res = await page.request.get("/api/me/export");
  expect(res.headers()["content-disposition"]).toMatch(/^attachment; filename="deen-squad-my-data-/);
  expect(res.headers()["cache-control"]).toBe("no-store");

  // Too many in an hour: said on the screen, and no file of error text is saved.
  let downloads = 0;
  page.on("download", () => downloads++);
  await page.route("**/api/me/export", (route) => route.fulfill({ status: 429, body: "That's a lot of downloads in one hour. Try again later." }));
  await section.getByRole("link", { name: "Download my data" }).click();
  await expect(section.getByRole("status")).toHaveText("You've downloaded this a lot in the last hour. Try again later.");
  await page.screenshot({ path: shot("your-data-too-many") });
  expect(downloads).toBe(0);
  await page.unroute("**/api/me/export");
  // And the next one that's allowed clears the message.
  const [again] = await Promise.all([page.waitForEvent("download"), section.getByRole("link", { name: "Download my data" }).click()]);
  expect(again.suggestedFilename()).toMatch(/^deen-squad-my-data-\d{4}-\d{2}-\d{2}\.json$/);
  await expect(section.getByRole("status")).toHaveText("");
  await context.close();

  // Signed out, there's nothing to download.
  const anonymous = await newContext(browser, PHONE);
  expect((await anonymous.request.get("/api/me/export", { maxRedirects: 0 })).status()).not.toBe(200);
  await anonymous.close();
});

test("your data: a parent asks the club to delete their account; the club is emailed and an admin sees it and marks it done", async ({ browser }) => {
  test.skip(!existsSync(YOUR_DATA_PARENT_STATE), "needs the sign-up test above");
  const context = await newContext(browser, { ...PHONE, storageState: YOUR_DATA_PARENT_STATE });
  const page = await context.newPage();
  await page.goto("/player");
  await page.getByRole("link", { name: "Ask the club to delete my account" }).click();
  await expect(page).toHaveURL(/\/player\/delete-account$/);
  await expect(page.getByRole("heading", { name: "Delete my account" })).toBeVisible();
  await expect(page.getByText("Nothing is deleted straight away.", { exact: false })).toBeVisible();
  await page.screenshot({ path: shot("delete-account-confirm"), fullPage: true });
  await page.getByRole("button", { name: "Send the request to the club" }).click();
  await expect(page.getByRole("heading", { name: "Request sent" })).toBeVisible();
  await expect(page.getByText(/You asked the club to delete your account on \d+ \w+\. An admin will be in touch/)).toBeVisible();

  const mails = readFileSync(OUTBOX, "utf8")
    .trim()
    .split("\n")
    .map((l) => JSON.parse(l) as { to: string; subject: string; text: string });
  const asked = mails.filter((m) => m.subject === "Account deletion request: Maryam Haddad");
  // No CLUB_EMAIL, ALERT_EMAIL or ADMIN_EMAILS on the test server, so the Staff screen's admin hears.
  expect(asked.map((m) => m.to)).toEqual(["admin@deensquad.test"]);
  expect(asked[0].text).not.toMatch(/Layla|Zaid|07700|@example\.com/);

  // Back on the player screen it says so, and there's nothing more to ask.
  await page.goto("/player");
  await expect(page.getByRole("region", { name: "Your data" }).getByText(/You asked the club to delete your account on/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Ask the club to delete my account" })).toHaveCount(0);
  await context.close();

  test.skip(!existsSync(ADMIN_STATE), "run with parent-app.spec.ts: needs its saved admin sign-in");
  const adminContext = await newContext(browser, { ...PHONE, storageState: ADMIN_STATE });
  const admin = await adminContext.newPage();
  await admin.goto("/admin");
  const requests = admin.getByRole("region", { name: "1 family asked to be deleted" });
  await expect(requests).toBeVisible();
  await expect(requests.getByText("Maryam Haddad")).toBeVisible();
  await expect(requests.getByRole("link", { name: "Layla Haddad" })).toHaveAttribute("href", /^\/admin\/families\/[0-9a-f-]{36}$/);
  await admin.screenshot({ path: shot("admin-deletion-request") });
  await requests.getByRole("button", { name: "Done: Maryam Haddad's request" }).click();
  await expect(admin.getByRole("region", { name: /asked to be deleted/ })).toHaveCount(0);
  await adminContext.close();
});

test("privacy notice lists WhatsApp, the nightly backups and the rights parents can use in the app", async ({ page }) => {
  await page.goto("/privacy");
  await expect(page.getByText(/WhatsApp.*\(owned by Meta\)/)).toBeVisible();
  await expect(page.getByText(/Every night we make a backup copy of the database/)).toContainText("kept for 30 days");
  await expect(page.getByText(/Every night we make a backup copy of the database/)).toContainText("Amsterdam");
  await expect(page.getByText(/under Your data, download a copy/)).toBeVisible();
  await expect(page.getByText(/scrambled copy of your private calendar link/)).toBeVisible();
  // SMS isn't set up on the test server, so Twilio isn't listed.
  await expect(page.getByText("Twilio")).toHaveCount(0);
});

test("calendar: a parent gets a private link, the feed has their children's sessions, and a reset stops the old link", async ({ browser, playwright }) => {
  test.skip(!existsSync(YOUR_DATA_PARENT_STATE), "needs the sign-up test above");
  const context = await newContext(browser, { ...PHONE, storageState: YOUR_DATA_PARENT_STATE });
  const page = await context.newPage();
  await page.goto("/friday");
  await page.getByRole("link", { name: "Add sessions to your calendar" }).click();
  await expect(page).toHaveURL(/\/player\/calendar$/);
  await page.getByRole("button", { name: "Get my calendar link" }).click();

  const subscribe = page.getByRole("link", { name: "Subscribe (iPhone, iPad, Mac)" });
  await expect(subscribe).toHaveAttribute("href", /^webcal:\/\/localhost:3100\/api\/calendar\/[0-9a-f]{64}\.ics$/);
  const feed = await page.getByLabel("Link for other calendar apps").inputValue();
  expect(feed).toBe((await subscribe.getAttribute("href"))!.replace("webcal://", "http://"));
  await expect(page.getByRole("link", { name: "Google Calendar" })).toHaveAttribute("href", `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(feed.replace("http://", "webcal://"))}`);
  for (const target of [subscribe, page.getByRole("link", { name: "Google Calendar" }), page.getByRole("button", { name: "Copy link" }), page.getByRole("button", { name: "Reset link" })]) {
    expect((await target.boundingBox())!.height).toBeGreaterThanOrEqual(48);
  }
  await page.screenshot({ path: shot("parent-calendar-link") });

  // A calendar app fetches it with no sign-in.
  const api = await playwright.request.newContext();
  const res = await api.get(feed);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("text/calendar");
  const ics = (await res.text()).replace(/\r\n /g, "");
  expect(ics).toContain("BEGIN:VEVENT");
  expect(ics).toMatch(/SUMMARY:.*\(Layla/);
  expect(ics).not.toContain("Haddad");

  // Back later, the link isn't shown again; a reset makes a new one and the old one stops working.
  await page.reload();
  await expect(page.getByText("Your calendar link is set up. Reset it to see it again.")).toBeVisible();
  await page.getByRole("button", { name: "Reset link" }).click();
  const fresh = await page.getByLabel("Link for other calendar apps").inputValue();
  expect(fresh).not.toBe(feed);
  expect((await api.get(feed)).status()).toBe(404);
  expect((await api.get(fresh)).status()).toBe(200);
  await api.dispose();
  await context.close();
});
