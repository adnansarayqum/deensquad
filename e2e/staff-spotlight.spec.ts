import { existsSync } from "node:fs";
import { devices, expect, test } from "@playwright/test";
import { ADMIN_STATE, newContext, signIn } from "./helpers";

// Player of the week (src/lib/spotlight): an admin picks a U10 with a line about them; the child's parent sees the
// card on Family with Share and can fetch the picture; another family can't; then it's taken back, so later specs see
// Family as before. Runs after parent-app.spec.ts (its saved admin sign-in). parent12 (Adam F., U10) and parent13
// are used by no other spec.

const PHONE = { ...devices["Pixel 7"], viewport: { width: 390, height: 844 }, baseURL: "http://localhost:3100" };

test("an admin makes Adam Player of the week; his parent gets the card to share; another family can't open it", async ({ browser }) => {
  test.skip(!existsSync(ADMIN_STATE), "run with parent-app.spec.ts: needs its saved admin sign-in");
  const admin = await newContext(browser, { ...PHONE, storageState: ADMIN_STATE });
  const page = await admin.newPage();
  await page.goto("/coach/awards?group=U10");
  await page.getByRole("link", { name: /Adam F/ }).first().click();
  await expect(page.getByRole("heading", { name: "Player of the week" })).toBeVisible();
  // It needs the coach's words.
  await page.getByRole("button", { name: "Make Adam the U10 Player of the week" }).click();
  await expect(page.getByText("Write a line about why. Parents see it on the card.")).toBeVisible();
  await page.getByLabel(/Why Adam/).fill("Kept going all session and cheered his team on.");
  await page.getByRole("button", { name: "Make Adam the U10 Player of the week" }).click();
  await expect(page.getByText("Saved. Adam's parents are told, and get a card to share.")).toBeVisible();
  await expect(page.getByText("Adam is this week's Player of the week.")).toBeVisible();
  const cardPath = (await page.getByRole("link", { name: "See the card" }).getAttribute("href"))!;
  const card = await page.request.get(cardPath);
  expect(card.status()).toBe(200);
  expect(card.headers()["content-type"]).toBe("image/png");
  expect(card.headers()["cache-control"]).toContain("no-store");

  const family = await newContext(browser, PHONE);
  const parent = await family.newPage();
  await signIn(parent, "parent12@example.com");
  await parent.goto("/player");
  await expect(parent.getByRole("heading", { name: "Player of the week" })).toBeVisible();
  await expect(parent.getByRole("img", { name: /Player of the week card: Adam, U10s, week of .*Kept going all session/ })).toBeVisible();
  await expect(parent.getByRole("button", { name: "Share Adam's Player of the week card" })).toBeVisible();
  const saved = await parent.request.get(`${cardPath}?download=1`);
  expect(saved.headers()["content-disposition"]).toMatch(/^attachment; filename="player-of-the-week-\d{4}-\d\d-\d\d\.png"$/);
  await family.close();

  const others = await newContext(browser, PHONE);
  const other = await others.newPage();
  await signIn(other, "parent13@example.com");
  expect((await other.request.get(cardPath)).status()).toBe(404);
  await other.goto("/player");
  await expect(other.getByRole("heading", { name: "Player of the week" })).toHaveCount(0);
  await others.close();

  // Taken back: the card is gone for everyone.
  await page.getByLabel("Yes, take it back").check();
  await page.getByRole("button", { name: "Take Player of the week back from Adam" }).click();
  await expect(page.getByText("Adam is this week's Player of the week.")).toHaveCount(0);
  expect((await page.request.get(cardPath)).status()).toBe(404);
  await admin.close();
});
