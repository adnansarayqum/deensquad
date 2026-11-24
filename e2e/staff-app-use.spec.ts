import { existsSync } from "node:fs";
import { devices, expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { ADMIN_STATE, OUTBOX, newContext, signIn } from "./helpers";

// App use and Seen (migration 0055): a parent opens Home and has the club's posts on screen without tapping; the
// admin sees them counted as seen, not read, and the parent among today's openers. Runs after parent-app.spec.ts
// (its saved admin sign-in). parent11 (Sulaiman W., U10) is used by no other spec.

const PHONE = { ...devices["Pixel 7"], viewport: { width: 390, height: 844 }, baseURL: "http://localhost:3100" };

test("a parent sees a post without tapping; the admin sees it as seen, not read, and the parent on App use", async ({ browser }) => {
  test.skip(!existsSync(ADMIN_STATE), "run with parent-app.spec.ts: needs its saved admin sign-in");
  const parent = await newContext(browser, PHONE);
  const page = await parent.newPage();
  // Every post the page reports as seen (the tracker sends them in small batches as headlines come on screen).
  const reported: string[] = [];
  page.on("request", (r) => {
    if (r.url().endsWith("/api/news/seen")) reported.push(r.postData() ?? "");
  });
  const opened = page.waitForResponse((r) => r.url().endsWith("/api/app-use") && r.status() === 204, { timeout: 15_000 });
  await signIn(page, "parent11@example.com");
  await expect(page.getByRole("heading", { name: "Winter timings start 7 Nov" })).toBeVisible();
  const heading = page.getByRole("heading", { name: "Winter timings start 7 Nov" });
  await heading.scrollIntoViewIfNeeded();
  const id = (await heading.getAttribute("data-seen"))!;
  await expect.poll(() => reported.some((body) => body.includes(id)), { timeout: 15_000 }).toBe(true);
  await opened;
  // Let the server finish writing before the parent's window closes.
  await page.waitForTimeout(500);
  // The tap is still asked for, with why.
  await expect(page.getByText("Tap so the club knows you've seen it. We'll stop reminding you.").first()).toBeVisible();
  await parent.close();

  const admin = await newContext(browser, { ...PHONE, storageState: ADMIN_STATE });
  const a = await admin.newPage();
  await a.goto("/admin/app-use");
  await expect(a.getByRole("heading", { name: "App use", level: 1 })).toBeVisible();
  await expect(a.getByText(/of \d+ parents opened it/).first()).toBeVisible();
  const today = Number(await a.locator("li", { hasText: "Today" }).locator(".font-display").innerText());
  expect(today).toBeGreaterThanOrEqual(1);
  await a.getByRole("link", { name: "Winter timings start 7 Nov" }).click();
  await expect(a.getByText(/have seen it/)).toBeVisible();
  await expect(a.locator("li", { hasText: "Parent W" }).getByText(/seen .*, not tapped/)).toBeVisible();
  // "Mark as read" from a notification is a parent's: the admin (not a parent) is refused.
  const res = await a.request.post("/api/news/read", { data: { id: "00000000-0000-4000-8000-000000000000" } });
  expect(res.status()).toBe(401);

  // The reminder email's button: a page that needs one tap and no sign-in, so a parent who reads the post in the
  // email is counted. "Send a reminder now" emails the parents a notification can't reach (no push keys in tests).
  await a.getByRole("button", { name: /^Send a reminder now to the \d+ parents? who haven't read Winter timings start 7 Nov/ }).click();
  await expect(a.getByText(/^(Reminder sent|Nobody new to remind)/)).toBeVisible();
  const mails = readFileSync(OUTBOX, "utf8").trim().split("\n").map((l) => JSON.parse(l) as { to: string; subject: string; text: string });
  const mail = mails.filter((m) => m.subject === "Please read: Winter timings start 7 Nov" && m.text.includes("/read/")).at(-1);
  expect(mail, "a reminder email with the one-tap link").toBeTruthy();
  const link = mail!.text.match(/https?:\/\/\S+\/read\/\S+/)![0];
  const visitor = await newContext(browser, PHONE);
  const v = await visitor.newPage();
  await v.goto(new URL(link).pathname);
  await expect(v.getByRole("heading", { name: "Let the club know" })).toBeVisible();
  await v.getByRole("button", { name: "I've read this" }).click();
  await expect(v.getByRole("heading", { name: "Thank you" })).toBeVisible();
  // A made-up link shows nothing of anyone's.
  await v.goto("/read/00000000-0000-4000-8000-000000000000.00000000-0000-4000-8000-000000000000.nope");
  await expect(v.getByRole("heading", { name: "This link has stopped working" })).toBeVisible();
  await visitor.close();
  await a.reload();
  await expect(a.getByText("from the email").first()).toBeVisible();
  await admin.close();
});
