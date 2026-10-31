import { existsSync } from "node:fs";
import { devices, expect, test } from "@playwright/test";
import { ADMIN_STATE, newContext, shot, signIn, previewAndPost, unfold } from "./helpers";

// Quick answers, replies and messages between parents and the club (migration 0025). Runs after parent-app.spec.ts
// (files run in name order) and uses its saved admin sign-in. Yunus (U7, parent19) is chosen for a message that asks
// for a quick answer and lets parents reply; Nuh's parent (parent16, U7 too) never sees the conversation.

test.describe.configure({ mode: "serial" });

const PHONE = { ...devices["Pixel 7"], viewport: { width: 390, height: 844 }, baseURL: "http://localhost:3100" };
const HEADLINE = "Cup on Sunday: can Yunus play?";
let threadUrl = "";

test("the admin asks one family for a quick answer and lets them reply", async ({ browser }) => {
  test.skip(!existsSync(ADMIN_STATE), "run with parent-app.spec.ts: needs its saved admin sign-in");
  const admin = await newContext(browser, { ...PHONE, storageState: ADMIN_STATE });
  const page = await admin.newPage();
  await page.goto("/admin/news");
  await unfold(page, "post-message");
  await page.getByLabel("Headline").fill(HEADLINE);
  await page.getByLabel("Message", { exact: true }).fill("Kick-off 10am. Tell us by Thursday.");
  await page.getByLabel("Chosen children").check();
  await page.getByLabel("Find a child").fill("yunus");
  await page.getByRole("checkbox", { name: "Choose Yunus V. (U7)" }).check();
  await page.getByLabel(/Let parents reply to you/).check();
  // The answer boxes show only once a quick answer is asked for; they start as Yes and No.
  await expect(page.getByLabel("Answer 1")).toBeHidden();
  await page.getByLabel(/Ask for a quick answer/).check();
  await expect(page.getByLabel("Answer 1")).toHaveValue("Yes");
  await expect(page.getByLabel("Answer 2")).toHaveValue("No");
  await page.getByLabel("Answer 3").fill("Not sure yet");
  await page.screenshot({ path: shot("admin-news-quick-answers"), fullPage: true });
  await previewAndPost(page);
  await expect(page).toHaveURL(/\/admin\/news\/[0-9a-f-]{36}\?posted=1$/);
  await expect(page.getByText("No answer yet (1)")).toBeVisible();
  await expect(page.getByText("No replies yet.", { exact: false })).toBeVisible();
  await admin.close();
});

test("the parent taps Yes, then replies to the admin", async ({ browser }) => {
  test.skip(!existsSync(ADMIN_STATE), "needs the message from the test above");
  const context = await newContext(browser, PHONE);
  const parent = await context.newPage();
  await signIn(parent, "parent19@example.com");
  await parent.goto("/news");
  await expect(parent.getByText(HEADLINE).first()).toBeVisible();
  // One child: plain answer names, no "I've read this" (answering counts as reading it).
  const yes = parent.getByRole("button", { name: "Yes", exact: true });
  await expect(parent.getByRole("button", { name: `I've read this: ${HEADLINE}` })).toHaveCount(0);
  expect((await yes.boundingBox())!.height).toBeGreaterThanOrEqual(48);
  await yes.click();
  await expect(parent.getByRole("button", { name: "Yes", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(parent.getByText("Saved: Yes. The club can see it.")).toBeVisible();
  await parent.reload();
  // Read now, so it's under Earlier, still showing (and able to change) the answer.
  await expect(parent.getByRole("button", { name: "Yes", exact: true })).toHaveAttribute("aria-pressed", "true");
  await parent.screenshot({ path: shot("parent-news-quick-answer"), fullPage: true });

  await parent.getByRole("link", { name: `Reply to Ibrahim: ${HEADLINE}` }).click();
  await expect(parent).toHaveURL(/\/messages\/new\?about=/);
  await expect(parent.getByRole("heading", { name: "Reply to Ibrahim" })).toBeVisible();
  // Nothing typed: refused, nothing sent.
  await parent.getByRole("button", { name: "Send to Ibrahim" }).click();
  await expect(parent.getByRole("alert").filter({ hasText: "Write your message." })).toBeVisible();
  await parent.getByLabel("Your message").fill("Yes, he can play. Can he bring his brother to watch?");
  await parent.getByRole("button", { name: "Send to Ibrahim" }).click();
  await expect(parent).toHaveURL(/\/messages\/[0-9a-f-]{36}\?sent=1$/);
  threadUrl = new URL(parent.url()).pathname;
  await expect(parent.getByText("Can he bring his brother to watch?")).toBeVisible();
  await expect(parent.getByText("You", { exact: true })).toBeVisible();
  await parent.screenshot({ path: shot("parent-message-thread"), fullPage: true });
  await context.close();
});

test("the admin sees the answer and the unread reply, and replies back", async ({ browser }) => {
  test.skip(!existsSync(ADMIN_STATE) || !threadUrl, "needs the reply from the test above");
  const admin = await newContext(browser, { ...PHONE, storageState: ADMIN_STATE });
  const page = await admin.newPage();
  await page.goto("/admin/news");
  await unfold(page, "post-message");
  await page.getByRole("link", { name: new RegExp(HEADLINE) }).click();
  const answers = page.getByRole("listitem");
  await expect(answers.filter({ hasText: "Yes (1)" })).toContainText("Yunus V.");
  await expect(answers.filter({ hasText: "No (0)" })).toHaveCount(1);
  await expect(answers.filter({ hasText: "No answer yet (0)" })).toHaveCount(1);
  await expect(page.getByText("1 conversation with families about this message.")).toBeVisible();

  const nav = page.getByRole("navigation", { name: "Club admin" });
  await expect(nav.getByRole("link", { name: "Messages, 1 unread" })).toBeVisible();
  await nav.getByRole("link", { name: "Messages, 1 unread" }).click();
  await expect(page).toHaveURL(/\/admin\/messages$/);
  const row = page.getByRole("link", { name: new RegExp(`Re: ${HEADLINE}`) });
  await expect(row).toContainText("Unread");
  await expect(row).toContainText("Yunus V");
  await page.screenshot({ path: shot("admin-messages-inbox"), fullPage: true });
  await row.click();
  await expect(page).toHaveURL(/\/admin\/messages\/[0-9a-f-]{36}$/);
  await expect(page.getByText("Can he bring his brother to watch?")).toBeVisible();
  await expect(page.getByRole("link", { name: "Yunus V" })).toHaveAttribute("href", /\/admin\/families\/[0-9a-f-]{36}$/);
  await page.getByLabel("Reply to Yunus's parents").fill("Of course, see you Sunday.");
  await page.getByRole("button", { name: "Send reply" }).click();
  await expect(page.getByText("Of course, see you Sunday.")).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "Sent." })).toBeVisible();
  // Opened and answered: nothing unread any more.
  await page.goto("/admin/messages");
  await expect(nav.getByRole("link", { name: "Messages", exact: true })).toBeVisible();
  await expect(page.getByText("Nothing waiting for a reply.")).toBeVisible();
  await admin.close();
});

