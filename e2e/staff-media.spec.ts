import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { devices, expect, test, type Page } from "@playwright/test";
import sharp from "sharp";
import { ADMIN_STATE, newContext, shot, signIn, unfold } from "./helpers";

// Photos and videos (src/lib/media): staff add them to news, a session's details and their messages; the parent the
// news is for sees them and opens them full screen; another family can't open them even with the address. Runs
// after parent-app.spec.ts (its saved admin sign-in). Ibrahim M. (parent14, U10) is otherwise used only by
// staff-gap-features.spec.ts, which runs before this. The news is for him alone and asks for no tap, so no other
// spec's counts change.

test.describe.configure({ mode: "serial" });

const PHONE = { ...devices["Pixel 7"], viewport: { width: 390, height: 844 }, baseURL: "http://localhost:3100" };
const PARENT = "parent14@example.com";
const HEADLINE = "Photos from Saturday's match";

async function files(info: { outputPath: (name: string) => string }) {
  const photo = info.outputPath("match.jpg");
  await sharp({ create: { width: 1600, height: 1200, channels: 3, background: "#2f7d3a" } }).jpeg().toFile(photo);
  const video = info.outputPath("goal.mp4");
  execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "testsrc=size=320x240:rate=10:duration=2", "-pix_fmt", "yuv420p", "-c:v", "libx264", video]);
  return { photo, video };
}

const hasFfmpeg = (() => {
  try {
    execFileSync("ffmpeg", ["-version"]);
    return true;
  } catch {
    return false;
  }
})();

/** The picture is on screen and has actually loaded (not a broken image). `name`: the picture's, or a link around it. */
async function loaded(page: Page, name: string | RegExp, inLink = false) {
  const img = inLink ? page.getByRole("link", { name }).locator("img") : page.getByRole("img", { name });
  await expect(img).toBeVisible();
  await expect.poll(() => img.evaluate((el) => (el as HTMLImageElement).complete && (el as HTMLImageElement).naturalWidth > 0)).toBe(true);
}

test("news with a photo and a video: the parent sees both and opens them full screen; another family can't", async ({ browser }, info) => {
  test.skip(!existsSync(ADMIN_STATE) || !hasFfmpeg, "needs parent-app.spec.ts's admin sign-in and ffmpeg");
  const { photo, video } = await files(info);
  const admin = await newContext(browser, { ...PHONE, storageState: ADMIN_STATE });
  const page = await admin.newPage();
  await page.goto("/admin/news");
  await unfold(page, "post-message");
  await page.getByLabel("Headline").fill(HEADLINE);
  await page.getByLabel("Message", { exact: true }).fill("Well played everyone. A few from the touchline.");
  await page.getByLabel("Add photos or videos").setInputFiles([photo, video]);
  await expect(page.locator('input[type="hidden"][name="media"]')).toHaveCount(2, { timeout: 60_000 });
  await expect(page.getByRole("button", { name: "Remove video 2" })).toBeVisible();
  await page.getByLabel("Chosen children").check();
  await page.getByLabel("Find a child").fill("ibrahim");
  await page.getByRole("checkbox", { name: "Choose Ibrahim M. (U10)" }).check();
  await page.getByRole("checkbox", { name: /Ask parents to tap/ }).uncheck();
  await page.screenshot({ path: shot("admin-news-media"), fullPage: true });
  await page.getByRole("button", { name: "Preview" }).click();
  await expect(page.getByRole("link", { name: `${HEADLINE}: photo 1 of 2` })).toBeVisible();
  await page.getByRole("button", { name: "Post to parents" }).click();
  await expect(page).toHaveURL(/\/admin\/news\/[0-9a-f-]{36}\?posted=1$/);
  await expect(page.getByRole("link", { name: `${HEADLINE}: video 2 of 2` })).toBeVisible();
  const photoUrl = await page.getByRole("link", { name: `${HEADLINE}: photo 1 of 2` }).getAttribute("href");
  expect(photoUrl).toMatch(/^\/api\/media\/[0-9a-f-]{36}$/);
  await admin.close();

  const parent = await newContext(browser, PHONE);
  const p = await parent.newPage();
  await signIn(p, PARENT);
  await p.goto("/news");
  await expect(p.getByRole("heading", { name: HEADLINE })).toBeVisible();
  const tile = p.getByRole("link", { name: `${HEADLINE}: photo 1 of 2` });
  await tile.scrollIntoViewIfNeeded();
  await loaded(p, `${HEADLINE}: photo 1 of 2`, true);
  await p.screenshot({ path: shot("parent-news-media"), fullPage: true });
  await tile.click();
  const viewer = p.getByRole("dialog", { name: HEADLINE });
  await expect(viewer).toBeVisible();
  await expect(viewer.getByText("1 of 2")).toBeVisible();
  await loaded(p, `${HEADLINE}: photo 1 of 2`);
  await p.screenshot({ path: shot("parent-media-viewer") });
  await viewer.getByRole("button", { name: "Next" }).click();
  await expect(viewer.getByText("2 of 2")).toBeVisible();
  const player = viewer.locator("video");
  await expect(player).toHaveAttribute("aria-label", `${HEADLINE}: video 2 of 2`);
  await expect(player).toHaveAttribute("poster", /\?poster=1$/);
  // Playwright's own Chromium has no H.264 decoder (Chrome, Safari and phones do), so only play it where it can.
  if (await player.evaluate((v) => (v as HTMLVideoElement).canPlayType('video/mp4; codecs="avc1.42E01E"') !== "")) {
    await expect.poll(() => player.evaluate((v) => (v as HTMLVideoElement).readyState), { timeout: 15_000 }).toBeGreaterThan(0);
  }
  await viewer.getByRole("button", { name: "Close" }).click();
  await expect(viewer).toBeHidden();
  // The file itself: a cleaned JPEG, kept private to this person's browser.
  const res = await p.request.get(photoUrl!);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toBe("image/jpeg");
  // A video plays from any point (range requests), as an iPhone asks.
  const videoUrl = await p.getByRole("link", { name: `${HEADLINE}: video 2 of 2` }).getAttribute("href");
  const part = await p.request.get(videoUrl!, { headers: { Range: "bytes=0-99" } });
  expect(part.status()).toBe(206);
  expect((await part.body()).byteLength).toBe(100);
  await parent.close();

  // Another family, with the address: nothing.
  const other = await newContext(browser, PHONE);
  const o = await other.newPage();
  await signIn(o, "parent18@example.com");
  expect((await o.request.get(photoUrl!)).status()).toBe(404);
  await other.close();
});

