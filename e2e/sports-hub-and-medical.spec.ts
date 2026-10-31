import { existsSync } from "node:fs";
import { devices, expect, test, type BrowserContext, type Page } from "@playwright/test";
import jsQR from "jsqr";
import QRCode from "qrcode";
import sharp from "sharp";
import { ADMIN_STATE, COACH_STATE, YOUR_DATA_PARENT_STATE, newContext, shot, unfold, editStaff } from "./helpers";

// A parent keeps their own sports hub entry QR code on /pass (read from a screenshot on the phone, drawn again, kept for
// no signal), and adds a child's medical and additional needs, which the child's group's coach sees behind a "Medical
// info" link on the register, and a coach of another group doesn't. Uses the family that signed itself up in
// parent-your-data.spec.ts (Maryam Haddad: Layla in U10, Zaid in U7) and the admin and coach sign-ins saved by
// parent-app.spec.ts; files run in name order, so all three are there.

test.describe.configure({ mode: "serial" });
// A missing control fails in seconds rather than holding the whole test until its timeout.
test.use({ actionTimeout: 15_000 });

const PHONE = { ...devices["Pixel 7"], viewport: { width: 390, height: 844 }, baseURL: "http://localhost:3100" };
const HUB = "https://hub.example/entry/HADDAD-0042?pass=7781";

const londonToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date());
const londonDay = () => new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", weekday: "short", day: "numeric", month: "short" }).format(new Date());

/** The text inside a QR picture (an <img> with this name), read the way a scanner would. */
async function readQr(page: Page, name: string): Promise<string | null> {
  const picture = await page.getByRole("img", { name, exact: true }).evaluate(async (el) => {
    // The QR picture is the <img> itself: a small PNG the phone shows scaled up with sharp edges.
    const img = el as HTMLImageElement;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 400;
    const ctx = canvas.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, 400, 400);
    ctx.drawImage(img, 0, 0, 400, 400);
    return Array.from(ctx.getImageData(0, 0, 400, 400).data);
  });
  return jsQR(new Uint8ClampedArray(picture), 400, 400)?.data ?? null;
}

/** A phone screenshot of the hub's web page with the entry code on it. */
async function hubScreenshot(): Promise<Buffer> {
  const qr = await QRCode.toBuffer(HUB, { type: "png", width: 700, margin: 2 });
  return sharp({ create: { width: 1170, height: 2532, channels: 4, background: "#eef1f4" } })
    .composite([{ input: qr, top: 900, left: 235 }])
    .png()
    .toBuffer();
}

/** No signal: the browser offline and every request refused at the network, the service worker's own fetches included. */
const everything = () => true; // one matcher, so unroute finds it again
async function noSignal(context: BrowserContext, off: boolean) {
  await context.setOffline(off);
  if (off) await context.route(everything, (route) => route.abort("internetdisconnected"));
  else await context.unroute(everything);
}

