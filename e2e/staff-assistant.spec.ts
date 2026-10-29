import { existsSync } from "node:fs";
import { devices, expect, test } from "@playwright/test";
import { ADMIN_STATE, COACH_STATE, newContext, shot } from "./helpers";

// The admins' assistant (src/lib/assistant), with the stand-in Claude in e2e/fake-claude.mjs: a question answered
// from the app's own Families data, and sessions drafted, then added only on Confirm. Runs after parent-app.spec.ts
// (its saved admin and coach sign-ins). The drafted session is three weeks ahead at 5pm for U7, which no other spec uses.

test.describe.configure({ mode: "serial" });

const PHONE = { ...devices["Pixel 7"], viewport: { width: 390, height: 844 }, baseURL: "http://localhost:3100" };

test("an admin asks who has no payment plan, then has the assistant draft a session and confirms it", async ({ browser }) => {
  test.skip(!existsSync(ADMIN_STATE) || !existsSync(COACH_STATE), "run with parent-app.spec.ts: needs its saved sign-ins");
  const admin = await newContext(browser, { ...PHONE, storageState: ADMIN_STATE });
  const page = await admin.newPage();
  await page.goto("/admin");
  await page.getByRole("link", { name: "Ask the assistant" }).click();
  await expect(page.getByRole("heading", { name: "Assistant", level: 1 })).toBeVisible();

  await page.getByRole("button", { name: "Which children have no payment plan?" }).click();
  const conversation = page.getByRole("list", { name: "Conversation" });
  await expect(conversation.getByText(/^\d+ children have no payment plan:/)).toBeVisible();
  const link = conversation.getByRole("link", { name: "See them on Families" });
  await expect(link).toHaveAttribute("href", "/admin/families?need=payment");

  await page.getByLabel("Ask about the club").fill("Add U7 training in three weeks at 5pm");
  await page.getByRole("button", { name: "Send" }).click();
  const card = page.getByRole("region", { name: /^Draft: Add 1 session: Assistant training for U7/ });
  await expect(card).toBeVisible();
  await expect(conversation.getByText("I've drafted that. Check the card and tap Confirm.")).toBeVisible();
  await page.screenshot({ path: shot("admin-assistant"), fullPage: true });

  // Nothing added yet.
  await page.goto("/admin/sessions?all=1");
  await expect(page.getByText("Assistant training")).toHaveCount(0);
  await page.goBack();
  await page.getByLabel("Ask about the club").fill("Add U7 training in three weeks at 5pm");
  await page.getByRole("button", { name: "Send" }).click();
  await page.getByRole("button", { name: /^Confirm: Add 1 session: Assistant training/ }).click();
  await expect(page.getByRole("status").filter({ hasText: /^Added 1 session/ })).toBeVisible();
  await page.goto("/admin/sessions?all=1");
  await expect(page.getByText("Assistant training").first()).toBeVisible();
  await admin.close();

  // Coaches don't get it.
  const coach = await newContext(browser, { ...PHONE, storageState: COACH_STATE });
  const c = await coach.newPage();
  await c.goto("/admin");
  await expect(c.getByRole("link", { name: "Ask the assistant" })).toHaveCount(0);
  const res = await c.request.post("/api/admin/assistant", { data: { message: "Who owes money?" } });
  expect(res.status()).toBe(403);
  await coach.close();
});
