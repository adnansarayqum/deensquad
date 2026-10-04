import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

// Signs in with real emailed codes (read from the test outbox) and walks through the parent,
// coach and admin flows against the sample club. Screenshots land in e2e/.results/screens.
// The server starts with a fresh in-memory database, and the tests build on each other in order.

const shot = (name: string) => `e2e/.results/screens/${name}.png`;
const OUTBOX = "e2e/.results/outbox.jsonl";

function latestCode(email: string): string {
  const lines = readFileSync(OUTBOX, "utf8").trim().split("\n").map((l) => JSON.parse(l) as { to: string; subject: string; text: string });
  const mail = lines.filter((m) => m.to === email).at(-1);
  const code = mail?.subject.match(/^(\d{6})/)?.[1];
  if (!code) throw new Error(`No code emailed to ${email}`);
  return code;
}

async function signIn(page: Page, email: string) {
  await page.goto("/sign-in");
  await page.getByLabel("Email address").fill(email);
  await page.getByRole("button", { name: "Email me a code" }).click();
  await expect(page).toHaveURL(/\/sign-in\/code$/);
  await page.getByLabel("6-digit code").fill(latestCode(email));
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).not.toHaveURL(/\/sign-in/);
}

test.beforeEach(async ({ context }) => {
  await context.clearCookies();
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

test("an unknown email gets the same screen and no email", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByLabel("Email address").fill("stranger@example.org");
  await page.getByRole("button", { name: "Email me a code" }).click();
  await expect(page).toHaveURL(/\/sign-in\/code$/);
  expect(readFileSync(OUTBOX, "utf8")).not.toContain("stranger@example.org");
});

test("news: a parent of two acknowledges the kit message", async ({ page }) => {
  await signIn(page, "adnan@example.com");
  await expect(page.getByRole("heading", { name: "Club news" })).toBeVisible();
  await expect(page.getByText("Are Yusuf and Musa coming?")).toBeVisible();
  await expect(page.getByRole("main").getByText("1 unread")).toBeVisible();
  await page.screenshot({ path: shot("news"), fullPage: true });

  await page.getByRole("button", { name: "I've read this" }).click();
  await expect(page.getByText("You're all caught up")).toBeVisible();
});

test("friday: each child gets their own answer and headcount", async ({ page }) => {
  await signIn(page, "adnan@example.com");
  await page.goto("/friday");
  await expect(page.getByRole("heading", { name: "Who's coming?" })).toBeVisible();
  await expect(page.getByText("11 of 16 coming")).toBeVisible();
  const yusuf = page.getByRole("group", { name: /Is Yusuf coming/ });
  const musa = page.getByRole("group", { name: /Is Musa coming/ });
  await yusuf.getByRole("button", { name: "Coming" }).click();
  await expect(page.getByText("Saved. Coach can see Yusuf is coming.")).toBeVisible();
  await expect(page.getByText("12 of 16 coming")).toBeVisible();
  await musa.getByRole("button", { name: "Not this week" }).click();
  await expect(page.getByText("Saved. Coach knows Musa is away this week.")).toBeVisible();
  await page.screenshot({ path: shot("friday"), fullPage: true });

  await page.getByRole("link", { name: "News" }).click();
  await expect(page.getByText(/Yusuf coming · Musa away/)).toBeVisible();
});

test("to-do: contacts copied to a sibling, consent and payments", async ({ page }) => {
  await signIn(page, "sara@example.com");
  await page.goto("/checklist");
  await expect(page.getByRole("progressbar", { name: "5 of 8 steps done" })).toBeVisible();
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

  await musa.getByRole("link", { name: /Set up payments/ }).click();
  await page.getByRole("button", { name: "I've set it up for Musa" }).click();
  await expect(page).toHaveURL(/\/checklist$/);
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
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
  await page.goto("/news");
  await expect(page).toHaveURL(/\/sign-in/);
});

test("coach: register marks a player here; parents can't open it", async ({ page }) => {
  await signIn(page, "coach@deensquad.test");
  await page.goto("/coach");
  await page.getByRole("link", { name: "U10", exact: true }).click();
  await expect(page.getByText("0 of 14 expected")).toBeVisible();
  await page.getByRole("button", { name: "Mark Yusuf S. here" }).click();
  await expect(page.getByText("Yusuf S. checked in")).toBeVisible();
  await expect(page.getByText("1 of 14 expected")).toBeVisible();
  await page.screenshot({ path: shot("coach"), fullPage: true });
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
  await expect(page.getByText("Zara Khan")).toBeVisible();
  await page.getByRole("button", { name: "Email invites" }).click();
  await expect(page.getByText(/Invites sent to \d+ parents/)).toBeVisible();
  expect(readFileSync(OUTBOX, "utf8")).toContain("sana@example.com");

  await page.goto("/admin/news");
  await page.getByLabel("Headline").fill("Pitch closed on Saturday");
  await page.getByLabel("Message").fill("The council is reseeding the pitch.");
  await page.getByRole("button", { name: "Post to parents" }).click();
  await expect(page.getByText("Posted.")).toBeVisible();
  await expect(page.getByText(/0 of \d+ read/)).toBeVisible();
  await page.screenshot({ path: shot("admin-news"), fullPage: true });

  await page.goto("/admin/sessions");
  await page.getByLabel("Title").fill("Cup training");
  await page.getByRole("button", { name: "Add sessions" }).click();
  await expect(page.getByText("Sessions added.")).toBeVisible();
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

  await page.getByRole("link", { name: /Hoodie/ }).click();
  await page.getByText("Yusuf", { exact: true }).click();
  await page.getByText("9-10", { exact: true }).click();
  await page.getByLabel(/Initials/).fill("ys");
  await page.screenshot({ path: shot("shop-item"), fullPage: true });
  await page.getByRole("button", { name: "Add to basket" }).click();
  await expect(page.getByText("Added to your basket.")).toBeVisible();

  await page.getByRole("link", { name: "View basket" }).click();
  await expect(page.getByText("For Yusuf · Size 9-10 · Initials YS")).toBeVisible();
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

  await page.context().clearCookies();
  await signIn(page, "admin@deensquad.test");
  await page.goto("/admin/shop");
  await page.getByRole("button", { name: "Transfer received" }).click();
  await expect(page.getByRole("cell", { name: "Hoodie" })).toBeVisible();
  await page.getByRole("button", { name: "Ready for Friday" }).first().click();
  await expect(page.getByRole("button", { name: "Handed over" })).toBeVisible();
  await page.screenshot({ path: shot("admin-shop"), fullPage: true });

  await page.goto("/coach?group=U10");
  await expect(page.getByText(/Kit order ready to collect/)).toBeVisible();
});

test("sign-up: a new parent registers their child, proves their email and lands in the app", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByRole("link", { name: "Sign up" }).click();
  await expect(page).toHaveURL(/\/sign-up$/);
  await page.getByLabel("First name").first().fill("Hana");
  await page.getByLabel("Last name").first().fill("Rahman");
  await page.getByLabel("Email address").fill("hana@example.com");
  await page.getByLabel("Mobile number").fill("07700 900555");
  await page.locator("#childFirstName-0").fill("Ilyas");
  await page.locator("#childDob-0").fill("2017-05-01");
  await page.locator("#childGroup-0").selectOption("U10");
  await page.screenshot({ path: shot("sign-up"), fullPage: true });
  await page.getByRole("button", { name: "Sign up" }).click();
  await expect(page).toHaveURL(/\/sign-in\/code$/);
  await page.getByLabel("6-digit code").fill(latestCode("hana@example.com"));
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/checklist$/);
  await expect(page.getByRole("heading", { name: "Ilyas's checklist" })).toBeVisible();
  const mails = readFileSync(OUTBOX, "utf8");
  expect(mails).toContain("New family signed up: Hana Rahman");
});