test("a parent keeps their sports hub entry code beside the QR codes: read from a screenshot, there with no signal, only theirs", async ({ browser }) => {
  test.setTimeout(120_000);
  test.skip(!existsSync(ADMIN_STATE) || !existsSync(YOUR_DATA_PARENT_STATE), "run with parent-app.spec.ts and parent-your-data.spec.ts");
  const context = await newContext(browser, { ...PHONE, storageState: YOUR_DATA_PARENT_STATE });
  const page = await context.newPage();
  await page.goto("/pass");
  const card = page.getByRole("region", { name: "Your sports hub entry code" });
  await expect(card.getByText(/Add your Bobby Moore Sports Hub entry code from your screenshots\./)).toBeVisible();
  await expect(card.getByText(/Only you can see it/)).toBeVisible();
  await page.screenshot({ path: shot("pass-hub-empty"), fullPage: true });

  // One button opens the picker and saves straight away: no separate Save to press after it's saved.
  await expect(card.getByRole("button", { name: "Save screenshot" })).toHaveCount(0);
  expect((await card.locator('label[for="hub-screenshot"]').boundingBox())!.height).toBeGreaterThanOrEqual(48);
  // The phone reads the code in the screenshot and the page draws it again, crisp.
  await card.getByLabel("Add screenshot").setInputFiles({ name: "IMG_0042.PNG", mimeType: "image/png", buffer: await hubScreenshot() });
  await expect(card.getByRole("status")).toHaveText("Saved. Your code is ready for the gate.");
  await expect(card.getByRole("img", { name: "Your sports hub entry QR code" })).toBeVisible();
  expect(await readQr(page, "Your sports hub entry QR code")).toBe(HUB);
  await expect(card.getByText("This phone keeps a copy for when there's no signal.", { exact: false })).toBeVisible();
  expect((await card.getByRole("button", { name: "Remove your sports hub entry code" }).boundingBox())!.height).toBeGreaterThanOrEqual(48);
  await page.reload();
  await card.getByRole("img", { name: "Your sports hub entry QR code" }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: shot("pass-hub-code") });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.screenshot({ path: shot("pass-hub-code-dark") });
  await page.emulateMedia({ colorScheme: "light" });

  // Kept on the phone (its text only) with the children's codes, and drawn by the offline page with no signal.
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("ds-pass-cache") ?? "null")?.hub)).toEqual({ text: HUB });
  await expect.poll(() => page.evaluate(async () => Boolean(await caches.match("/offline-pass.html")) && Boolean(await caches.match("/offline-pass.js")))).toBe(true);
  await noSignal(context, true);
  try {
    await page.goto("/pass");
    await expect(page.getByText("No signal. Showing the codes saved on this phone.")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Your sports hub entry code" })).toBeVisible();
    expect(await readQr(page, "Your sports hub entry QR code")).toBe(HUB);
    await expect(page.getByRole("img", { name: "QR code that checks Layla in" })).toBeVisible();
    await page.getByRole("heading", { name: "Your sports hub entry code" }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: shot("pass-hub-offline") });
  } finally {
    await noSignal(context, false);
  }

  // A picture with no readable code is kept as it is, opens for this parent only, and is kept for no signal too.
  await page.goto("/pass");
  const plain = await sharp({ create: { width: 900, height: 600, channels: 3, background: "#c84" } }).png().toBuffer();
  await card.getByLabel("Replace screenshot").setInputFiles({ name: "photo.png", mimeType: "image/png", buffer: plain });
  await expect(card.getByRole("status")).toHaveText("We couldn't read the QR code in that screenshot, so it's saved as it is. Check the whole code shows.");
  const image = card.getByRole("img", { name: "Your sports hub entry code (your screenshot)" });
  await expect(image).toBeVisible();
  const src = (await image.getAttribute("src"))!;
  expect(src).toMatch(/^\/api\/files\/[0-9a-f-]{36}$/);
  const file = await page.request.get(src);
  expect(file.status()).toBe(200);
  expect(file.headers()["cache-control"]).toBe("private, no-store");
  const staff = await newContext(browser, { ...PHONE, storageState: ADMIN_STATE });
  expect((await staff.request.get(`http://localhost:3100${src}`)).status()).toBe(404);
  await staff.close();
  await expect
    .poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("ds-pass-cache") ?? "null")?.hub?.image?.slice(0, 22)))
    .toBe("data:image/png;base64,");

  // Remove: back to the empty card; the offline copy forgets it.
  await card.getByRole("button", { name: "Remove your sports hub entry code" }).click();
  await expect(card.getByRole("status")).toHaveText("Your sports hub entry code is removed.");
  await expect(card.getByLabel("Add screenshot")).toBeVisible();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("ds-pass-cache") ?? "null")?.hub ?? null)).toBeNull();
  await context.close();
});

