import { existsSync } from "node:fs";
import { devices, expect, test, type Page } from "@playwright/test";
import { ADMIN_STATE, GATE_PARENT_STATE, YOUR_DATA_PARENT_STATE, newContext, shot, unfold } from "./helpers";

// YouTube videos on practice sheets, and a child's photo for the coaches. Uses the family that signed itself up in
// parent-your-data.spec.ts (Maryam Haddad: Layla in U10, Zaid in U7) and the admin sign-in saved by parent-app.spec.ts;
// files run in name order, so both are there. Nothing is ever fetched from YouTube: every request to it is answered here.

test.describe.configure({ mode: "serial" });

const PHONE = { ...devices["Pixel 7"], viewport: { width: 390, height: 844 }, baseURL: "http://localhost:3100" };
const VIDEO = "dQw4w9WgXcQ";

const londonToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date());
const londonDay = () => new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", weekday: "short", day: "numeric", month: "short" }).format(new Date());

/** Answers YouTube's thumbnail and player requests with nothing, and counts them. */
async function standInYouTube(page: Page): Promise<string[]> {
  const seen: string[] = [];
  await page.context().route(/^https:\/\/(i\.ytimg\.com|www\.youtube-nocookie\.com|www\.youtube\.com)\//, (route) => {
    seen.push(route.request().url());
    return route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><title>Stand-in</title>" });
  });
  return seen;
}

test("a coach adds a practice sheet with a youtu.be link; the parent taps Watch video and gets the privacy-enhanced player", async ({ browser }) => {
  test.skip(!existsSync(ADMIN_STATE) || !existsSync(YOUR_DATA_PARENT_STATE), "run with parent-app.spec.ts and parent-your-data.spec.ts");
  const staffContext = await newContext(browser, { ...PHONE, storageState: ADMIN_STATE });
  const staff = await staffContext.newPage();
  await staff.goto("/coach/practice");
  await staff.getByLabel("Title").fill("Toe taps");
  await staff.getByLabel("U7", { exact: true }).check();
  // Only YouTube links.
  await staff.getByLabel("YouTube video link").fill("https://youtube.com.evil.com/watch?v=" + VIDEO);
  await staff.getByRole("button", { name: "Share with parents" }).click();
  await expect(staff.getByRole("alert").filter({ hasText: "YouTube" })).toHaveText("Paste a YouTube link (youtube.com or youtu.be).");
  await expect(staff.getByLabel("Title")).toHaveValue("Toe taps");
  await staff.getByLabel("YouTube video link").fill(`https://youtu.be/${VIDEO}?si=share&t=5`);
  await staff.getByRole("button", { name: "Share with parents" }).click();
  await expect(staff.getByRole("status").filter({ hasText: "Shared." })).toHaveText("Shared. Parents in those groups can see it now.");
  const card = staff.locator("div").filter({ has: staff.getByRole("heading", { name: "Toe taps" }) }).last();
  await expect(card.getByText("Video", { exact: true })).toBeVisible();
  await staffContext.close();

  const context = await newContext(browser, { ...PHONE, storageState: YOUR_DATA_PARENT_STATE });
  const page = await context.newPage();
  const youtube = await standInYouTube(page);
  await page.goto("/practice");
  const watch = page.getByRole("link", { name: "Watch video: Toe taps" });
  await expect(watch).toBeVisible();
  // Before the tap: a link to YouTube (what works without JavaScript), only the thumbnail loaded, no player.
  await expect(watch).toHaveAttribute("href", `https://www.youtube.com/watch?v=${VIDEO}&t=5`);
  expect((await watch.boundingBox())!.height).toBeGreaterThanOrEqual(48);
  await expect(page.locator("iframe")).toHaveCount(0);
  expect(youtube.filter((u) => !u.startsWith("https://i.ytimg.com/"))).toEqual([]);
  await expect(page.getByRole("link", { name: "Open in YouTube" }).first()).toHaveAttribute("target", "_blank");
  await page.screenshot({ path: shot("practice-video"), fullPage: true });

  await watch.click();
  const player = page.locator('iframe[title="Practice video"]');
  await expect(player).toHaveAttribute("src", `https://www.youtube-nocookie.com/embed/${VIDEO}?rel=0&autoplay=1&start=5`);
  await expect(player).toHaveAttribute("allowfullscreen", "");
  await expect(page).toHaveURL(/\/practice$/);

  // Friday's latest practice sheet carries it too.
  await page.goto("/friday");
  await expect(page.getByRole("link", { name: "Watch video: Toe taps" })).toBeVisible();
  await context.close();
});

