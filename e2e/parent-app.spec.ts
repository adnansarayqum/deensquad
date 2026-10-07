import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { devices, expect, test, type Page } from "@playwright/test";
import jsQR from "jsqr";
import { ADMIN_STATE, COACH_STATE, OUTBOX, latestCode, newContext, shot, signIn, skipInstallGate, switchUser } from "./helpers";

// Signs in with real emailed codes (read from the test outbox) and walks through the parent,
// coach and admin flows against the sample club. Screenshots land in e2e/.results/screens.
// The server starts with a fresh in-memory database, and the tests build on each other in order.

// Saved sign-ins from an earlier run must never stand in for this run's.
test.beforeAll(() => {
  rmSync(ADMIN_STATE, { force: true });
  rmSync(COACH_STATE, { force: true });
});

/**
 * A dropped signal for a page's Server Actions (they post to the page's own address); everything else loads.
 * Keep the matcher in a variable: page.unroute only removes the same function.
 */
const noSignal = (path: string) => (url: URL) => url.pathname === path;
const abortPosts = (route: import("@playwright/test").Route) => (route.request().method() === "POST" ? route.abort("internetdisconnected") : route.continue());

/** Today in London as the date field wants it (2026-10-09), and as the app labels it (Fri 9 Oct). */
const londonToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date());
const londonDay = () => new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", weekday: "short", day: "numeric", month: "short" }).format(new Date());

/**
 * Adds an all-day session today for some age groups (as staff) and returns its id. The register only opens on a
 * session's own day, so tests that mark children here make one whatever day the suite runs, then delete it.
 */
async function addSessionToday(page: Page, title: string, groups: string[]): Promise<string> {
  await page.goto("/admin/sessions");
  await page.getByLabel("Title").fill(title);
  await page.getByLabel("Date", { exact: true }).fill(londonToday());
  await page.getByLabel("Starts").fill("00:00");
  await page.getByLabel("Finishes").fill("23:59");
  for (const g of ["U6", "U7", "U10", "U12", "U15"]) if (!groups.includes(g)) await page.getByLabel(g, { exact: true }).uncheck();
  await page.getByRole("button", { name: "Add sessions" }).click();
  await expect(page.getByText(/^Added 1 session\./)).toBeVisible();
  return (await page.getByRole("link", { name: `Edit ${title} ${londonDay()}` }).getAttribute("href"))!.split("/")[3];
}

/** Deletes a session added by `addSessionToday` (undo its check-ins first: a session with attendance is kept). */
async function deleteSessionToday(page: Page, title: string) {
  await page.goto("/admin/sessions");
  await page.getByRole("link", { name: `Delete ${title} ${londonDay()}` }).click();
  await page.getByRole("button", { name: "Delete session" }).click();
  await expect(page.getByText("Deleted.")).toBeVisible();
}

let testNumber = 0;
test.beforeEach(async ({ context }) => {
  await context.clearCookies();
  await skipInstallGate(context);
  // Each test signs in from its own address, so the per-IP sign-in limit doesn't trip as the suite grows.
  await context.setExtraHTTPHeaders({ "x-forwarded-for": `10.0.0.${++testNumber}` });
});

test("signed-out visitors are sent to sign in, and a wrong code is refused", async ({ page }) => {
  await page.goto("/friday");
  await expect(page).toHaveURL(/\/sign-in\?next=%2Ffriday/);
  await page.screenshot({ path: shot("sign-in"), fullPage: true });

  await page.getByLabel("Email address").fill("adnan@example.com");
  await page.getByRole("button", { name: "Email me a code" }).click();
  await expect(page.getByText(/a•••@example.com/)).toBeVisible();
  const right = latestCode("adnan@example.com");
  await page.getByLabel("6-digit code").fill(right === "000000" ? "111111" : "000000");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText(/That code doesn't match/)).toBeVisible();
  await page.screenshot({ path: shot("sign-in-code"), fullPage: true });

  await page.getByLabel("6-digit code").fill(right);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/friday$/);
});

test("pages can't be shown in another site's frame and don't name the server software", async ({ page }) => {
  const res = await page.goto("/sign-in");
  const headers = res!.headers();
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["content-security-policy"]).toBe("frame-ancestors 'none'");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["x-powered-by"]).toBeUndefined();
});

test("an unknown email gets the same screen and no email", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByLabel("Email address").fill("stranger@example.org");
  await page.getByRole("button", { name: "Email me a code" }).click();
  await expect(page).toHaveURL(/\/sign-in\/code$/);
  await expect(page.getByText("We've sent a code to s•••@example.org if it's on the club's list.", { exact: false })).toBeVisible();
  expect(readFileSync(OUTBOX, "utf8")).not.toContain("stranger@example.org");
});

