import { expect, test } from "@playwright/test";

// Walks through every parent and coach flow in demo mode. Screenshots land in e2e/.results/screens
// (git-ignored) so a reviewer can compare them with the design canvas.

const shot = (name: string) => `e2e/.results/screens/${name}.png`;

test.beforeEach(async ({ context }) => {
  await context.clearCookies();
});

test("club news: a parent acknowledges the kit message", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/news$/);
  await expect(page.getByRole("heading", { name: "Club news" })).toBeVisible();
  await expect(page.getByRole("main").getByText("1 unread")).toBeVisible();
  await page.screenshot({ path: shot("news"), fullPage: true });

  await page.getByRole("button", { name: "I've read this" }).click();
  await expect(page.getByText("You're all caught up")).toBeVisible();
  await expect(page.getByRole("main").getByText("1 unread")).toHaveCount(0);
  await page.screenshot({ path: shot("news-after-read"), fullPage: true });
});

test("friday: answering availability updates the headcount and the news header", async ({ page }) => {
  await page.goto("/friday");
  await expect(page.getByRole("heading", { name: "Is Yusuf coming?" })).toBeVisible();
  await expect(page.getByText("16", { exact: true })).toBeVisible();
  await page.screenshot({ path: shot("friday"), fullPage: true });

  await page.getByRole("button", { name: "Coming" }).click();
  await expect(page.getByText("Saved. Coach can see Yusuf is coming.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Coming" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("17", { exact: true })).toBeVisible();
  await page.screenshot({ path: shot("friday-coming"), fullPage: true });

  await page.getByRole("link", { name: "News" }).click();
  await expect(page.getByText(/Yusuf is coming/)).toBeVisible();
});

test("checklist: photo consent and payments complete the setup", async ({ page }) => {
  await page.goto("/checklist");
  await expect(page.getByRole("progressbar", { name: "3 of 5 steps done" })).toBeVisible();
  await page.screenshot({ path: shot("checklist"), fullPage: true });

  await page.getByRole("link", { name: /Photo consent/ }).click();
  await expect(page.getByRole("heading", { name: "Photo consent" })).toBeVisible();
  await page.screenshot({ path: shot("consent"), fullPage: true });
  await page.getByText("No photos, please").click();
  await page.getByRole("button", { name: "Save answer" }).click();
  await expect(page).toHaveURL(/\/checklist$/);
  await expect(page.getByText("No photos, faces blurred")).toBeVisible();

  await page.getByRole("link", { name: /Set up payments/ }).click();
  await page.screenshot({ path: shot("payment"), fullPage: true });
  await page.getByRole("button", { name: "I've set it up" }).click();
  await expect(page).toHaveURL(/\/checklist$/);
  await expect(page.getByText("All done. Yusuf is fully set up.")).toBeVisible();
  await page.screenshot({ path: shot("checklist-done"), fullPage: true });
});

test("player profile shows progress and links to the coach view", async ({ page }) => {
  await page.goto("/player");
  await expect(page.getByRole("heading", { name: "Yusuf S." })).toBeVisible();
  await expect(page.getByText("This week's challenge")).toBeVisible();
  await page.screenshot({ path: shot("player"), fullPage: true });
});

test("coach register: marking a player here moves them across", async ({ page }) => {
  await page.goto("/coach");
  await expect(page.getByRole("heading", { name: "Friday register" })).toBeVisible();
  await expect(page.getByRole("progressbar", { name: "15 of 17 here" })).toBeVisible();
  await page.screenshot({ path: shot("coach"), fullPage: true });

  await page.getByRole("button", { name: "Mark Zayd A. here" }).click();
  await expect(page.getByRole("progressbar", { name: "16 of 17 here" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Mark Zayd A. here" })).toHaveCount(0);
});

test("reset demo clears a family's taps", async ({ page }) => {
  await page.goto("/news");
  await page.getByRole("button", { name: "I've read this" }).click();
  await expect(page.getByText("You're all caught up")).toBeVisible();
  await page.goto("/player");
  await page.getByRole("button", { name: "Reset demo" }).click();
  await expect(page).toHaveURL(/\/news$/);
  await expect(page.getByRole("main").getByText("1 unread")).toBeVisible();
});

test("the PWA manifest is served", async ({ request }) => {
  const res = await request.get("/manifest.webmanifest");
  expect(res.ok()).toBe(true);
  const manifest = await res.json();
  expect(manifest.short_name).toBe("Deen Squad");
  expect(manifest.icons).toHaveLength(3);
});