test("a parent with photo consent adds a photo; the coach's register shows it; consent off deletes it", async ({ browser }) => {
  test.setTimeout(90_000);
  test.skip(!existsSync(ADMIN_STATE) || !existsSync(YOUR_DATA_PARENT_STATE), "run with parent-app.spec.ts and parent-your-data.spec.ts");
  const context = await newContext(browser, { ...PHONE, storageState: YOUR_DATA_PARENT_STATE });
  const page = await context.newPage();
  await page.goto("/player");
  await page.getByRole("region", { name: "Your family" }).getByRole("link", { name: "Layla's details" }).click();
  await expect(page).toHaveURL(/\/player\/child\/[0-9a-f-]{36}$/);
  const childUrl = page.url();
  const layla = childUrl.split("/").at(-1)!;

  // Without photo consent, no upload: a link to the consent page instead.
  const card = page.locator("div").filter({ has: page.getByRole("heading", { name: "Photo for the coaches" }) }).last();
  await expect(card.getByText("Only the club's coaches see this, to learn names.", { exact: false })).toBeVisible();
  const turnOn = card.getByRole("link", { name: "Turn on photo consent to add a photo" });
  if (await turnOn.isVisible()) {
    await expect(card.getByLabel(/Add photo|Change photo/)).toHaveCount(0);
    await turnOn.click();
    await expect(page.getByText("A photo you've added for the coaches is deleted.")).toBeVisible();
    await page.getByText("Yes, photos are fine").click();
    await page.getByRole("button", { name: "Save answer" }).click();
    await expect(page).toHaveURL(/\/checklist/);
    await page.goto(childUrl);
  }

  // A big photo, made in the page, is shrunk to a 512px JPEG before it's sent.
  const png = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 1600;
    canvas.height = 1200;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#2f7d32";
    ctx.fillRect(0, 0, 1600, 1200);
    ctx.fillStyle = "#f5c518";
    ctx.beginPath();
    ctx.arc(800, 600, 400, 0, Math.PI * 2);
    ctx.fill();
    return canvas.toDataURL("image/png").split(",")[1];
  });
  await page.getByLabel("Add photo").setInputFiles({ name: "layla.png", mimeType: "image/png", buffer: Buffer.from(png, "base64") });
  await expect(page.locator("main").getByRole("status")).toHaveText("Photo saved. The coaches will see it on the register.");
  const photo = page.locator('main img[src^="/api/files/"]');
  await expect(photo).toBeVisible();
  const src = (await photo.getAttribute("src"))!;
  const file = await page.request.get(src);
  expect(file.status()).toBe(200);
  expect(file.headers()["content-type"]).toBe("image/jpeg");
  expect(file.headers()["cache-control"]).toBe("private, max-age=31536000, immutable");
  const width = await photo.evaluate((img: HTMLImageElement) => img.naturalWidth);
  expect(width).toBe(512);
  await expect(page.getByLabel("Change photo")).toBeVisible();
  await expect(page.getByRole("button", { name: "Remove photo of Layla" })).toBeVisible();
  await page.screenshot({ path: shot("player-child-photo"), fullPage: true });

  // Another family can't open it.
  if (existsSync(GATE_PARENT_STATE)) {
    const otherContext = await newContext(browser, { ...PHONE, storageState: GATE_PARENT_STATE });
    expect((await otherContext.request.get(`http://localhost:3100${src}`)).status()).toBe(404);
    await otherContext.close();
  }

  // The coach sees Layla's face on the register, and on her Families page.
  const staffContext = await newContext(browser, { ...PHONE, storageState: ADMIN_STATE });
  const staff = await staffContext.newPage();
  await staff.goto("/admin/sessions");
  await unfold(staff, "add-sessions");
  await staff.getByLabel("Title").fill("Photo gate");
  await staff.getByLabel("Date", { exact: true }).fill(londonToday());
  await staff.getByLabel("Starts").fill("00:00");
  await staff.getByLabel("Finishes").fill("23:59");
  for (const g of ["U6", "U7", "U12", "U15"]) await staff.getByLabel(g, { exact: true }).uncheck();
  await staff.getByRole("button", { name: "Add sessions" }).click();
  await expect(staff.getByText(/^Added 1 session\./)).toBeVisible();
  const session = (await staff.getByRole("link", { name: `Edit Photo gate ${londonDay()}` }).getAttribute("href"))!.split("/")[3];
  await staff.goto(`/coach?session=${session}&group=U10`);
  const row = staff.getByRole("region", { name: /^Not here yet/ }).getByRole("listitem").filter({ hasText: "Layla H." });
  await expect(row.locator(`img[src="${src}"]`)).toBeVisible();
  await expect(row.locator("img")).toHaveAttribute("alt", "");
  expect((await row.locator("img").boundingBox())!.width).toBe(40);
  await staff.screenshot({ path: shot("coach-register-photo") });
  await staff.goto(`/admin/families/${layla}`);
  await expect(staff.locator(`img[src="${src}"]`)).toBeVisible();
  await expect(staff.getByText(/^Added by the parent on \d{1,2} \w{3}$/)).toBeVisible();
  await staff.goto("/admin/sessions");
  await staff.getByRole("link", { name: `Delete Photo gate ${londonDay()}` }).click();
  await staff.getByRole("button", { name: "Delete session" }).click();
  await expect(staff.getByText("Deleted.")).toBeVisible();
  await staffContext.close();

  // Photo consent off: the photo goes, and the file with it.
  await page.goto(`/checklist/consent?child=${layla}`);
  await page.getByText("No photos, please").click();
  await page.getByRole("button", { name: "Save answer" }).click();
  await expect(page).toHaveURL(/\/checklist/);
  await page.goto(childUrl);
  await expect(page.getByRole("link", { name: "Turn on photo consent to add a photo" })).toBeVisible();
  await expect(page.locator('main img[src^="/api/files/"]')).toHaveCount(0);
  expect((await page.request.get(src)).status()).toBe(404);
  await context.close();
});