test("news: a parent of two acknowledges the kit message", async ({ page }) => {
  await signIn(page, "adnan@example.com");
  await expect(page.getByRole("heading", { name: "Club news" })).toBeVisible();
  await expect(page.getByText("Are Yusuf and Musa coming?")).toBeVisible();
  await expect(page.getByRole("main").getByText("1 unread")).toBeVisible();
  await page.screenshot({ path: shot("news"), fullPage: true });

  // No signal: the tap stays on screen, says it didn't save and offers to try again.
  const newsOffline = noSignal("/news");
  await page.route(newsOffline, abortPosts);
  // The button is named with the headline, so a screen reader can tell several apart.
  const read = page.getByRole("button", { name: /^I've read this: \S/ });
  const headline = (await read.getAttribute("aria-label"))!.replace("I've read this: ", "");
  await read.click();
  await expect(page.getByRole("alert").getByText("That didn't save. Check your signal and try again.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Club news" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Something went wrong" })).toHaveCount(0);
  await page.unroute(newsOffline);
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByText("You're all caught up")).toBeVisible();
  // Focus stays with the message (now under Earlier, marked Read), not back at the top of the page.
  await expect(page.locator(":focus")).toContainText(headline);
  await expect(page.locator(":focus")).toContainText("Read");
});

test("friday: each child gets their own answer and headcount", async ({ page, browser }) => {
  await signIn(page, "adnan@example.com");
  await page.goto("/friday");
  await expect(page.getByRole("heading", { name: "Who's coming?" })).toBeVisible();
  await expect(page.getByText("11 of 16 coming")).toBeVisible();
  const yusuf = page.getByRole("group", { name: /Is Yusuf coming/ });
  const musa = page.getByRole("group", { name: /Is Musa coming/ });
  await yusuf.getByRole("button", { name: "Coming" }).click();
  await expect(page.getByText("Saved. Coach can see Yusuf is coming.")).toBeVisible();
  await expect(page.getByText("12 of 16 coming")).toBeVisible();
  // The venue has directions (a Google Maps search, outside the app).
  const directions = page.getByRole("link", { name: "Directions to Bobby Moore Sports Hub" }).first();
  await expect(directions).toHaveAttribute("href", "https://www.google.com/maps/search/?api=1&query=Bobby%20Moore%20Sports%20Hub");
  await expect(directions).toHaveAttribute("target", "_blank");
  expect((await directions.boundingBox())!.height).toBeGreaterThanOrEqual(48);
  // No signal: Musa's answer doesn't save; the screen and its QR link stay, and Try again sends it once back online.
  const fridayOffline = noSignal("/friday");
  await page.route(fridayOffline, abortPosts);
  await musa.getByRole("button", { name: "Not this week" }).click();
  await expect(page.getByRole("alert").getByText("That didn't save. Check your signal and try again.")).toBeVisible();
  await expect(musa.getByRole("button", { name: "Not this week" })).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByText(/attendance QR codes/i).first()).toBeVisible();
  await page.unroute(fridayOffline);
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByText("Saved. Coach knows Musa is away this week.")).toBeVisible();
  await expect(page.getByText("That didn't save. Check your signal and try again.")).toHaveCount(0);
  await page.screenshot({ path: shot("friday"), fullPage: true });

  // A fresh load shows who answered, not "Saved".
  await page.reload();
  await expect(page.getByText(/^Coming · answered by you, today \d{1,2}:\d\d[ap]m$/)).toBeVisible();
  await expect(page.getByText(/^Saved\./)).toHaveCount(0);

  // Sara shares the children: she sees Adnan's answers by name, changes Yusuf's, and only she is told "Saved".
  const saraContext = await newContext(browser, {
    ...devices["Pixel 7"],
    viewport: { width: 390, height: 844 },
    baseURL: "http://localhost:3100",
    extraHTTPHeaders: { "x-forwarded-for": "10.0.2.1" },
  });
  const sara = await saraContext.newPage();
  await signIn(sara, "sara@example.com");
  await sara.goto("/friday");
  await expect(sara.getByText(/^Coming · answered by Adnan, today /)).toBeVisible();
  await expect(sara.getByText(/^Not this week · answered by Adnan, today /)).toBeVisible();
  await expect(sara.getByText(/^Saved\./)).toHaveCount(0);
  await sara.getByRole("group", { name: /Is Yusuf coming/ }).getByRole("button", { name: "Not this week" }).click();
  await expect(sara.getByText("Saved. Coach knows Yusuf is away this week.")).toBeVisible();
  await saraContext.close();

  await page.reload();
  await expect(page.getByText(/^Not this week · answered by Sara, today /).first()).toBeVisible();
  await expect(yusuf.getByRole("button", { name: "Not this week" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText(/^Saved\./)).toHaveCount(0);
  await page.screenshot({ path: shot("friday-answered-by"), fullPage: true });
  // Adnan puts it back.
  await yusuf.getByRole("button", { name: "Coming" }).click();
  await expect(page.getByText("Saved. Coach can see Yusuf is coming.")).toBeVisible();

  await page.getByRole("link", { name: "News" }).click();
  await expect(page.getByText(/Yusuf coming · Musa away/)).toBeVisible();
});

test("to-do: contacts copied to a sibling, consent and payments", async ({ page }) => {
  await signIn(page, "sara@example.com");
  await page.goto("/checklist");
  // Per child: registered, contacts, photos. For the family: one payment step, and the contract for each child.
  await expect(page.getByRole("progressbar", { name: "4 of 9 steps done" })).toBeVisible();
  const family = page.getByRole("region", { name: "Whole family" });
  await expect(family.getByText("£30 a month per child, paid by direct debit through TeamFeePay")).toBeVisible();
  await page.screenshot({ path: shot("checklist"), fullPage: true });

  const musa = page.getByRole("region", { name: "Musa's checklist" });
  await musa.getByRole("link", { name: /Emergency contacts/ }).click();
  await page.getByLabel("Name").fill("Grandad Yusuf");
  await page.getByLabel("Phone number").fill("07700900321");
  await page.getByRole("button", { name: "Save contact" }).click();
  await expect(page.getByText("07700 900321")).toBeVisible();
  await page.screenshot({ path: shot("contacts"), fullPage: true });

  await page.goto("/checklist");
  await musa.getByRole("link", { name: /Photo consent/ }).click();
  await page.getByText("No photos, please").click();
  await page.getByRole("button", { name: "Save answer" }).click();
  await expect(page).toHaveURL(/\/checklist$/);

  // Yusuf's plan is already active, so the family's one payment step covers Musa.
  await family.getByRole("link", { name: /Set up payments/ }).click();
  await expect(page.getByText("£30 a month per child, paid by direct debit through TeamFeePay")).toBeVisible();
  await expect(page.getByText("Monthly plan active for Yusuf.")).toBeVisible();
  await page.getByRole("button", { name: "I've set it up for Musa" }).click();
  await expect(page).toHaveURL(/\/checklist$/);
  await expect(page.getByRole("progressbar", { name: "7 of 9 steps done" })).toBeVisible();

  // One contract row, a link for each child still to sign.
  for (const name of ["Musa", "Yusuf"]) {
    await family.getByRole("link", { name: `Read with ${name}` }).click();
    await page.getByText(/gone through the player responsibilities with/).click();
    await page.getByText("I agree to the parent or guardian responsibilities.").click();
    await page.getByRole("button", { name: "Sign the contract" }).click();
    await expect(page).toHaveURL(/\/checklist$/);
  }
  await expect(page.getByText("All done. Everyone is fully set up.")).toBeVisible();
});

test("player: switch between children and sign out", async ({ page }) => {
  await signIn(page, "adnan@example.com");
  await page.getByRole("link", { name: "Players" }).click();
  await expect(page.getByRole("heading", { name: "Yusuf S." })).toBeVisible();
  await expect(page.getByText("4-week streak")).toBeVisible();
  await page.screenshot({ path: shot("player"), fullPage: true });
  await page.getByRole("link", { name: "Musa" }).click();
  await expect(page.getByRole("heading", { name: "Musa S." })).toBeVisible();
  // The privacy notice has a way back into the app.
  await page.getByRole("link", { name: "Privacy", exact: true }).click();
  await expect(page).toHaveURL(/\/privacy$/);
  const back = page.getByRole("link", { name: "Back", exact: true });
  expect((await back.boundingBox())!.height).toBeGreaterThanOrEqual(48);
  await back.click();
  await expect(page).toHaveURL(/\/player/);
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
  await page.goto("/news");
  await expect(page).toHaveURL(/\/sign-in/);
});

test("coach: register marks a player here; parents can't open it", async ({ page }) => {
  await signIn(page, "coach@deensquad.test");

  // A session that isn't today (the Autumn Cup is always a fortnight or more away): the register shows it, but
  // Mark here and scanning stay off until its day.
  await page.goto("/admin/sessions");
  const cup = (await page.getByRole("link", { name: /^Edit Autumn Cup / }).getAttribute("href"))!.split("/")[3];
  await page.goto(`/coach?session=${cup}&group=U10`);
  await expect(page.getByText(/^Opens on \w{3} \d{1,2} \w{3}\. You can mark children here on the day\.$/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Scan QR codes" })).toBeDisabled();
  const marks = page.getByRole("button", { name: /^Mark .+ here$/ });
  await expect(marks.first()).toBeVisible();
  for (const mark of await marks.all()) await expect(mark).toBeDisabled();
  await page.screenshot({ path: shot("coach-not-today"), fullPage: true });

  // A U10 session today, so marking works whatever day the suite runs. Deleted at the end.
  const session = await addSessionToday(page, "Register test", ["U10"]);
  await page.goto(`/coach?session=${session}&group=U10`);
  await expect(page.getByRole("heading", { name: "Register test register" })).toBeVisible();
  await expect(page.getByText(/You can mark children here on the day/)).toHaveCount(0);
  await expect(page.getByText("0 of 16 expected")).toBeVisible();
  await page.getByRole("button", { name: "Mark Yusuf S. here" }).click();
  await expect(page.getByText("Yusuf S. checked in")).toBeVisible();
  await expect(page.getByText("1 of 16 expected")).toBeVisible();
  await page.getByRole("button", { name: "Mark Adam F. here" }).click();
  const here = page.getByRole("region", { name: /^Here/ });
  await expect(here.getByRole("heading", { name: "Here (2)" })).toBeVisible();
  await expect(here.getByText("Adam F.")).toBeVisible();
  await expect(page.getByText("2 of 16 expected")).toBeVisible();
  await page.screenshot({ path: shot("coach"), fullPage: true });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.screenshot({ path: shot("coach-dark"), fullPage: true });
  await page.emulateMedia({ colorScheme: "light" });
  // Every control on the register is at least 48px tall.
  for (const button of await page.getByRole("main").getByRole("button").all()) {
    expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(48);
  }
  // The Undo for a mis-tap is right at the top, beside the "checked in" banner, without scrolling.
  await page.evaluate(() => window.scrollTo(0, 0));
  const undoAdam = page.getByRole("region", { name: "Just checked in" }).getByRole("button", { name: "Undo check-in for Adam F." });
  await expect(undoAdam).toBeInViewport({ ratio: 1 });
  const box = (await undoAdam.boundingBox())!;
  expect(box.height).toBeGreaterThanOrEqual(48);
  expect(box.width).toBeGreaterThanOrEqual(48);
  await undoAdam.click();
  await expect(here.getByRole("heading", { name: "Here (1)" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Mark Adam F. here" })).toBeEnabled();
  await expect(page.getByText("1 of 16 expected")).toBeVisible();

  // Moved to tomorrow, the register is closed for Undo too: Yusuf's check-in stays as it is until the day.
  const setDate = async (date: string) => {
    await page.goto(`/admin/sessions/${session}/edit`);
    await page.getByLabel("Date", { exact: true }).fill(date);
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Saved.", { exact: true })).toBeVisible();
    await page.goto(`/coach?session=${session}&group=U10`);
  };
  await setDate(new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date(Date.now() + 86_400_000)));
  await expect(page.getByText(/^Opens on .+\. You can mark children here on the day\.$/)).toBeVisible();
  await expect(here.getByRole("button", { name: "Undo check-in for Yusuf S." })).toBeDisabled();
  await setDate(londonToday());
  await here.getByRole("button", { name: "Undo check-in for Yusuf S." }).click();
  await expect(here.getByRole("heading", { name: "Here (0)" })).toBeVisible();

  // Nothing is attached to it any more, so it can go (the later tests expect today's register to be their own).
  await deleteSessionToday(page, "Register test");

  // The shop is the club's to run: coaches don't see it and are sent back to the overview.
  await page.goto("/admin");
  await expect(page.getByRole("navigation", { name: "Club admin" }).getByRole("link", { name: "Shop" })).toHaveCount(0);
  await page.goto("/admin/shop");
  await expect(page).toHaveURL(/\/admin$/);
  await page.goto("/admin/shop/products");
  await expect(page).toHaveURL(/\/admin$/);
});

test("admin: import a family, post news, add a session", async ({ page }) => {
  await signIn(page, "admin@deensquad.test");
  await expect(page).toHaveURL(/\/admin$/);
  await page.screenshot({ path: shot("admin"), fullPage: true });

  await page.goto("/admin/families/import");
  await page.getByText("Or paste the rows").click();
  await page
    .locator("textarea[name=csv]")
    .fill("Child first name,Child last name,Age group,Parent first name,Parent email\nAli,Khan,U10,Sana,sana@example.com\nZara,Khan,U12,Sana,sana@example.com\nBad,Row,U19,Pat,pat@example.com");
  await page.getByRole("button", { name: "Check the file" }).click();
  await expect(page.getByText("Row 4:")).toBeVisible();
  await page.screenshot({ path: shot("admin-import"), fullPage: true });
  await page.getByRole("button", { name: "Import 2 rows" }).click();
  await expect(page.getByText(/2 children added/)).toBeVisible();

  await page.goto("/admin/families?group=U12");
  // The Families page holds a phone list and a computer table; only one of them is on screen.
  await expect(page.getByText("Zara Khan").filter({ visible: true })).toBeVisible();
  // Invites go only to the parents of the children in the filtered list, and only after a confirmation.
  await expect(page.getByText("1 parent in U12 hasn't had an invite yet.")).toBeVisible();
  const before = readFileSync(OUTBOX, "utf8").trim().split("\n").length;
  await page.getByRole("link", { name: "Email invites" }).click();
  await expect(page).toHaveURL(/\/admin\/families\/invite\?group=U12$/);
  await expect(page.getByRole("heading", { name: "Email 1 parent in U12?" })).toBeVisible();
  // Nothing has gone yet.
  expect(readFileSync(OUTBOX, "utf8").trim().split("\n")).toHaveLength(before);
  await page.screenshot({ path: shot("admin-invite-confirm"), fullPage: true });
  await page.getByRole("button", { name: "Send invites" }).click();
  await expect(page).toHaveURL(/\/admin\/families\?group=U12&invited=1$/);
  await expect(page.getByText("Invites sent to 1 parent.")).toBeVisible();
  const invites = readFileSync(OUTBOX, "utf8")
    .trim()
    .split("\n")
    .slice(before)
    .map((l) => JSON.parse(l) as { to: string; subject: string })
    .filter((m) => m.subject.includes("ready"));
  expect(invites.map((m) => m.to)).toEqual(["sana@example.com"]);
  // The rest of the club still hasn't been invited.
  await page.goto("/admin/families");
  await expect(page.getByText(/^\d+ parents in the club haven't had an invite yet\.$/)).toBeVisible();

  await page.goto("/admin/news");
  await page.getByLabel("Headline").fill("Pitch closed on Saturday");
  await page.getByLabel("Message").fill("The council is reseeding the pitch.");
  // No audience chosen: the error shows and the headline and message are kept.
  await page.getByLabel("Only these groups:").check();
  // Hold the action back briefly to see the button say it's working.
  await page.route("**/admin/news", async (route) => {
    if (route.request().method() === "POST") await new Promise((r) => setTimeout(r, 800));
    await route.continue();
  });
  await page.getByRole("button", { name: "Post to parents" }).click();
  await expect(page.getByRole("button", { name: "Posting…" })).toBeDisabled();
  await expect(page.getByText("Choose who it's for")).toBeVisible();
  await page.unroute("**/admin/news");
  await expect(page.getByLabel("Headline")).toHaveValue("Pitch closed on Saturday");
  await expect(page.getByLabel("Message")).toHaveValue("The council is reseeding the pitch.");
  await page.getByLabel("Every family").check();
  await page.getByRole("button", { name: "Post to parents" }).click();
  await expect(page.getByText("Posted.")).toBeVisible();
  await expect(page.getByText(/0 of \d+ read/)).toBeVisible();
  await page.screenshot({ path: shot("admin-news"), fullPage: true });

  await page.goto("/admin/sessions");
  await page.getByLabel("Title").fill("Cup training");
  // This Friday and next already have the 6:30pm training for every group, so a two-week run adds nothing.
  const firstDate = await page.getByLabel("Date", { exact: true }).inputValue();
  await page.getByLabel(/Repeat every week until/).fill(new Date(Date.parse(firstDate) + 7 * 86400000).toISOString().slice(0, 10));
  await page.getByRole("button", { name: "Add sessions" }).click();
  await expect(page.getByText(/^No sessions added\. Skipped 2 that already existed \(\d+ \w+, \d+ \w+\)\.$/)).toBeVisible();
  // A saved form clears, ready for the next one.
  await expect(page.getByLabel("Title")).toHaveValue("Training");
});

test("an invited parent signs in from the link and sees their children", async ({ page }) => {
  const mail = readFileSync(OUTBOX, "utf8")
    .trim()
    .split("\n")
    .map((l) => JSON.parse(l) as { to: string; subject: string; text: string })
    .filter((m) => m.to === "sana@example.com" && m.subject.includes("ready"))
    .at(-1);
  const link = mail?.text.match(/https?:\/\/\S+\/sign-in\/link\?token=\S+/)?.[0];
  expect(link).toBeTruthy();
  await page.goto(new URL(link!).pathname + new URL(link!).search);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("Pitch closed on Saturday")).toBeVisible();
  await page.goto("/friday");
  await expect(page.getByRole("group", { name: /Is Ali coming/ })).toBeVisible();
  await expect(page.getByRole("group", { name: /Is Zara coming/ })).toBeVisible();
});

test("the hourly chase job needs its secret, then emails reminders for unread news", async ({ request }) => {
  expect((await request.post("/api/cron/chase")).status()).toBe(401);
  expect((await request.post("/api/cron/chase", { headers: { Authorization: "Bearer wrong" } })).status()).toBe(401);
  const res = await request.post("/api/cron/chase", { headers: { Authorization: "Bearer e2e-cron-secret" } });
  expect(res.ok()).toBe(true);
  const body = (await res.json()) as { quiet: boolean; email: number };
  if (body.quiet) return; // run between 9pm and 8am: nothing is sent, by design
  expect(body.email).toBeGreaterThan(0);
  expect(readFileSync(OUTBOX, "utf8")).toContain("Please read: Winter timings start 7 Nov");
});

test("shop: a parent orders kit for a child and pays by transfer; the club is told and makes it ready", async ({ page }) => {
  await signIn(page, "adnan@example.com");
  await page.goto("/checklist");
  await page.getByRole("link", { name: /Club shop/ }).click();
  await expect(page).toHaveURL(/\/shop$/);
  await page.screenshot({ path: shot("shop"), fullPage: true });

  await page.getByRole("link", { name: /full zip hoodie/ }).click();
  await page.getByText("Yusuf", { exact: true }).click();
  await page.getByText("Youth M (69-75cm chest)", { exact: true }).click();
  await page.getByLabel(/Initials/).fill("ys");
  await page.screenshot({ path: shot("shop-item"), fullPage: true });
  await page.getByRole("button", { name: "Add to basket" }).click();
  await expect(page.getByText("Added to your basket.")).toBeVisible();

  await page.getByRole("link", { name: "View basket" }).click();
  await expect(page.getByText("For Yusuf · Size Youth M (69-75cm chest) · Initials YS")).toBeVisible();
  await page.screenshot({ path: shot("shop-basket"), fullPage: true });
  // No SumUp key in tests, so bank transfer is the only way to pay.
  await expect(page.getByLabel(/Bank transfer/)).toBeChecked();
  await page.getByRole("button", { name: "Place order" }).click();
  await expect(page.getByText(/Order placed. Send the bank transfer/)).toBeVisible();
  await expect(page.getByText("12345678")).toBeVisible();
  const reference = (await page.locator("dd").last().textContent())!.trim();
  expect(reference).toMatch(/^DS-[0-9A-F]{6}$/);
  await page.screenshot({ path: shot("shop-order"), fullPage: true });

  const mails = readFileSync(OUTBOX, "utf8").trim().split("\n").map((l) => JSON.parse(l) as { to: string; subject: string });
  expect(mails.some((m) => m.to === "admin@deensquad.test" && m.subject === `New kit order ${reference} from Adnan Sample`)).toBe(true);
  // The parent gets their own confirmation with the bank details and reference (sent just after the page).
  const parentMails = () =>
    readFileSync(OUTBOX, "utf8")
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l) as { to: string; subject: string; text: string })
      .filter((m) => m.to === "adnan@example.com");
  await expect.poll(() => parentMails().filter((m) => m.subject === `Your kit order ${reference}`).length).toBe(1);
  const placed = parentMails().find((m) => m.subject === `Your kit order ${reference}`)!;
  expect(placed.text).toContain(`Reference: ${reference}`);
  expect(placed.text).toContain("We'll email you when it's ready.");
  await expect(page.getByRole("list", { name: "Order progress" })).toContainText("Placed");
  await expect(page.getByRole("list", { name: "Order progress" })).toContainText("Not paid yet");

  await switchUser(page);
  await signIn(page, "admin@deensquad.test");
  await page.goto("/admin/shop");
  // The supplier's spreadsheet is on the shop page itself.
  await expect(page.getByRole("link", { name: "Download for the supplier (CSV)" })).toHaveAttribute("href", "/api/admin/export/orders");
  await page.getByRole("button", { name: "Transfer received" }).click();
  await expect(page.getByRole("cell", { name: "Deen Squad full zip hoodie" })).toBeVisible();
  // The supplier table names the initials to print, not just how many.
  await expect(page.getByRole("cell", { name: "YS", exact: true })).toBeVisible();
  await expect.poll(() => parentMails().filter((m) => m.subject === `Payment received for order ${reference}`).length).toBe(1);
  await page.getByRole("button", { name: "Ready for Friday" }).first().click();
  await expect(page.getByRole("button", { name: "Handed over" })).toBeVisible();
  await expect.poll(() => parentMails().filter((m) => m.subject === "Kit ready to collect on Friday").length).toBe(1);
  expect(parentMails().find((m) => m.subject === "Kit ready to collect on Friday")!.text).toContain(`Yusuf's kit from order ${reference} is ready`);
  await page.screenshot({ path: shot("admin-shop"), fullPage: true });

  // The coach is told at the gate once Yusuf is checked in (on a session today, so the register is open).
  const session = await addSessionToday(page, "Kit test", ["U10"]);
  await page.goto(`/coach?session=${session}&group=U10`);
  await page.getByRole("button", { name: "Mark Yusuf S. here" }).click();
  await expect(page.getByRole("region", { name: /^Here/ }).getByText("Kit ready", { exact: true })).toBeVisible();
  await expect(page.getByText(/^1 child needs a word \(.*1 kit ready\)$/)).toBeVisible();
  await page.getByRole("region", { name: /^Here/ }).getByRole("button", { name: "Undo check-in for Yusuf S." }).click();
  await expect(page.getByRole("button", { name: "Mark Yusuf S. here" })).toBeVisible();
  await deleteSessionToday(page, "Kit test");
});

test("sign-up: a new parent registers their child, proves their email and lands in the app", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByRole("link", { name: "Sign up" }).click();
  await expect(page).toHaveURL(/\/sign-up$/);
  await expect(page.getByRole("region", { name: "About the club" }).getByText(/Training is on Fridays at Bobby Moore Sports Hub/)).toBeVisible();
  await page.getByLabel("First name").first().fill("Hana");
  await page.getByLabel("Last name").first().fill("Rahman");
  await page.getByLabel("Email address").fill("hana@example.com");
  await page.getByLabel("Mobile number").fill("12345");
  await page.locator("#childFirstName-0").fill("Ilyas");
  await page.locator("#childDob-0").fill("2017-05-01");
  await page.locator("#childGroup-0").selectOption("U10");
  // A mistyped number: the error shows and everything typed is still there to fix.
  await page.getByRole("button", { name: "Sign up" }).click();
  await expect(page.getByText("Check your phone number")).toBeVisible();
  await expect(page.getByLabel("First name").first()).toHaveValue("Hana");
  await expect(page.getByLabel("Last name").first()).toHaveValue("Rahman");
  await expect(page.getByLabel("Email address")).toHaveValue("hana@example.com");
  await expect(page.getByLabel("Mobile number")).toHaveValue("12345");
  await expect(page.locator("#childFirstName-0")).toHaveValue("Ilyas");
  await expect(page.locator("#childDob-0")).toHaveValue("2017-05-01");
  await expect(page.locator("#childGroup-0")).toHaveValue("U10");
  await page.getByLabel("Mobile number").fill("07700 900555");
  await page.screenshot({ path: shot("sign-up"), fullPage: true });
  await page.getByRole("button", { name: "Sign up" }).click();
  await expect(page).toHaveURL(/\/sign-in\/code$/);
  await expect(page.getByText(/We've emailed a 6-digit code to h•••@example.com\. Enter it to finish joining\. Your family isn't added until you do\./)).toBeVisible();
  await page.getByLabel("6-digit code").fill(latestCode("hana@example.com"));
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/checklist$/);
  await expect(page.getByRole("heading", { name: "Ilyas's checklist" })).toBeVisible();
  const mails = readFileSync(OUTBOX, "utf8");
  expect(mails).toContain("New family signed up: Hana Rahman");

  await page.getByRole("link", { name: /Club contract/ }).click();
  await expect(page.getByRole("heading", { name: "Player responsibilities" })).toBeVisible();
  await page.getByText(/gone through the player responsibilities with/).click();
  await page.getByText("I agree to the parent or guardian responsibilities.").click();
  await expect(page.getByLabel(/Your full name/)).toHaveValue("Hana Rahman");
  await page.screenshot({ path: shot("contract"), fullPage: true });
  await page.getByRole("button", { name: "Sign the contract" }).click();
  await expect(page).toHaveURL(/\/checklist$/);
  await expect(page.getByText("Signed for this season")).toBeVisible();
});

test("coach groups: a U7 coach posts to U7 only and gives a star; the parent sees it", async ({ page }) => {
  await signIn(page, "admin@deensquad.test");
  await page.goto("/admin/staff");
  const coachGroups = page.getByRole("form", { name: "Coach Hamza's groups" });
  await coachGroups.getByLabel("U7").check();
  await coachGroups.getByRole("button", { name: "Save groups" }).click();
  await expect(coachGroups.getByLabel("U7")).toBeChecked();
  // A U10-only message and a U10-only session that the U7 coach shouldn't see.
  await page.goto("/admin/news");
  const kitHref = await page.getByRole("link", { name: /New away kit/ }).getAttribute("href");
  expect(kitHref).toMatch(/^\/admin\/news\/[0-9a-f-]{36}$/);
  await page.goto("/admin/sessions");
  await page.getByLabel("Title").fill("U10 friendly");
  // Months away, so it doesn't become the next session in later tests.
  await page.getByLabel("Date", { exact: true }).fill(new Date(Date.now() + 200 * 86400000).toISOString().slice(0, 10));
  for (const g of ["U6", "U7", "U12", "U15"]) await page.getByLabel(g, { exact: true }).uncheck();
  await page.getByRole("button", { name: "Add sessions" }).click();
  await expect(page.getByText(/^Added 1 session\./)).toBeVisible();
  await expect(page.getByText(/U10 friendly/).first()).toBeVisible();

  await switchUser(page);
  await signIn(page, "coach@deensquad.test");
  await page.context().storageState({ path: COACH_STATE });
  await page.goto("/admin/news");
  await expect(page.getByLabel("Every family")).toHaveCount(0);
  await expect(page.getByLabel("U10")).toHaveCount(0);
  await expect(page.getByRole("link", { name: /New away kit/ })).toHaveCount(0);
  expect((await page.goto(kitHref!))?.status()).toBe(404);
  // A message to every family: the unread list holds only parents with a child in U7.
  await page.goto("/admin/news");
  await page.getByRole("link", { name: /Winter timings/ }).click();
  await expect(page.getByText("Parent E", { exact: true })).toBeVisible();
  // The read count is for the coach's groups too, so it agrees with the list under it.
  await expect(page.getByText(/^Your groups: \d+ of \d+ read$/)).toBeVisible();
  await expect(page.getByText("Parent K", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Delete this message")).toHaveCount(0);

  await page.goto("/admin/families");
  await expect(page.getByText("Musa Sample").filter({ visible: true })).toBeVisible();
  await expect(page.getByText("Yusuf Sample")).toHaveCount(0);
  expect((await page.goto("/admin/families/20000000-0000-4000-8000-000000000001"))?.status()).toBe(404);

  await page.goto("/admin/sessions");
  await expect(page.getByText(/Autumn Cup/)).toHaveCount(0);
  await expect(page.getByText(/U10 friendly/)).toHaveCount(0);
  await expect(page.getByLabel("U10", { exact: true })).toHaveCount(0);
  // The club-wide training is listed, but only admins can cancel a joint session.
  const comingUp = page.getByRole("region", { name: "Coming up" });
  await expect(comingUp.getByText(/· Training /).first()).toBeVisible();
  await expect(comingUp.getByRole("link", { name: /^Cancel / })).toHaveCount(0);
  await expect(comingUp.getByRole("link", { name: /^Edit / })).toHaveCount(0);

  await page.goto("/coach/awards");
  await page.getByRole("link", { name: /Musa Sample/ }).click();
  // Nothing chosen: the error shows and the reason is kept.
  await page.getByLabel(/What for/).fill("Brilliant first touch");
  await page.getByRole("button", { name: "Give award" }).click();
  await expect(page.getByText("Choose points or a star.")).toBeVisible();
  await expect(page.getByLabel(/What for/)).toHaveValue("Brilliant first touch");
  await page.getByText("+5", { exact: true }).click();
  await page.getByText("Star player").click();
  await page.getByRole("button", { name: "Give award" }).click();
  await expect(page.getByText(/Given\. Musa's parents/)).toBeVisible();
  await expect(page.getByLabel(/What for/)).toHaveValue("");
  await expect(page.getByLabel("Star player")).not.toBeChecked();
  await page.screenshot({ path: shot("coach-awards"), fullPage: true });

  // Musa's other parent (Adnan has used up his codes for the hour in the earlier tests).
  await switchUser(page);
  await signIn(page, "sara@example.com");
  await page.goto("/player");
  await page.getByRole("link", { name: "Musa", exact: true }).click();
  await expect(page.getByText("Brilliant first touch", { exact: false })).toBeVisible();
  await page.screenshot({ path: shot("player-awards"), fullPage: true });
});

/** A small real PDF with one line of text per page, so the viewer has something to draw. */
function makePdf(pages: string[]): Buffer {
  const objects: string[] = [];
  const pageIds = pages.map((_, i) => 4 + i * 2);
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`;
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
  pages.forEach((text, i) => {
    const stream = `BT /F1 36 Tf 60 700 Td (${text}) Tj ET`;
    objects[pageIds[i]] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${pageIds[i] + 1} 0 R >>`;
    objects[pageIds[i] + 1] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  });
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (let n = 1; n < objects.length; n++) {
    offsets[n] = out.length;
    out += `${n} 0 obj\n${objects[n]}\nendobj\n`;
  }
  const xref = out.length;
  out += `xref\n0 ${objects.length}\n0000000000 65535 f \n${offsets.slice(1).map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}

// A 1×1 PNG, for a practice sheet with a photo.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");

test("plans: the club shares a U10 session plan and a practice sheet; the parent opens them in the app", async ({ page, playwright }) => {
  const pdf = makePdf(["Warm-up: rondos", "Main: passing on the move"]);
  await signIn(page, "admin@deensquad.test");
  await page.goto("/coach/plans");
  // Groups with no children (U6) aren't listed.
  await expect(page.getByRole("link", { name: /U10/ }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: /^U6\b/ })).toHaveCount(0);
  await page.getByRole("link", { name: /U10/ }).first().click();
  const plan = page.getByLabel("What you'll work on");
  await plan.fill("Warm-up: rondos\nMain: passing on the move");
  // A scanned sheet over the limit is refused before it's sent, naming its size; the typed plan stays.
  const scan = Buffer.concat([pdf, Buffer.alloc(Math.round(9.5 * 1024 * 1024) - pdf.length, 0x20)]);
  await page.getByLabel(/Attach a PDF or photo/).setInputFiles({ name: "scan.pdf", mimeType: "application/pdf", buffer: scan });
  await page.getByRole("button", { name: "Share with parents" }).click();
  await expect(page.locator("main").getByRole("alert")).toHaveText("That file is 9.5 MB. The limit is 8 MB. Try a photo or a smaller PDF.");
  await expect(page.locator("main").getByRole("alert")).not.toContainText(/signal/i);
  await expect(plan).toHaveValue("Warm-up: rondos\nMain: passing on the move");
  await page.screenshot({ path: shot("coach-plan-too-big"), fullPage: true });
  // A save that never comes back keeps the plan too, and doesn't blame the file.
  const planOffline = noSignal(new URL(page.url()).pathname);
  await page.route(planOffline, abortPosts);
  await page.getByLabel(/Attach a PDF or photo/).setInputFiles({ name: "u10-plan.pdf", mimeType: "application/pdf", buffer: pdf });
  await page.getByRole("button", { name: "Share with parents" }).click();
  await expect(page.locator("main").getByRole("alert")).toHaveText("That didn't save. Your plan is still here.");
  await expect(plan).toHaveValue("Warm-up: rondos\nMain: passing on the move");
  await page.unroute(planOffline);
  await page.getByRole("button", { name: "Share with parents" }).click();
  await expect(page.getByText(/U10 parents can see it/)).toBeVisible();
  await page.screenshot({ path: shot("coach-plan"), fullPage: true });

  // A damaged PDF (it passes the upload check but PDF.js can't read it): the viewer says so and offers Download, not "check your signal".
  await page.goto("/coach/practice");
  await page.getByLabel("Title").fill("Broken file check");
  await page.getByLabel(/Attach a PDF or photo/).setInputFiles({ name: "broken.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n") });
  await page.getByRole("button", { name: "Share with parents" }).click();
  await expect(page.getByText(/Shared\. Parents in those groups/)).toBeVisible();
  await page.getByRole("link", { name: /broken\.pdf/ }).click();
  const unreadable = page.locator("main").getByRole("alert");
  await expect(unreadable).toContainText("This file can't be shown here");
  await expect(unreadable).toContainText("Download it to open on your phone.");
  await expect(unreadable).not.toContainText(/signal/i);
  await expect(unreadable.getByRole("link", { name: "Download" })).toHaveAttribute("href", /\/api\/files\/[0-9a-f-]{36}\?download=1$/);
  await expect(unreadable.getByRole("button", { name: "Try again" })).toHaveCount(0);
  await page.getByRole("link", { name: "Back" }).click();
  await expect(page).toHaveURL(/\/coach\/practice$/);
  // Each sheet's Remove is named for the sheet.
  await page.getByRole("button", { name: "Remove Broken file check" }).click();
  await expect(page.getByRole("heading", { name: "Broken file check" })).toHaveCount(0);

  await page.getByLabel("Title").fill("Keepy-uppy challenge");
  await page.getByLabel(/Instructions/).fill("Ten minutes a day. Tell your coach your best score on Friday.");
  await page.getByLabel(/Attach a PDF or photo/).setInputFiles({ name: "keepy-uppy.png", mimeType: "image/png", buffer: PNG });
  await page.getByRole("button", { name: "Share with parents" }).click();
  await expect(page.getByText(/Shared\. Parents in those groups/)).toBeVisible();
  // The coach opens the sheet's photo in the app's viewer (same window) and comes back.
  await page.getByRole("link", { name: /keepy-uppy\.png/ }).first().click();
  await expect(page).toHaveURL(/\/files\/[0-9a-f-]{36}\?from=%2Fcoach%2Fpractice$/);
  // Staff see the file name they uploaded; parents (below) see "Practice sheet (photo)".
  await expect(page.getByRole("heading", { name: "keepy-uppy.png" })).toBeVisible();
  await expect(page.getByRole("img", { name: "keepy-uppy.png" })).toBeVisible();
  await page.getByRole("link", { name: "Back" }).click();
  await expect(page).toHaveURL(/\/coach\/practice$/);

  await switchUser(page);
  await signIn(page, "sara@example.com");
  await page.goto("/friday");
  await expect(page.getByRole("heading", { name: /U10 session plan/ })).toBeVisible();
  await expect(page.getByText("Main: passing on the move")).toBeVisible();
  await page.screenshot({ path: shot("friday-plan"), fullPage: true });
  // The plan opens inside the app, drawn page by page, with a way back (the installed app has no browser back).
  // Named for what it is, not the coach's file name (kept for Download).
  const fullPlan = page.getByRole("link", { name: /Session plan \(PDF\)/ });
  await expect(page.getByText("u10-plan.pdf")).toHaveCount(0);
  await expect(fullPlan).not.toHaveAttribute("target", "_blank");
  await fullPlan.click();
  await expect(page).toHaveURL(/\/files\/[0-9a-f-]{36}\?from=%2Ffriday$/);
  const viewer = page.url();
  await expect(page.getByRole("heading", { name: "Session plan (PDF)" })).toBeVisible();
  const fileId = viewer.match(/\/files\/([0-9a-f-]{36})/)![1];
  await expect(page.getByText("2 pages", { exact: true })).toBeVisible();
  // A screen reader gets each page's words after its picture (the pages are drawn as pictures).
  await expect(page.locator("main figure").nth(0).locator(".sr-only")).toHaveText("Warm-up: rondos");
  await expect(page.locator("main figure").nth(1).locator(".sr-only")).toHaveText("Main: passing on the move");
  await expect(page.getByRole("img", { name: "Page 1 of 2" })).toHaveAttribute("data-drawn", "drawn");
  const firstPage = (await page.getByRole("img", { name: "Page 1 of 2" }).boundingBox())!;
  expect(firstPage.width).toBeGreaterThan(300);
  await page.getByRole("img", { name: "Page 2 of 2" }).scrollIntoViewIfNeeded();
  await expect(page.getByRole("img", { name: "Page 2 of 2" })).toHaveAttribute("data-drawn", "drawn");
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: shot("file-viewer") });
  const back = page.getByRole("link", { name: "Back" });
  expect((await back.boundingBox())!.height).toBeGreaterThanOrEqual(48);
  // Download saves the file (same rules as viewing it).
  const downloadHref = await page.getByRole("link", { name: "Download" }).getAttribute("href");
  expect(downloadHref).toBe(`/api/files/${fileId}?download=1`);
  const saved = await page.request.get(downloadHref!);
  expect(saved.status()).toBe(200);
  expect(saved.headers()["content-type"]).toBe("application/pdf");
  expect(saved.headers()["content-disposition"]).toBe('attachment; filename="u10-plan.pdf"');
  expect(saved.headers()["x-content-type-options"]).toBe("nosniff");
  expect((await page.request.get(`/api/files/${fileId}`)).headers()["content-disposition"]).toBe('inline; filename="u10-plan.pdf"');
  await back.click();
  await expect(page).toHaveURL(/\/friday$/);
  await expect(page.getByRole("heading", { name: /U10 session plan/ })).toBeVisible();

  // Opened directly (a pasted link, a reload), Back goes to the screen named in the link, not wherever the
  // browser was before. And with no signal the viewer says so and can try again.
  await page.goto("/news");
  await page.route(`**/api/files/${fileId}`, (route) => route.abort("internetdisconnected"));
  await page.goto(viewer);
  await expect(page.locator("main").getByRole("alert")).toContainText("Check your signal and try again");
  await page.unroute(`**/api/files/${fileId}`);
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByText("2 pages", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Back" }).click();
  await expect(page).toHaveURL(/\/friday$/);

  await page.getByRole("link", { name: /Practise at home/ }).click();
  await expect(page.getByRole("heading", { name: "Keepy-uppy challenge" })).toBeVisible();
  await expect(page.getByText("keepy-uppy.png")).toHaveCount(0);
  await page.getByRole("link", { name: /Practice sheet \(photo\)/ }).click();
  await expect(page.getByRole("img", { name: "Practice sheet (photo)" })).toBeVisible();

  // Someone with the link but no sign-in gets sent to sign in, not the file or the viewer.
  const stranger = await playwright.request.newContext({ baseURL: "http://localhost:3100" });
  expect((await stranger.get(`/api/files/${fileId}`, { maxRedirects: 0 })).status()).toBe(307);
  expect((await stranger.get(viewer, { maxRedirects: 0 })).status()).toBe(307);
  await stranger.dispose();

  // A U7-only parent can't open the U10 plan, in the viewer or directly.
  await switchUser(page);
  await signIn(page, "parent16@example.com");
  expect((await page.goto(`/files/${fileId}`))?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "That page isn't on the pitch" })).toBeVisible();
  expect((await page.request.get(`/api/files/${fileId}`)).status()).toBe(404);
});

test("writing help, downloads and badges: AI tidies a draft, an admin downloads a sheet and awards a badge; parents can't download", async ({ page }) => {
  await signIn(page, "admin@deensquad.test");
  await page.goto("/admin/news");
  await expect(page.getByRole("button", { name: "Dictate" })).toBeVisible();
  await expect(page.getByText("First names only. Don't include children's surnames.")).toBeVisible();
  await page.getByLabel("Message").fill("pitch shut sat council reseeding");
  await page.getByRole("button", { name: "Tidy up with AI" }).click();
  await expect(page.getByLabel("Headline")).toHaveValue("Pitch closed on Saturday");
  await expect(page.getByLabel("Message")).toHaveValue("Tidied: pitch shut sat council reseeding");
  await page.screenshot({ path: shot("ai-news"), fullPage: true });
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByLabel("Message")).toHaveValue("pitch shut sat council reseeding");

  await page.goto("/coach/practice");
  await page.getByRole("button", { name: /^Draft$/ }).click();
  await expect(page.getByLabel("Title")).toHaveValue("Pitch closed on Saturday");
  // Spreadsheet downloads and badges (same admin sign-in: the suite stays under the per-email code limit).
  await page.goto("/admin");
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: /Families and payments/ }).click()]);
  expect(download.suggestedFilename()).toMatch(/^deen-squad-families-\d{4}-\d{2}-\d{2}\.csv$/);
  const csv = readFileSync((await download.path())!, "utf8");
  expect(csv).toContain('"Yusuf","Sample","U10"');

  await page.goto("/coach/awards?group=U10");
  await page.getByRole("link", { name: /Yusuf Sample/ }).click();
  await page.getByRole("button", { name: "Award On time ×5" }).click();
  await expect(page.getByRole("button", { name: "Take back On time ×5" })).toBeVisible();
  await page.screenshot({ path: shot("badges"), fullPage: true });
  await page.context().storageState({ path: ADMIN_STATE });

  await switchUser(page);
  await signIn(page, "parent1@example.com");
  const res = await page.request.get("/api/admin/export/families");
  expect(res.status()).toBe(403);
});

test("admin dashboard: a computer gets the sidebar, four sections and a Families table; phones keep the header; a U7 coach sees only U7", async ({ browser }) => {
  test.skip(!existsSync(ADMIN_STATE) || !existsSync(COACH_STATE), "run with the earlier tests: needs their saved sign-in");
  const desktop = { viewport: { width: 1280, height: 800 }, baseURL: "http://localhost:3100" };

  // The admin on a computer.
  const adminContext = await newContext(browser, { ...desktop, storageState: ADMIN_STATE });
  const page = await adminContext.newPage();
  await page.goto("/admin");
  const sidebar = page.getByRole("complementary", { name: "Club admin menu" });
  await expect(sidebar).toBeVisible();
  await expect(sidebar.getByRole("navigation", { name: "Club admin" }).getByRole("link", { name: "Overview" })).toHaveAttribute("aria-current", "page");
  await expect(sidebar.getByRole("link", { name: "Shop" })).toBeVisible();
  await expect(sidebar.getByRole("button", { name: "Sign out" })).toBeVisible();
  await expect(page.locator("header")).toBeHidden();
  for (const name of ["Attendance", "Families and to-dos", "Payments and shop", "News and reminders"]) {
    await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
  }
  await expect(page.getByRole("img", { name: /^U10, .*: \d+ coming, \d+ not coming, \d+ not answered$/ })).toBeVisible();
  await expect(page.getByRole("list", { name: /Children checked in at the last/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /\d+ ready to collect/ })).toBeVisible();
  await expect(page.getByRole("progressbar", { name: /Pitch closed|parents have read it/ }).first()).toBeVisible();
  await expect(page.locator("main")).not.toContainText("NaN");
  await expect(page.getByRole("heading", { name: "This season (from 1 August), sessions with the register taken" })).toBeVisible();
  await expect(page.getByText("These count parents. Their links list the children")).toBeVisible();
  await expect(page.getByRole("link", { name: /^\d+ (parent hasn't|parents haven't) tapped ‘I’ve read this’ on 2 or more messages \(a partner may have\)$/ })).toBeVisible();
  // Every bar and figure on the overview is at least 48px tall to tap.
  for (const link of await page.getByRole("main").getByRole("link").all()) {
    if (await link.isVisible()) expect((await link.boundingBox())!.height, await link.innerText()).toBeGreaterThanOrEqual(48);
  }
  await page.screenshot({ path: shot("admin-dashboard-desktop"), fullPage: true });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.screenshot({ path: shot("admin-dashboard-desktop-dark"), fullPage: true });
  await page.emulateMedia({ colorScheme: "light" });

  // The U10 bar links to that session's register (not just today's) and the register shows its day and time.
  const u10 = page.locator("li", { has: page.locator("b", { hasText: /^U10$/ }) }).first();
  const when = (await u10.locator("p").innerText()).match(/· (\w{3} \d{1,2} \w{3,4}) · (.+) (\d{1,2}:\d{2}[ap]m)$/)!;
  const coming = u10.getByRole("link", { name: /^\d+ coming$/ });
  const href = (await coming.getAttribute("href"))!;
  expect(href).toMatch(/^\/coach\?session=[0-9a-f-]{36}&group=U10$/);
  await coming.click();
  await expect(page).toHaveURL(href);
  await expect(page.getByText(`Gate check-in · ${when[1]} ${when[3]}`)).toBeVisible();
  await expect(page.getByRole("heading", { name: `${when[2]} register` })).toBeVisible();
  await page.goto("/admin");

  // A to-do count opens Families filtered to those children, as a table with one row per child.
  const contract = page.getByRole("link", { name: /^\d+ contract not signed$/ });
  const missing = Number((await contract.innerText()).match(/\d+/)![0]);
  expect(missing).toBeGreaterThan(0);
  await contract.click();
  await expect(page).toHaveURL(/\/admin\/families\?need=contract$/);
  const table = page.getByRole("table", { name: /^Children/ });
  await expect(table).toBeVisible();
  await expect(table.getByRole("row")).toHaveCount(missing + 1);
  await expect(page.getByRole("status").filter({ hasText: "contract not signed" })).toContainText(`${missing} children`);
  await expect(table.getByRole("rowheader", { name: "Musa Sample" })).toHaveCount(0); // Sara signed it for Musa
  await page.screenshot({ path: shot("admin-families-desktop"), fullPage: true });
  // Search by name (every child).
  await page.getByLabel("Show").selectOption("");
  await page.getByLabel("Child or parent name").fill("zara");
  await page.getByRole("button", { name: "Find" }).click();
  await expect(page).toHaveURL(/q=zara/);
  await expect(table.getByRole("row")).toHaveCount(2);
  await expect(table.getByRole("rowheader", { name: "Zara Khan" })).toBeVisible();
  await expect(table.getByRole("row").nth(1)).toContainText("U12");
  await adminContext.close();

  // The same admin on a phone: the pitch header and pill navigation, no sidebar.
  const phoneContext = await newContext(browser, { ...devices["Pixel 7"], viewport: { width: 390, height: 844 }, baseURL: desktop.baseURL, storageState: ADMIN_STATE });
  const phone = await phoneContext.newPage();
  await phone.goto("/admin");
  await expect(phone.getByRole("complementary", { name: "Club admin menu" })).toHaveCount(0);
  await expect(phone.locator("header")).toBeVisible();
  const pills = phone.locator("header").getByRole("navigation", { name: "Club admin" }).getByRole("link");
  await expect(pills).toHaveCount(8);
  const [first, second] = [(await pills.nth(0).boundingBox())!, (await pills.nth(1).boundingBox())!];
  expect(second.y).toBe(first.y); // side by side in one scrolling row
  expect(second.x).toBeGreaterThan(first.x);
  await expect(phone.locator("header").getByRole("button", { name: "Sign out" })).toBeVisible();
  await expect(phone.getByRole("heading", { name: "Families and to-dos" })).toBeVisible();
  await phone.screenshot({ path: shot("admin-dashboard-phone"), fullPage: true });
  await phoneContext.close();

  // Coach Hamza (U7 only since the coach groups test) on a computer: U7 numbers only, no shop.
  const coachContext = await newContext(browser, { ...desktop, storageState: COACH_STATE });
  const coach = await coachContext.newPage();
  await coach.goto("/admin");
  await expect(coach.getByRole("complementary", { name: "Club admin menu" })).toBeVisible();
  await expect(coach.getByRole("link", { name: "Shop" })).toHaveCount(0);
  await expect(coach.getByRole("heading", { name: "Payments", exact: true })).toBeVisible();
  await expect(coach.getByRole("heading", { name: "Payments and shop" })).toHaveCount(0);
  await expect(coach.getByText(/ready to collect|Paid sales/)).toHaveCount(0);
  const main = coach.locator("main");
  await expect(main).not.toContainText(/U6|U10|U12|U15|Girls/);
  await expect(coach.getByRole("img", { name: /^U7, / })).toBeVisible();
  // The five U7s: Musa's parents have finished his To-do, the other four haven't started.
  await expect(main.getByRole("heading", { name: "Children with to-dos left (of 5 children)" })).toBeVisible();
  await expect(coach.getByRole("link", { name: "4 contract not signed" })).toBeVisible();
  await expect(coach.getByRole("link", { name: "4 no emergency contact" })).toBeVisible();
  await coach.getByRole("link", { name: "4 no emergency contact" }).click();
  await expect(coach.getByRole("table", { name: /^Children/ }).getByRole("row")).toHaveCount(5);
  await coachContext.close();
});

test("families: a filtered list keeps its filter after opening a child and tapping Families, on a phone and a computer", async ({ browser }) => {
  test.skip(!existsSync(ADMIN_STATE), "run with the earlier tests: needs their saved sign-in");
  const baseURL = "http://localhost:3100";
  for (const [name, options] of [
    ["phone", { ...devices["Pixel 7"], viewport: { width: 390, height: 844 } }],
    ["computer", { viewport: { width: 1280, height: 800 } }],
  ] as const) {
    const context = await newContext(browser, { ...options, baseURL, storageState: ADMIN_STATE });
    const page = await context.newPage();
    await page.goto("/admin/families?need=contract");
    const child = (name === "phone" ? page.locator("main ul") : page.getByRole("table", { name: /^Children/ })).locator('a[href^="/admin/families/"]').first();
    await expect(child, name).toHaveAttribute("href", /^\/admin\/families\/[0-9a-f-]{36}\?need=contract$/);
    await child.click();
    await expect(page, name).toHaveURL(/\/admin\/families\/[0-9a-f-]{36}\?need=contract$/);
    await page.getByRole("link", { name: "← Families" }).click();
    await expect(page, name).toHaveURL(/\/admin\/families\?need=contract$/);
    await expect(page.locator("#need"), name).toHaveValue("contract");
    await context.close();
  }
});

test("privacy: anyone can read the notice from the sign-in screen", async ({ page }) => {
  await page.goto("/sign-in");
  const link = page.getByRole("link", { name: "How the club uses your information" });
  const href = await link.getAttribute("href");
  expect(href).toBe("/privacy");
  // Same window, so an installed app doesn't hand the parent over to Safari.
  expect(await link.getAttribute("target")).toBeNull();
  await link.click();
  await expect(page.getByRole("heading", { name: "Your rights" })).toBeVisible();
  await page.screenshot({ path: shot("privacy"), fullPage: true });
  // Signed out, Back goes to sign in.
  await page.getByRole("link", { name: "Back", exact: true }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
});

/** A one-frame Y4M video of a picture on white, for Chromium's fake camera (greyscale is enough for a QR code). */
type Picture = { data: number[]; width: number; height: number };

function cameraVideo(png: Picture, width = 640, height = 480): Buffer {
  const y = Buffer.alloc(width * height, 255);
  const left = Math.floor((width - png.width) / 2);
  const top = Math.floor((height - png.height) / 2);
  for (let row = 0; row < png.height; row++) {
    for (let col = 0; col < png.width; col++) {
      const i = (row * png.width + col) * 4;
      y[(top + row) * width + left + col] = Math.round(0.299 * png.data[i] + 0.587 * png.data[i + 1] + 0.114 * png.data[i + 2]);
    }
  }
  const chroma = Buffer.alloc((width / 2) * (height / 2) * 2, 128);
  return Buffer.concat([Buffer.from(`YUV4MPEG2 W${width} H${height} F10:1 Ip A1:1 C420jpeg\nFRAME\n`), y, chroma]);
}

test("tournament squads: the admin picks two U10s and messages them; only their families see it", async ({ browser, page }) => {
  test.skip(!existsSync(ADMIN_STATE), "run with the earlier tests: needs their saved sign-in");
  const adminContext = await newContext(browser, {
    ...devices["Pixel 7"],
    viewport: { width: 390, height: 844 },
    baseURL: "http://localhost:3100",
    storageState: ADMIN_STATE,
  });
  const admin = await adminContext.newPage();
  await admin.goto("/admin/sessions");
  await admin.getByLabel("Title").fill("County Cup");
  await admin.getByLabel("Kind").selectOption("tournament");
  // After this week's Friday, so it's asked about beside the next training.
  await admin.getByLabel("Date", { exact: true }).fill(new Date(Date.now() + 12 * 86400000).toISOString().slice(0, 10));
  await admin.getByLabel("Starts").fill("09:00");
  await admin.getByLabel("Finishes").fill("13:00");
  for (const g of ["U6", "U7", "U12", "U15"]) await admin.getByLabel(g, { exact: true }).uncheck();
  await admin.getByRole("button", { name: "Add sessions" }).click();
  await expect(admin.getByText(/^Added 1 session\./)).toBeVisible();
  await admin.getByRole("link", { name: /^Pick squad for County Cup/ }).click();
  await expect(admin.getByRole("heading", { name: "County Cup squad" })).toBeVisible();
  const sessionId = admin.url().match(/\/admin\/sessions\/([0-9a-f-]{36})\/squad$/)![1];

  const picker = admin.getByRole("form", { name: "Pick the squad" });
  // Every U10 (the sample club's, plus those added by the import and sign-up tests).
  const total = Number((await picker.getByText(/^0 of \d+ selected$/).textContent())!.match(/of (\d+)/)![1]);
  expect(total).toBeGreaterThanOrEqual(16);
  await picker.getByRole("button", { name: "Select all" }).click();
  await expect(picker.getByText(`${total} of ${total} selected`)).toBeVisible();
  await picker.getByRole("button", { name: "Clear" }).click();
  await picker.getByLabel("Bilal R").check();
  await picker.getByLabel("Hamza T").check();
  await expect(picker.getByText(`2 of ${total} selected`)).toBeVisible();
  expect((await picker.getByText("Bilal R").locator("xpath=ancestor::label").boundingBox())!.height).toBeGreaterThanOrEqual(48);
  await picker.getByRole("button", { name: "Save squad" }).click();
  await expect(picker.getByText("Squad saved.")).toBeVisible();
  await expect(picker.getByText("Not answered")).toHaveCount(2);

  await admin.getByLabel("Headline").fill("County Cup: meet at 9am");
  await admin.getByLabel("Message").fill("Bring water and the away kit.");
  await admin.getByRole("button", { name: "Send to the squad's parents" }).click();
  await expect(admin.getByText("Posted. Parents see it at the top of Club news.")).toBeVisible();
  await expect(admin.getByText(/Squad · County Cup/)).toBeVisible();
  await expect(admin.getByText("0 of 2 read")).toBeVisible();
  await expect(admin.getByText("Parent R", { exact: true })).toBeVisible();
  await expect(admin.getByText("Parent K", { exact: true })).toHaveCount(0);

  // Bilal's parent is asked, and answers yes.
  await signIn(page, "parent2@example.com");
  await page.goto("/friday");
  const question = page.getByRole("group", { name: /^Can Bilal play in County Cup on / });
  await expect(question).toBeVisible();
  await question.getByRole("button", { name: "Yes" }).click();
  await expect(page.getByText("Saved. The coach can see Bilal can play.")).toBeVisible();
  await page.screenshot({ path: shot("parent-squad-invite"), fullPage: true });
  await page.goto("/news");
  await expect(page.getByRole("heading", { name: "County Cup: meet at 9am" })).toBeVisible();

  // Ahmed (U10, not picked): no tournament, no message. (A fresh browser, so no late cookie from Bilal's parent.)
  const otherContext = await newContext(browser, { ...devices["Pixel 7"], viewport: { width: 390, height: 844 }, baseURL: "http://localhost:3100" });
  const other = await otherContext.newPage();
  await signIn(other, "parent1@example.com");
  await other.goto("/friday");
  await expect(other.getByRole("heading", { name: /Is Ahmed coming/ })).toBeVisible();
  await expect(other.getByText(/County Cup/)).toHaveCount(0);
  await other.goto("/news");
  await expect(other.getByRole("heading", { name: "Club news" })).toBeVisible();
  await expect(other.getByText(/County Cup/)).toHaveCount(0);
  await otherContext.close();

  // The admin sees the answer, and the register lists only the squad.
  await admin.goto(`/admin/sessions/${sessionId}/squad`);
  await expect(admin.getByText("Confirmed", { exact: true })).toBeVisible();
  await expect(admin.getByText("2 picked · 1 confirmed · 0 can't play · 1 not answered")).toBeVisible();
  await admin.screenshot({ path: shot("admin-squad"), fullPage: true });
  await admin.goto("/admin/sessions");
  await expect(admin.getByText("Squad: 2 picked")).toBeVisible();
  await admin.goto(`/coach?session=${sessionId}`);
  await expect(admin.getByRole("heading", { name: "County Cup register" })).toBeVisible();
  await expect(admin.getByRole("button", { name: /^Mark .+ here$/ })).toHaveCount(2);
  await expect(admin.getByRole("button", { name: "Mark Bilal R. here" })).toBeVisible();
  await expect(admin.getByRole("button", { name: "Mark Hamza T. here" })).toBeVisible();
  await adminContext.close();
});

test("session changes: an admin edits a session, cancels it with a reason and tells the families, then deletes it", async ({ browser, page }) => {
  test.skip(!existsSync(ADMIN_STATE), "run with the earlier tests: needs their saved sign-in");
  const adminContext = await newContext(browser, {
    ...devices["Pixel 7"],
    viewport: { width: 390, height: 844 },
    baseURL: "http://localhost:3100",
    storageState: ADMIN_STATE,
  });
  const admin = await adminContext.newPage();
  // A U12 session today, before this Friday's training (Zara, from the import, is the only U12).
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date());
  const day = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", weekday: "short", day: "numeric", month: "short" }).format(new Date());
  await admin.goto("/admin/sessions");
  await admin.getByLabel("Title").fill("U12 extra");
  await admin.getByLabel("Date", { exact: true }).fill(today);
  await admin.getByLabel("Starts").fill("00:01");
  await admin.getByLabel("Finishes").fill("23:58");
  for (const g of ["U6", "U7", "U10", "U15"]) await admin.getByLabel(g, { exact: true }).uncheck();
  await admin.getByRole("button", { name: "Add sessions" }).click();
  await expect(admin.getByText(/^Added 1 session\./)).toBeVisible();

  // Edit: the venue and a note for parents.
  await admin.getByRole("link", { name: `Edit U12 extra ${day}` }).click();
  await expect(admin.getByRole("heading", { name: "Edit U12 extra" })).toBeVisible();
  await admin.getByLabel("Venue").fill("Valentines Park");
  await admin.getByLabel(/Notes for parents/).fill("Meet at the side gate");
  await admin.getByRole("button", { name: "Save changes" }).click();
  await expect(admin.getByText("Saved.", { exact: true })).toBeVisible();
  await expect(admin.getByLabel("Venue")).toHaveValue("Valentines Park");

  await signIn(page, "sana@example.com");
  await page.goto("/friday");
  await expect(page.getByRole("group", { name: /Is Zara coming/ })).toBeVisible();
  await expect(page.getByText("Valentines Park").first()).toBeVisible();
  await expect(page.getByText("Meet at the side gate").first()).toBeVisible();

  // Cancel, with a reason, telling the families (ticked already).
  await admin.goto("/admin/sessions");
  await admin.getByRole("link", { name: `Cancel U12 extra ${day}` }).click();
  await expect(admin.getByRole("heading", { name: "Cancel U12 extra?" })).toBeVisible();
  await expect(admin.getByLabel(/Tell the families now/)).toBeChecked();
  await admin.getByLabel(/Reason/).fill("Pitch waterlogged");
  await admin.screenshot({ path: shot("admin-session-cancel"), fullPage: true });
  await admin.getByRole("button", { name: "Cancel session" }).click();
  await expect(admin.getByText("Cancelled. The families have been told.")).toBeVisible();
  await expect(admin.getByText("Reason: Pitch waterlogged")).toBeVisible();

  // The parent sees the cancellation with its reason, and is still asked about Zara's next session.
  await page.goto("/friday");
  await expect(page.getByText(`Cancelled: U12 extra, ${day} · U12`)).toBeVisible();
  await expect(page.getByText("Pitch waterlogged")).toBeVisible();
  await expect(page.getByText("Check club news")).toHaveCount(0);
  const next = page.getByRole("group", { name: /Is Zara coming/ });
  await expect(next).toBeVisible();
  await next.getByRole("button", { name: "Coming" }).click();
  await expect(page.getByText("Saved. Coach can see Zara is coming.")).toBeVisible();
  await page.screenshot({ path: shot("parent-friday-cancelled"), fullPage: true });
  await page.goto("/news");
  await expect(page.getByRole("heading", { name: `U12 extra on ${day} is cancelled` })).toBeVisible();
  // Urgent: emailed at once, not after 24 hours (except at night, when nothing is sent until 8am).
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "2-digit", hourCycle: "h23" }).format(new Date()));
  if (hour >= 8 && hour < 21) {
    await expect
      .poll(() => readFileSync(OUTBOX, "utf8").includes(`Please read: U12 extra on ${day} is cancelled`), { timeout: 15_000 })
      .toBe(true);
  }

  // Delete asks first and says what goes with it; "Keep it" leaves it alone.
  await admin.goto("/admin/sessions");
  await admin.getByRole("link", { name: `Delete U12 extra ${day}` }).click();
  await expect(admin.getByRole("heading", { name: "Delete U12 extra?" })).toBeVisible();
  await expect(admin.getByText("Nothing else is attached to it yet. This can't be undone.")).toBeVisible();
  await admin.getByRole("link", { name: "Keep it" }).click();
  await expect(admin.getByText(/U12 extra/).first()).toBeVisible();
  await admin.getByRole("link", { name: `Delete U12 extra ${day}` }).click();
  await admin.getByRole("button", { name: "Delete session" }).click();
  await expect(admin.getByText("Deleted.")).toBeVisible();
  await expect(admin.getByText(/U12 extra/)).toHaveCount(0);
  await adminContext.close();
});

// Runs last: it adds a session today, which changes what the register shows.
test("gate pass: a parent shows the QR pass, a coach scans it (after a dropped signal) and can undo it", async ({ page, playwright }) => {
  // The parent's pass (Musa's mother; each address may only ask for five codes an hour).
  await signIn(page, "sara@example.com");
  await page.goto("/pass");
  await expect(page.getByRole("heading", { name: "Attendance QR codes" })).toBeVisible();
  const qr = page.getByRole("img", { name: "QR code that checks Musa in" });
  await expect(qr).toBeVisible();
  await page.screenshot({ path: shot("pass"), fullPage: true });
  // The pass as the parent's screen draws it (its QR picture, 300px across, on white).
  const picture: Picture = await qr.evaluate(async (el) => {
    const svg = el.querySelector("svg")!;
    const img = new Image();
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(svg))}`;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 300;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, 300, 300);
    ctx.drawImage(img, 0, 0, 300, 300);
    return { data: Array.from(ctx.getImageData(0, 0, 300, 300).data), width: 300, height: 300 };
  });
  expect(jsQR(new Uint8ClampedArray(picture.data), picture.width, picture.height)?.data).toMatch(/^DSP\.[0-9a-f-]{36}\./);
  const video = resolve("e2e/.results/musa-pass.y4m");
  writeFileSync(video, cameraVideo(picture));

  // Large text and 200% zoom (a 195px-wide screen): the tab bar grows and the page makes room for it, so everything
  // down to the last tip can be scrolled clear of the bar.
  const clearOfTabBar = async () => {
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const bar = (await page.getByRole("navigation", { name: "Main" }).boundingBox())!;
    const tip = (await page.getByText(/This phone keeps a copy/).boundingBox())!;
    return bar.y - (tip.y + tip.height);
  };
  await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
  await expect.poll(clearOfTabBar).toBeGreaterThanOrEqual(0);
  await page.screenshot({ path: shot("pass-large-text") });
  await page.reload();
  await page.setViewportSize({ width: 195, height: 422 });
  await expect.poll(clearOfTabBar).toBeGreaterThanOrEqual(0);
  await page.screenshot({ path: shot("pass-zoom-200") });
  await page.setViewportSize({ width: 390, height: 844 });

  // The coach's phone, with that pass held up to its camera. (By now Coach Hamza runs the U7s only, so the new session is theirs.)
  const browser = await playwright.chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined,
    args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-video-capture=${video}`],
  });
  try {
    const context = await newContext(browser, {
      ...devices["Pixel 7"],
      viewport: { width: 390, height: 844 },
      baseURL: "http://localhost:3100",
      permissions: ["camera"],
      extraHTTPHeaders: { "x-forwarded-for": "10.0.1.1" },
    });
    const coach = await context.newPage();
    await signIn(coach, "coach@deensquad.test");
    // Today's session, so the pass checks the child in whatever day the suite runs.
    await coach.goto("/admin/sessions");
    await coach.getByLabel("Title").fill("Gate test");
    await coach.getByLabel("Date", { exact: true }).fill(new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date()));
    await coach.getByLabel("Starts").fill("00:00");
    await coach.getByLabel("Finishes").fill("23:59");
    await coach.getByRole("button", { name: "Add sessions" }).click();
    await expect(coach.getByText(/^Added 1 session\./)).toBeVisible();
    await coach.goto("/coach?group=U7");
    const gateTest = coach.getByRole("navigation", { name: "Today's sessions" }).getByRole("link", { name: /Gate test/ });
    if (await gateTest.count()) await gateTest.click();
    await expect(coach.getByRole("heading", { name: "Gate test register" })).toBeVisible();
    const here = coach.getByRole("region", { name: /^Here/ });
    await expect(here.getByRole("heading", { name: "Here (0)" })).toBeVisible();

    // No signal at the gate: the scanner says so (not "not a pass") and offers to try again.
    const offline = (url: URL) => url.pathname === "/coach";
    await coach.route(offline, (route) => (route.request().method() === "POST" ? route.abort("internetdisconnected") : route.continue()));
    await coach.getByRole("button", { name: "Scan QR codes" }).click();
    const scanner = coach.getByRole("dialog", { name: "Scan attendance QR codes" });
    await expect(scanner.getByText("No signal – not checked in yet")).toBeVisible({ timeout: 15_000 });
    await expect(scanner.getByText("That isn't a Deen Squad attendance QR code.")).toHaveCount(0);
    expect((await scanner.getByRole("button", { name: "Try again" }).boundingBox())!.height).toBeGreaterThanOrEqual(48);
    await coach.screenshot({ path: shot("coach-scan-no-signal") });

    await coach.unroute(offline);
    await scanner.getByRole("button", { name: "Try again" }).click();
    await expect(scanner.getByText("Musa S.")).toBeVisible();
    await expect(scanner.getByText("U7 · Checked in", { exact: true })).toBeVisible();
    await coach.screenshot({ path: shot("coach-scan") });
    await scanner.getByRole("button", { name: "Close the scanner" }).click();

    await expect(here.getByRole("heading", { name: "Here (1)" })).toBeVisible();
    await expect(here.getByText(/QR code scanned/)).toBeVisible();
    await here.getByRole("button", { name: "Undo check-in for Musa S." }).click();
    await expect(here.getByRole("heading", { name: "Here (0)" })).toBeVisible();

    // A Mark here that fails without signal keeps the register and says so on Musa's row, with Try again.
    await coach.route(offline, (route) => (route.request().method() === "POST" ? route.abort("internetdisconnected") : route.continue()));
    await coach.getByRole("button", { name: "Mark Musa S. here" }).click();
    const musaRow = coach.getByRole("listitem").filter({ hasText: "Musa S." });
    await expect(musaRow.getByText("That didn't save. Check your signal and try again.")).toBeVisible();
    await expect(coach.getByRole("heading", { name: "Gate test register" })).toBeVisible();
    await expect(coach.getByRole("heading", { name: "Something went wrong" })).toHaveCount(0);
    await coach.screenshot({ path: shot("coach-mark-no-signal") });
    await coach.unroute(offline);
    await musaRow.getByRole("button", { name: "Try again" }).click();
    await expect(here.getByRole("heading", { name: "Here (1)" })).toBeVisible();
    await expect(here.getByText("Marked here")).toBeVisible();
    await context.close();
  } finally {
    await browser.close();
  }

  // Back on the parent's phone: Musa is checked in, so Friday says so instead of asking, and so does the QR screen.
  await page.goto("/friday");
  await expect(page.getByText(/^Musa was checked in at \d{1,2}:\d\d[ap]m$/)).toBeVisible();
  await expect(page.getByRole("group", { name: /Is Musa coming/ })).toHaveCount(0);
  await page.screenshot({ path: shot("friday-checked-in"), fullPage: true });
  await page.goto("/pass");
  await expect(page.getByText(/^Musa was checked in at \d{1,2}:\d\d[ap]m$/)).toBeVisible();
});

test("staff roles: an admin makes a coach an admin, who then sees the shop, and back again", async ({ browser }) => {
  test.skip(!existsSync(ADMIN_STATE) || !existsSync(COACH_STATE), "run with the earlier tests: needs their saved sign-in");
  const phone = { ...devices["Pixel 7"], viewport: { width: 390, height: 844 }, baseURL: "http://localhost:3100" };
  const adminContext = await newContext(browser, { ...phone, storageState: ADMIN_STATE });
  const coachContext = await newContext(browser, { ...phone, storageState: COACH_STATE });
  const admin = await adminContext.newPage();
  const coach = await coachContext.newPage();

  await coach.goto("/admin");
  await expect(coach.getByRole("link", { name: "Shop", exact: true })).toHaveCount(0);
  // Greeted by name, not by "Coach"; on a phone every section is on screen without scrolling sideways.
  await expect(coach.getByRole("heading", { name: "Assalamu alaikum, Hamza" })).toBeVisible();
  for (const name of ["Plans", "Points and stars"]) {
    await expect(coach.getByRole("navigation", { name: "Club admin" }).getByRole("link", { name })).toBeInViewport({ ratio: 1 });
  }

  await admin.goto("/admin/staff");
  // The only admin can't be made a coach (nor change their own role).
  await expect(admin.getByRole("button", { name: "Make Ibrahim Khan a coach" })).toHaveCount(0);
  const makeAdmin = admin.getByRole("button", { name: "Make Coach Hamza an admin" });
  expect((await makeAdmin.boundingBox())!.height).toBeGreaterThanOrEqual(48);
  await makeAdmin.click();
  await expect(admin.getByRole("button", { name: "Make Coach Hamza a coach" })).toBeVisible();
  await expect(admin.getByRole("form", { name: "Coach Hamza's groups" })).toHaveCount(0);
  await admin.screenshot({ path: shot("admin-staff-roles"), fullPage: true });

  await coach.goto("/admin");
  await coach.getByRole("link", { name: "Shop", exact: true }).click();
  await expect(coach).toHaveURL(/\/admin\/shop$/);

  // And back: a coach again (of every group until their groups are ticked), with no shop.
  await admin.getByRole("button", { name: "Make Coach Hamza a coach" }).click();
  await expect(admin.getByRole("button", { name: "Make Coach Hamza an admin" })).toBeVisible();
  await expect(admin.getByRole("form", { name: "Coach Hamza's groups" }).getByLabel("U7")).not.toBeChecked();
  await coach.goto("/admin");
  await expect(coach.getByRole("link", { name: "Shop", exact: true })).toHaveCount(0);
  await adminContext.close();
  await coachContext.close();
});

test("gate register: with 12 children in, the list still to arrive starts on the first screen; search and All groups", async ({ browser }) => {
  test.skip(!existsSync(ADMIN_STATE), "run with the earlier tests: needs their saved sign-in");
  const context = await newContext(browser, { ...devices["Pixel 7"], viewport: { width: 390, height: 844 }, baseURL: "http://localhost:3100", storageState: ADMIN_STATE });
  const page = await context.newPage();
  // Fourteen new U15s, as imported: no payment plan or photo consent yet, so every one needs a word at the gate.
  const names = ["Adam", "Bilal", "Dawud", "Faris", "Hamza", "Idris", "Jibril", "Khalid", "Luqman", "Nuh", "Omar", "Rayan", "Sulaiman", "Zayd"];
  await page.goto("/admin/families/import");
  await page.getByText("Or paste the rows").click();
  await page
    .locator("textarea[name=csv]")
    .fill(["Child first name,Child last name,Age group,Parent first name,Parent email", ...names.map((n, i) => `${n},Layout,U15,Parent,layout${i}@example.com`)].join("\n"));
  await page.getByRole("button", { name: "Check the file" }).click();
  await page.getByRole("button", { name: "Import 14 rows" }).click();
  await expect(page.getByText(/14 children added/)).toBeVisible();

  // Today, for U12 (Zara, from the import test) and U15: not the sample families' groups, so later tests are unchanged.
  const session = await addSessionToday(page, "Gate layout", ["U12", "U15"]);
  await page.goto(`/coach?session=${session}&group=U15`);
  const notHere = page.getByRole("region", { name: /^Not here yet/ });
  const here = page.getByRole("region", { name: /^Here/ });
  for (let i = 1; i <= 12; i++) {
    await notHere.getByRole("button", { name: /^Mark .+ here$/ }).first().click();
    await expect(here.getByRole("heading", { name: `Here (${i})` })).toBeVisible();
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  // One summary line for all twelve, with the names a tap away; each child's flags are on their own row.
  await expect(page.getByText(/^12 children need a word \(12 no payment plan, 12 no photo consent\b/)).toBeVisible();
  await expect(here.getByRole("listitem").filter({ hasText: "Adam L." }).getByText("No payment plan", { exact: true })).toBeVisible();
  const heading = notHere.getByRole("heading", { name: "Not here yet (2)" });
  await expect(heading).toBeVisible();
  await page.screenshot({ path: shot("coach-register-busy") });
  expect((await heading.boundingBox())!.y).toBeLessThan(700);

  // Search narrows every list as you type.
  const search = page.getByLabel("Find a child");
  await search.fill("zay");
  await expect(notHere.getByRole("button", { name: /^Mark .+ here$/ })).toHaveCount(1);
  await expect(notHere.getByRole("button", { name: "Mark Zayd L. here" })).toBeVisible();
  await expect(here.getByRole("listitem")).toHaveCount(0);
  await search.fill("adam l");
  await expect(here.getByRole("listitem")).toHaveCount(1);
  await expect(notHere.getByRole("button", { name: /^Mark .+ here$/ })).toHaveCount(0);
  await search.fill("");
  await expect(here.getByRole("listitem")).toHaveCount(12);

  // All groups: both groups' children in one list, each with their group; Mark here and Undo work the same.
  await page.getByRole("navigation", { name: "Groups" }).getByRole("link", { name: "All groups" }).click();
  await expect(page.getByRole("heading", { name: "All groups", level: 2 })).toBeVisible();
  const zara = notHere.getByRole("listitem").filter({ hasText: "Zara K." });
  await expect(zara.getByText("U12", { exact: true })).toBeVisible();
  await expect(notHere.getByRole("listitem").filter({ hasText: "Zayd L." }).getByText("U15", { exact: true })).toBeVisible();
  await zara.getByRole("button", { name: "Mark Zara K. here" }).click();
  await expect(here.getByRole("heading", { name: "Here (13)" })).toBeVisible();
  await expect(here.getByRole("listitem").filter({ hasText: "Zara K." }).getByText("U12", { exact: true })).toBeVisible();
  await page.screenshot({ path: shot("coach-register-all-groups"), fullPage: true });

  // Undo every check-in, then the session can go.
  while ((await here.getByRole("button", { name: /^Undo check-in for / }).count()) > 0) {
    const n = await here.getByRole("button", { name: /^Undo check-in for / }).count();
    await here.getByRole("button", { name: /^Undo check-in for / }).first().click();
    await expect(here.getByRole("heading", { name: `Here (${n - 1})` })).toBeVisible();
  }
  await deleteSessionToday(page, "Gate layout");
  await context.close();
});

test("squad page on a phone: Save stays on screen, and a group filter keeps the other groups' picks", async ({ browser }) => {
  test.skip(!existsSync(ADMIN_STATE), "run with the earlier tests: needs their saved sign-in");
  const context = await newContext(browser, { ...devices["Pixel 7"], viewport: { width: 390, height: 844 }, baseURL: "http://localhost:3100", storageState: ADMIN_STATE });
  const page = await context.newPage();
  await page.goto("/admin/sessions");
  await page.getByLabel("Title").fill("Filter Cup");
  await page.getByLabel("Kind").selectOption("tournament");
  // Months away, so it never becomes anyone's next session.
  await page.getByLabel("Date", { exact: true }).fill(new Date(Date.now() + 250 * 86400000).toISOString().slice(0, 10));
  for (const g of ["U6", "U7", "U15"]) await page.getByLabel(g, { exact: true }).uncheck();
  await page.getByRole("button", { name: "Add sessions" }).click();
  await expect(page.getByText(/^Added 1 session\./)).toBeVisible();
  await page.getByRole("link", { name: /^Pick squad for Filter Cup/ }).click();
  const picker = page.getByRole("form", { name: "Pick the squad" });

  // Save is on screen straight away, without scrolling, and stays there while the list scrolls.
  const save = picker.getByRole("button", { name: /^Save squad \(\d+ picked\)$/ });
  await expect(save).toBeInViewport({ ratio: 1 });
  await page.screenshot({ path: shot("admin-squad-phone") });

  await picker.getByLabel("Bilal R").check();
  await expect(save).toHaveAccessibleName("Save squad (1 picked)");
  // Each child shows their attendance this season.
  await expect(picker.getByText(/^U10 · .*(\d+ of \d+ sessions? this season|No register taken yet this season)$/).first()).toBeVisible();
  // Only U12: Bilal (U10) is hidden but still picked.
  await picker.getByRole("button", { name: "U12 only" }).click();
  await expect(picker.getByLabel("Bilal R")).toBeHidden();
  await picker.getByLabel("Zara K").check();
  await expect(picker.getByText(/^2 of \d+ selected$/)).toBeVisible();
  await page.getByLabel("Find a child").fill("zar");
  await page.mouse.wheel(0, 2000);
  await expect(save).toBeInViewport({ ratio: 1 });
  await save.click();
  await expect(picker.getByText("Squad saved.")).toBeVisible();
  await page.reload();
  await expect(picker.getByLabel("Bilal R")).toBeChecked();
  await expect(picker.getByLabel("Zara K")).toBeChecked();

  // Picking nobody and deleting it leaves the club as it was.
  await picker.getByRole("button", { name: "Clear" }).click();
  await picker.getByRole("button", { name: "Save squad (0 picked)" }).click();
  await expect(picker.getByText("Squad saved.")).toBeVisible();
  await page.goto("/admin/sessions");
  await page.getByRole("link", { name: /^Delete Filter Cup / }).click();
  await page.getByRole("button", { name: "Delete session" }).click();
  await expect(page.getByText("Deleted.")).toBeVisible();
  await context.close();
});