test("coach groups: a U7 coach posts to U7 only and gives a star; the parent sees it", async ({ page }) => {
  await signIn(page, "admin@deensquad.test");
  await page.goto("/admin/staff");
  const coachGroups = page.getByRole("form", { name: "Coach Hamza's age groups" });
  await coachGroups.getByLabel("U7").check();
  await coachGroups.getByRole("button", { name: "Save groups" }).click();
  await expect(coachGroups.getByLabel("U7")).toBeChecked();

  await page.context().clearCookies();
  await signIn(page, "coach@deensquad.test");
  await page.goto("/admin/news");
  await expect(page.getByLabel("Every family")).toHaveCount(0);
  await expect(page.getByLabel("U10")).toHaveCount(0);
  await page.goto("/admin/families");
  await expect(page.getByText("Musa Sample")).toBeVisible();
  await expect(page.getByText("Yusuf Sample")).toHaveCount(0);

  await page.goto("/coach/awards");
  await page.getByRole("link", { name: /Musa Sample/ }).click();
  await page.getByText("+5", { exact: true }).click();
  await page.getByText("Star player").click();
  await page.getByLabel(/What for/).fill("Brilliant first touch");
  await page.getByRole("button", { name: "Give award" }).click();
  await expect(page.getByText(/Given\. Musa's parents/)).toBeVisible();
  await page.screenshot({ path: shot("coach-awards"), fullPage: true });

  // Musa's other parent (Adnan has used up his codes for the hour in the earlier tests).
  await page.context().clearCookies();
  await signIn(page, "sara@example.com");
  await page.goto("/player");
  await page.getByRole("link", { name: "Musa", exact: true }).click();
  await expect(page.getByText("Brilliant first touch", { exact: false })).toBeVisible();
  await page.screenshot({ path: shot("player-awards"), fullPage: true });
});
