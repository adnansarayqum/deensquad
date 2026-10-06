import { existsSync } from "node:fs";
import { devices, expect, test, type Page } from "@playwright/test";
import jsQR from "jsqr";
import { ADMIN_STATE, newContext, shot, signIn } from "./helpers";

// The attendance QR code with no signal at the gate: the service worker (public/sw.js) shows the codes saved on the
// phone for /pass and /friday, and nothing else. Runs after parent-app.spec.ts (files run in name order), against
// the same server, and uses its saved admin sign-in to make today a session day.

const PHONE = { ...devices["Pixel 7"], viewport: { width: 390, height: 844 }, baseURL: "http://localhost:3100" };
const day = () => new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", weekday: "short", day: "numeric", month: "short" }).format(new Date());

/** The text inside a QR picture on the page, read the way a coach's scanner would. */
async function readQr(page: Page, name: string): Promise<string | null> {
  const picture = await page.getByRole("img", { name }).evaluate(async (el) => {
    const svg = el.querySelector("svg")!;
    const img = new Image();
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(svg))}`;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 300;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, 300, 300);
    ctx.drawImage(img, 0, 0, 300, 300);
    return Array.from(ctx.getImageData(0, 0, 300, 300).data);
  });
  return jsQR(new Uint8ClampedArray(picture), 300, 300)?.data ?? null;
}

test("no signal at the gate: the codes saved on the phone show for /pass and /friday, and signing out forgets them", async ({ browser }) => {
  test.skip(!existsSync(ADMIN_STATE), "run with parent-app.spec.ts: needs its saved admin sign-in");
  test.setTimeout(120_000);

  // A session today for every group, so it's a session day whatever day the suite runs. Deleted at the end.
  const adminContext = await newContext(browser, { ...PHONE, storageState: ADMIN_STATE });
  const admin = await adminContext.newPage();
  await admin.goto("/admin/sessions");
  await admin.getByLabel("Title").fill("Offline test");
  await admin.getByLabel("Date", { exact: true }).fill(new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date()));
  await admin.getByLabel("Starts").fill("00:02");
  await admin.getByLabel("Finishes").fill("23:57");
  await admin.getByRole("button", { name: "Add sessions" }).click();
  await expect(admin.getByText(/^Added 1 session\./)).toBeVisible();

  const context = await newContext(browser, { ...PHONE, extraHTTPHeaders: { "x-forwarded-for": "10.0.4.1" } });
  const page = await context.newPage();
  // No signal: the browser offline, and every request refused at the network, the service worker's included
  // (Playwright's offline mode alone doesn't reach a service worker's own fetches; context routes do).
  const everything = () => true;
  const signal = async (on: boolean) => {
    await context.setOffline(!on);
    if (on) await context.unroute(everything);
    else await context.route(everything, (route) => route.abort("internetdisconnected"));
  };
  try {
    // Idris's parent (a seeded U10 family that signs in nowhere else: each address may only ask for five codes an hour).
    await signIn(page, "parent4@example.com");

    // On a session day, Friday has the codes one tap away, in the page itself.
    await page.goto("/friday");
    await page.getByText("Show attendance QR code", { exact: true }).click();
    await expect(page.getByRole("img", { name: "QR code that checks Idris in" })).toBeVisible();
    expect(await readQr(page, "QR code that checks Idris in")).toMatch(/^DSP\.[0-9a-f-]{36}\./);
    await page.screenshot({ path: shot("friday-session-day-qr"), fullPage: true });

    // Opening Friday online saved the child's code on the phone (QR text, first name and group only), and the
    // service worker has its offline page ready.
    await page.evaluate(() => navigator.serviceWorker.ready);
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("ds-pass-cache") ?? "null"));
    expect(saved.passes.map((p: { firstName: string; ageGroup: string }) => `${p.firstName} ${p.ageGroup}`).sort()).toEqual(["Idris U10"]);
    expect(Object.keys(saved.passes[0]).sort()).toEqual(["ageGroup", "firstName", "token"]);
    await expect.poll(() => page.evaluate(async () => Boolean(await caches.match("/offline-pass.html")) && Boolean(await caches.match("/offline-pass.js")))).toBe(true);
    // Nothing else is cached: no pages with anyone's data, no /api.
    const cached = await page.evaluate(async () => {
      const urls: string[] = [];
      for (const name of await caches.keys()) for (const r of await (await caches.open(name)).keys()) urls.push(new URL(r.url).pathname);
      return urls.sort();
    });
    expect(cached).toEqual(["/offline-pass.html", "/offline-pass.js"]);

    // No signal: reloading /pass shows the saved codes, drawn on the phone, with Try again.
    await signal(false);
    await page.goto("/pass");
    await expect(page.getByText("No signal. Showing the codes saved on this phone.")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Idris · U10s" })).toBeVisible();
    expect(await readQr(page, "QR code that checks Idris in")).toBe(saved.passes[0].token);
    await page.screenshot({ path: shot("pass-offline"), fullPage: true });
    await page.emulateMedia({ colorScheme: "dark" });
    await page.screenshot({ path: shot("pass-offline-dark"), fullPage: true });
    await page.emulateMedia({ colorScheme: "light" });
    expect((await page.getByRole("button", { name: "Try again" }).boundingBox())!.height).toBeGreaterThanOrEqual(48);

    // The same for Friday; any other page is left to the browser (no offline copy of anything else).
    await page.goto("/friday");
    await expect(page.getByText("No signal. Showing the codes saved on this phone.")).toBeVisible();
    await expect(page.getByRole("img", { name: "QR code that checks Idris in" })).toBeVisible();
    const other = await context.newPage();
    await expect(other.goto("/news")).rejects.toThrow();
    await other.close();

    // Back online, Try again loads the real page.
    await signal(true);
    await page.getByRole("button", { name: "Try again" }).click();
    await expect(page.getByRole("heading", { name: "Is Idris coming?" })).toBeVisible();
    await expect(page.getByText("No signal. Showing the codes saved on this phone.")).toHaveCount(0);

    // Signing out forgets the codes: the next person on this phone sees none, even with no signal.
    await page.goto("/player");
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/sign-in$/);
    expect(await page.evaluate(() => localStorage.getItem("ds-pass-cache"))).toBeNull();
    await signal(false);
    await page.goto("/pass");
    await expect(page.getByText(/No codes are saved on this phone\./)).toBeVisible();
    await expect(page.getByRole("img", { name: /QR code that checks/ })).toHaveCount(0);
    await signal(true);
  } finally {
    await context.close();
    await admin.goto("/admin/sessions");
    await admin.getByRole("link", { name: `Delete Offline test ${day()}` }).click();
    await admin.getByRole("button", { name: "Delete session" }).click();
    await expect(admin.getByText("Deleted.")).toBeVisible();
    await adminContext.close();
  }
});