test("medical and additional needs: saved by the parent with consent; the U7 coach sees Zaid's behind a link, not Layla's (U10)", async ({ browser }) => {
  test.setTimeout(150_000);
  test.skip(!existsSync(ADMIN_STATE) || !existsSync(COACH_STATE) || !existsSync(YOUR_DATA_PARENT_STATE), "run with parent-app.spec.ts and parent-your-data.spec.ts");

  // Coach Hamza runs the U7s only; a session today for the U7s and U10s.
  const adminContext = await newContext(browser, { ...PHONE, storageState: ADMIN_STATE });
  const admin = await adminContext.newPage();
  await admin.goto("/admin/staff");
  await editStaff(admin, "Coach Hamza");
  const groups = admin.getByRole("form", { name: "Coach Hamza's groups" });
  await groups.getByLabel("U7").check();
  await groups.getByRole("button", { name: "Save groups" }).click();
  await expect(groups.getByLabel("U7")).toBeChecked();
  await admin.goto("/admin/sessions");
  await unfold(admin, "add-sessions");
  await admin.getByLabel("Title").fill("Medical gate");
  await admin.getByLabel("Date", { exact: true }).fill(londonToday());
  await admin.getByLabel("Starts").fill("00:04");
  await admin.getByLabel("Finishes").fill("23:56");
  for (const g of ["U6", "U12", "U15"]) await admin.getByLabel(g, { exact: true }).uncheck();
  for (const g of ["U7", "U10"]) await admin.getByLabel(g, { exact: true }).check();
  await admin.getByRole("button", { name: "Add sessions" }).click();
  await expect(admin.getByText(/^Added 1 session\./)).toBeVisible();
  const session = (await admin.getByRole("link", { name: `Edit Medical gate ${londonDay()}` }).getAttribute("href"))!.split("/")[3];

  const context = await newContext(browser, { ...PHONE, storageState: YOUR_DATA_PARENT_STATE });
  const page = await context.newPage();
  try {
    // On a session day, Friday's QR section offers the parent's own sports hub code (removed in the test above).
    await page.goto("/friday");
    await page.getByText("Show attendance QR codes", { exact: true }).click();
    await expect(page.getByRole("region", { name: "Your sports hub entry code" }).getByRole("link", { name: "Add your sports hub entry code" })).toHaveAttribute("href", "/pass");

    // The To-do list offers it, as optional, without counting it as a step.
    await page.goto("/checklist");
    await expect(page.getByRole("link", { name: /Medical and additional needs \(optional\).*Zaid/ })).toBeVisible();

    await page.goto("/player");
    // Player shows one child at a time: switch to Zaid first.
    await page.getByRole("navigation", { name: "Choose a child" }).getByRole("link", { name: "Zaid" }).click();
    await page.getByRole("region", { name: "Zaid's details" }).getByRole("link", { name: /^Name, date of birth and photo/ }).click();
    await expect(page).toHaveURL(/\/player\/child\/[0-9a-f-]{36}$/);
    const zaid = page.url().split("/").at(-1)!;
    await page.getByRole("link", { name: /Medical and additional needs/ }).click();
    await expect(page).toHaveURL(new RegExp(`/player/child/${zaid}/medical$`));
    await page.getByLabel("Conditions or needs (e.g. ADHD, autism, asthma)").fill("Autism");
    await page.getByLabel(/How the coaches can help/).fill("Give him a moment before instructions.");
    // No consent, nothing saved, and nothing typed is lost.
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.locator("main").getByRole("alert")).toHaveText("Tick the box to agree to the coaches seeing this, or leave it blank.");
    await expect(page.getByLabel("Conditions or needs (e.g. ADHD, autism, asthma)")).toHaveValue("Autism");
    await page.getByText("I agree to the club's coaches for Zaid's group and the club's admins seeing this, to look after Zaid.", { exact: false }).click();
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.locator("main").getByRole("status")).toHaveText("Saved. Zaid's coaches can see it.");
    await expect(page.getByLabel("Conditions or needs (e.g. ADHD, autism, asthma)")).toHaveValue("Autism");
    await page.screenshot({ path: shot("player-medical"), fullPage: true });
    await page.emulateMedia({ colorScheme: "dark" });
    await page.screenshot({ path: shot("player-medical-dark"), fullPage: true });
    await page.emulateMedia({ colorScheme: "light" });

    // Layla (U10) too.
    await page.goto("/player");
    await page.getByRole("navigation", { name: "Choose a child" }).getByRole("link", { name: "Layla" }).click();
    await page.getByRole("region", { name: "Layla's details" }).getByRole("link", { name: /^Name, date of birth and photo/ }).click();
    await expect(page).toHaveURL(/\/player\/child\/[0-9a-f-]{36}$/);
    const layla = page.url().split("/").at(-1)!;
    await page.goto(`/player/child/${layla}/medical`);
    await page.getByLabel("Allergies").fill("Peanuts");
    await page.getByText(/^I agree to the club's coaches for Layla's group/).click();
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.locator("main").getByRole("status")).toHaveText("Saved. Layla's coaches can see it.");

    // The U7 coach: a "Medical info" link on Zaid's row (the list never shows the details), and the details behind it.
    const coachContext = await newContext(browser, { ...PHONE, storageState: COACH_STATE });
    const coach = await coachContext.newPage();
    await coach.goto(`/coach?session=${session}&group=U7`);
    expect((await coach.getByRole("heading", { name: /^Not here yet/ }).boundingBox())!.y).toBeLessThan(700);
    const row = coach.getByRole("region", { name: /^Not here yet/ }).getByRole("listitem").filter({ hasText: "Zaid H." });
    const link = row.getByRole("link", { name: "Medical info for Zaid H." });
    await expect(link).toBeVisible();
    await expect(row).not.toContainText("Autism");
    // The pill wraps under the name, never pushing Mark here under the row.
    expect((await row.getByRole("button", { name: "Mark Zaid H. here" }).boundingBox())!.x).toBeGreaterThan(200);
    await expect(coach.getByRole("link", { name: /^Medical info for/ })).toHaveCount(1);
    await row.scrollIntoViewIfNeeded();
    await coach.screenshot({ path: shot("coach-register-medical") });
    await coach.emulateMedia({ colorScheme: "dark" });
    await coach.screenshot({ path: shot("coach-register-medical-dark") });
    await coach.emulateMedia({ colorScheme: "light" });
    await link.click();
    await expect(coach).toHaveURL(new RegExp(`/coach/child/${zaid}/medical`));
    await expect(coach.getByText("Autism", { exact: true })).toBeVisible();
    await expect(coach.getByText("Give him a moment before instructions.")).toBeVisible();
    await expect(coach.getByText(/^Last updated by the parent on \d{1,2} \w{3} \d{4}\.$/)).toBeVisible();
    await coach.screenshot({ path: shot("coach-medical"), fullPage: true });
    await coach.getByRole("link", { name: "← Register" }).click();
    await expect(coach).toHaveURL(new RegExp(`/coach\\?session=${session}&group=U7$`));
    // Not Layla's: she's in the U10s, which aren't this coach's.
    expect((await coach.goto(`/coach/child/${layla}/medical`))?.status()).toBe(404);
    await coachContext.close();

    // The admin sees both, on the Families child page.
    await admin.goto(`/admin/families/${zaid}`);
    await expect(admin.getByRole("heading", { name: "Medical and additional needs" })).toBeVisible();
    await expect(admin.getByText("Autism", { exact: true })).toBeVisible();
    await admin.goto(`/admin/families/${layla}`);
    await expect(admin.getByText("Peanuts", { exact: true })).toBeVisible();

    // The parent removes Layla's.
    await page.goto(`/player/child/${layla}/medical`);
    await page.getByRole("button", { name: "Remove all medical information" }).click();
    await expect(page.locator("main").getByRole("alert")).toHaveText("Tick the box to confirm, then tap Remove.");
    await page.getByText("Yes, remove all of Layla's medical information").click();
    await page.getByRole("button", { name: "Remove all medical information" }).click();
    await expect(page.locator("main").getByRole("status")).toHaveText("Layla's medical information is removed.");
    await expect(page.getByLabel("Allergies")).toHaveValue("");
    await admin.goto(`/admin/families/${layla}`);
    await expect(admin.getByText("Layla's parents haven't added any.")).toBeVisible();
  } finally {
    await context.close();
    await admin.goto("/admin/sessions");
    await admin.getByRole("link", { name: `Edit Medical gate ${londonDay()}` }).click();
    await admin.getByRole("link", { name: "Delete this session" }).click();
    await admin.getByRole("button", { name: "Delete session" }).click();
    await expect(admin.getByText("Deleted.")).toBeVisible();
    await admin.goto("/admin/staff");
    await editStaff(admin, "Coach Hamza");
    const after = admin.getByRole("form", { name: "Coach Hamza's groups" });
    await after.getByLabel("U7").uncheck();
    await after.getByLabel("All groups").check();
    await after.getByRole("button", { name: "Save groups" }).click();
    await expect(after.getByLabel("U7")).not.toBeChecked();
    await adminContext.close();
  }
});
