import { execFileSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { devices, expect, test } from "@playwright/test";
import QRCode from "qrcode";
import sharp, { type Sharp } from "sharp";
import { ADMIN_STATE, COACH_STATE, newContext, shot, signIn } from "./helpers";

// The gate scanner with real camera pictures, not clean computer-made codes. On Fri 30 Oct 2026, the first session in
// the dark, the scanner read one code and then nothing: jsQR throws on some frames when it looks for a light-on-dark
// code (the inverted pass, added 18 Oct), and the throw ended the frame loop. e2e/fixtures/gate-photo-dark.jpg is a
// photo from that evening of a parent's phone held up at the gate (names blurred, its code swapped for a stand-in);
// it makes jsQR throw on every inverted pass. Here each test puts a real child's code into that photo, feeds it to the
// coach's camera, and checks the scanner checks the child in and keeps reading after the frames that throw.
//
// Runs after parent-app.spec.ts (its saved coach sign-in and today's "Gate test" session for U7). Nuh E. (parent16, U7)
// is checked in and undone each time; no other spec counts his attendance.

test.describe.configure({ mode: "serial" });

const PHONE = { ...devices["Pixel 7"], viewport: { width: 390, height: 844 }, baseURL: "http://localhost:3100" };
const PHOTO = resolve("e2e/fixtures/gate-photo-dark.jpg");
// Where the code sits in the fixture photo (1000px wide).
const CODE_BOX = { left: 199, top: 380, size: 427 };

const hasFfmpeg = (() => {
  try {
    execFileSync("ffmpeg", ["-version"]);
    return true;
  } catch {
    return false;
  }
})();

/** Nuh's real attendance QR text, as his parent's phone keeps it. */
let nuh: string | null = null;
async function nuhToken(browser: import("@playwright/test").Browser): Promise<string> {
  // Signed in once for all four tests: each email may ask for only five codes an hour, and parent16 signs in elsewhere.
  if (nuh) return nuh;
  const context = await newContext(browser, PHONE);
  const page = await context.newPage();
  await signIn(page, "parent16@example.com");
  await page.goto("/pass");
  const token = await expect
    .poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("ds-pass-cache") ?? "null")?.passes?.[0]?.token ?? null))
    .toMatch(/^DSP\./)
    .then(() => page.evaluate(() => JSON.parse(localStorage.getItem("ds-pass-cache")!).passes[0].token as string));
  await context.close();
  nuh = token;
  return token;
}

type Look = { name: string; edit: (img: Sharp) => Sharp };
// The ways a code reaches the camera at the gate.
const LOOKS: Look[] = [
  { name: "as photographed in the dark", edit: (img) => img },
  { name: "dimmer, as a phone on half brightness", edit: (img) => img.linear(0.55, 0) },
  { name: "slightly out of focus", edit: (img) => img.blur(1.4) },
  { name: "washed out by glare", edit: (img) => img.linear(0.6, 95) },
];

/** The fixture photo with `token`'s code in place of the stand-in, changed by `look`, as a looping camera file. */
async function cameraFile(token: string, look: Look, out: string): Promise<void> {
  const code = await QRCode.toBuffer(token, { errorCorrectionLevel: "M", margin: 0, width: CODE_BOX.size });
  const photo = await look.edit(sharp(PHOTO).composite([{ input: code, left: CODE_BOX.left, top: CODE_BOX.top }])).jpeg({ quality: 88 }).toBuffer();
  const still = `${out}.jpg`;
  writeFileSync(still, photo);
  // Upright, as a phone camera's 1280x720 picture with the parent's phone filling the middle.
  execFileSync("ffmpeg", [
    "-v", "error", "-y", "-loop", "1", "-i", still, "-t", "2",
    "-vf", "scale=720:-2,crop=720:720:0:68,pad=1280:720:(ow-iw)/2:0,format=yuv420p",
    "-r", "10", out,
  ]);
}

// The first scanner, and the rebuilt one a phone can switch to ("Try the new scanner", kept in localStorage).
const SCANNERS = ["usual", "new"] as const;