test("the parent sees the reply on News and in Messages; another parent can't open the thread", async ({ browser }) => {
  test.skip(!threadUrl, "needs the thread from the tests above");
  const context = await newContext(browser, PHONE);
  const parent = await context.newPage();
  await signIn(parent, "parent19@example.com");
  await parent.goto("/news");
  const row = parent.getByRole("link", { name: /1 new message from the club/ });
  await expect(row).toBeVisible();
  await row.click();
  await expect(parent).toHaveURL(/\/messages(\?|$)/);
  await parent.getByRole("link", { name: new RegExp(`Re: ${HEADLINE}`) }).click();
  await expect(parent).toHaveURL(/\/messages\/[0-9a-f-]{36}$/);
  await expect(parent.getByText("Of course, see you Sunday.")).toBeVisible();
  await expect(parent.getByText("Coach", { exact: true })).toBeVisible();
  await parent.goto("/news");
  await expect(parent.getByRole("link", { name: /new message from the club/ })).toHaveCount(0);

  // Not coming, with an optional reason for the coaches (sent as a message; changeable).
  await parent.goto("/friday");
  await parent.getByRole("button", { name: "Not coming: Yunus isn't coming" }).click();
  await expect(parent.getByText("Saved. Coach knows Yunus isn't coming.")).toBeVisible();
  await parent.getByLabel(/Tell the coaches why\?/).fill("Poorly");
  await parent.getByRole("button", { name: "Send the reason for Yunus to the coaches" }).click();
  await expect(parent.getByRole("status").filter({ hasText: "Sent to the coaches: Poorly" })).toBeVisible();
  await parent.getByRole("button", { name: "Change the reason for Yunus" }).click();
  await expect(parent.getByLabel(/Tell the coaches why\?/)).toHaveValue("Poorly");
  await parent.getByLabel(/Tell the coaches why\?/).fill("Poorly, back next week");
  await parent.getByRole("button", { name: "Send the reason for Yunus to the coaches" }).click();
  await expect(parent.getByRole("status").filter({ hasText: "Sent to the coaches: Poorly, back next week" })).toBeVisible();
  await parent.screenshot({ path: shot("friday-away-reason"), fullPage: true });
  await parent.reload();
  await expect(parent.getByText("Poorly, back next week")).toBeVisible();
  await context.close();

  const other = await newContext(browser, PHONE);
  const nuh = await other.newPage();
  await signIn(nuh, "parent16@example.com");
  const response = await nuh.goto(threadUrl);
  expect(response?.status()).toBe(404);
  await nuh.goto("/messages");
  await expect(nuh.getByText("No messages yet.", { exact: false })).toBeVisible();
  await other.close();
});

test("the coaches get the reason as a message and see it on the register", async ({ browser }) => {
  test.skip(!existsSync(ADMIN_STATE) || !threadUrl, "needs the tests above");
  const admin = await newContext(browser, { ...PHONE, storageState: ADMIN_STATE });
  const page = await admin.newPage();
  await page.goto("/admin/messages");
  // A reason for not coming isn't a message waiting for a reply: it's under Not coming, not in the badge.
  const nav = page.getByRole("navigation", { name: "Club admin" });
  await expect(nav.getByRole("link", { name: "Messages", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Not coming (1 new)" }).click();
  const row = page.getByRole("link", { name: /Not coming: / });
  await expect(row).toContainText("Yunus V");
  await row.click();
  await expect(page.getByText("Poorly", { exact: true })).toBeVisible();
  await expect(page.getByText("Poorly, back next week", { exact: true })).toBeVisible();
  await page.goto("/coach?group=U7");
  const away = page.getByRole("region", { name: /Said not coming/ });
  await expect(away.getByText("Reason: Poorly, back next week")).toBeVisible();
  await admin.close();
});