test("a photo-only message from staff, and a photo on a session the parent sees under Sessions", async ({ browser }, info) => {
  test.skip(!existsSync(ADMIN_STATE) || !hasFfmpeg, "needs parent-app.spec.ts's admin sign-in and ffmpeg");
  const { photo } = await files(info);

  // The parent says Ibrahim's coming, which gives the session's address (Add to my calendar).
  const parent = await newContext(browser, PHONE);
  const p = await parent.newPage();
  await signIn(p, PARENT);
  await p.goto("/friday");
  await p.getByRole("button", { name: "Ibrahim is coming" }).click();
  const add = p.getByRole("link", { name: /^Add to my calendar: / });
  await expect(add).toBeVisible();
  const sessionId = /\/api\/sessions\/([0-9a-f-]{36})\/ics/.exec(decodeURIComponent((await add.getAttribute("href"))!))![1];

  const admin = await newContext(browser, { ...PHONE, storageState: ADMIN_STATE });
  const page = await admin.newPage();
  await page.goto(`/admin/sessions/${sessionId}/edit`);
  await page.getByLabel("Add photos or videos").setInputFiles(photo);
  await expect(page.locator('input[type="hidden"][name="media"]')).toHaveCount(1, { timeout: 30_000 });
  await page.getByLabel(/^No, it's a small fix/).check();
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText(/^Saved\./)).toBeVisible();

  // A message to Ibrahim's family that's only a photo.
  await page.goto("/admin/families?q=Ibrahim");
  const childHref = await page.getByRole("link", { name: /Ibrahim M/ }).first().getAttribute("href");
  const childId = /\/admin\/families\/([0-9a-f-]{36})/.exec(childHref!)![1];
  await page.goto(`/admin/messages/new?child=${childId}`);
  await page.getByLabel("Add photos or videos").setInputFiles(photo);
  await expect(page.locator('input[type="hidden"][name="media"]')).toHaveCount(1, { timeout: 30_000 });
  await page.getByRole("button", { name: "Send to the family" }).click();
  await expect(page).toHaveURL(/\/admin\/messages\/[0-9a-f-]{36}\?sent=1$/);
  await expect(page.getByText("Sent a photo.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Your message: photo 1 of 1" })).toBeVisible();
  await admin.close();

  await p.goto("/friday");
  await expect(p.getByRole("link", { name: /: photo 1 of 1$/ })).toBeVisible();
  await p.screenshot({ path: shot("parent-session-media"), fullPage: true });
  await p.goto("/messages");
  await p.getByRole("link", { name: /Ibrahim/ }).first().click();
  await expect(p.getByText("Sent a photo.")).toBeVisible();
  await loaded(p, /'s message: photo 1 of 1$/, true);
  await parent.close();
});