for (const which of SCANNERS)
for (const look of LOOKS) {
  const title =
    which === "usual"
      ? `the scanner reads a code ${look.name}, keeps reading, and skips no pictures`
      : `the new scanner reads a code ${look.name}, shows it is reading, and skips no pictures`;
  test(title, async ({ browser, playwright }) => {
    test.skip(!existsSync(COACH_STATE) || !hasFfmpeg, "run with parent-app.spec.ts (its coach sign-in and Gate test session); needs ffmpeg");
    const token = await nuhToken(browser);
    const video = resolve(`e2e/.results/scanner-${look.name.replace(/\W+/g, "-")}.y4m`);
    await cameraFile(token, look, video);

    const camera = await playwright.chromium.launch({
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined,
      args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-video-capture=${video}`],
    });
    try {
      const context = await newContext(camera, { ...PHONE, storageState: COACH_STATE, permissions: ["camera"] });
      if (which === "new") await context.addInitScript(() => localStorage.setItem("ds-new-scanner", "1"));
      const coach = await context.newPage();
      const skipped: string[] = [];
      const crashes: string[] = [];
      coach.on("console", (m) => /^\[scanner\] (frame|picture) skipped/.test(m.text()) && skipped.push(m.text()));
      coach.on("pageerror", (e) => crashes.push(e.message));
      const scans: string[] = [];
      coach.on("request", (r) => r.url().endsWith("/api/coach/scan") && scans.push(r.postData() ?? ""));

      await coach.goto("/coach?group=U7");
      const gateTest = coach.getByRole("navigation", { name: "Today's sessions" }).getByRole("link", { name: /Gate test/ });
      if (await gateTest.count()) await gateTest.click();
      await expect(coach.getByText(/^Gate test · /)).toBeVisible();
      await coach.getByRole("button", { name: "Scan QR codes" }).click();
      const scanner = coach.getByRole("dialog", { name: "Scan attendance QR codes" });
      await expect(scanner).toBeVisible();
      expect(await scanner.getAttribute("data-scanner")).toBe(which === "new" ? "new" : null);
      await expect(scanner.getByText("Nuh E.")).toBeVisible({ timeout: 15_000 });
      // The new scanner shows that pictures are being read.
      if (which === "new") await expect(scanner.locator("[data-reading]")).toBeVisible();
      await expect(scanner.getByText("U7 · Checked in", { exact: true })).toBeVisible();
      await coach.screenshot({ path: shot(`scanner-${look.name.replace(/\W+/g, "-")}`) });

      // Still reading: the same code is read again once the 6-second "just scanned" pause is over.
      await expect.poll(() => scans.length, { timeout: 15_000 }).toBeGreaterThanOrEqual(2);
      expect(scans.every((s) => s.includes(token))).toBe(true);
      // The frames that throw were met (the inverted pass on this photo) and none stopped the page.
      // Neither scanner throws a picture away: until 14 Nov 2026 the first one's light-on-dark pass threw on every
      // picture (jsQR's "onlyInvert"), which this test took for a few bad frames.
      expect(skipped).toEqual([]);
      expect(crashes).toEqual([]);

      if (which === "new" && look.name === "as photographed in the dark") {
        // The reader stops (as on 30 Oct 2026, when the loop died): the screen says so instead of looking normal,
        // points to Mark here once it has happened twice, and reads again as soon as pictures come back.
        await coach.evaluate(() => {
          const w = window as unknown as { __raf: typeof requestAnimationFrame };
          w.__raf = window.requestAnimationFrame;
          window.requestAnimationFrame = () => 0;
        });
        await expect(scanner.getByText("The scanner stopped. Restarting…")).toBeVisible({ timeout: 8000 });
        await expect(scanner.locator("[data-reading]")).toHaveCount(0);
        await expect(scanner.getByText(/use Mark here if it doesn't come back/)).toBeVisible({ timeout: 8000 });
        const before = scans.length;
        await coach.evaluate(() => {
          const w = window as unknown as { __raf: typeof requestAnimationFrame };
          window.requestAnimationFrame = w.__raf;
        });
        await expect(scanner.getByText("The scanner stopped. Restarting…")).toHaveCount(0, { timeout: 15_000 });
        await expect.poll(() => scans.length, { timeout: 20_000 }).toBeGreaterThan(before);
        await expect(scanner.getByText("Nuh E.")).toBeVisible();
      }

      await scanner.getByRole("button", { name: "Close the scanner" }).click();
      const here = coach.getByRole("region", { name: /^Here/ });
      await here.getByRole("button", { name: "Undo check-in for Nuh E." }).click();
      await expect(here.getByRole("button", { name: "Undo check-in for Nuh E." })).toHaveCount(0);
      await context.close();
    } finally {
      await camera.close();
    }
  });
}

test("an admin switches their own phone to the new scanner and back; a coach isn't offered it", async ({ browser }) => {
  test.skip(!existsSync(COACH_STATE) || !existsSync(ADMIN_STATE), "run with parent-app.spec.ts (its admin and coach sign-ins)");
  const adminContext = await newContext(browser, { ...PHONE, storageState: ADMIN_STATE });
  const admin = await adminContext.newPage();
  await admin.goto("/coach?group=U7");
  const dialog = admin.getByRole("dialog", { name: "Scan attendance QR codes" });
  const scan = admin.getByRole("button", { name: "Scan QR codes" });
  // The usual scanner unless this phone has chosen otherwise.
  if (await scan.isEnabled()) {
    await scan.click();
    expect(await dialog.getAttribute("data-scanner")).toBeNull();
    await dialog.getByRole("button", { name: "Close the scanner" }).click();
    await expect(dialog).toHaveCount(0);
  }
  await admin.getByRole("button", { name: "Try the new scanner" }).click();
  await expect(admin.getByText("This phone is using the new scanner.")).toBeVisible();
  if (await scan.isEnabled()) {
    await scan.click();
    await expect(dialog).toHaveAttribute("data-scanner", "new");
    // No camera on this test phone: it says so and points to Mark here, as the usual one does.
    await expect(dialog.getByText(/The camera didn't open|Opening the camera|Hold the parent's QR code/)).toBeVisible();
    await dialog.getByRole("button", { name: "Close the scanner" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(admin).toHaveURL(/\/coach/);
  }
  // Kept on the phone: still on after a reload, and off again with one tap.
  await admin.reload();
  await admin.getByRole("button", { name: "Go back to the usual scanner" }).click();
  await expect(admin.getByRole("button", { name: "Try the new scanner" })).toBeVisible();
  await adminContext.close();

  const coachContext = await newContext(browser, { ...PHONE, storageState: COACH_STATE });
  const coach = await coachContext.newPage();
  await coach.goto("/coach?group=U7");
  await expect(coach.getByRole("button", { name: "Scan QR codes" })).toBeVisible();
  await expect(coach.getByRole("button", { name: "Try the new scanner" })).toHaveCount(0);
  await coachContext.close();
});
