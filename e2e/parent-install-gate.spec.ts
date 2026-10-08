import { existsSync } from "node:fs";
import { devices, expect, test, type Browser, type BrowserContext, type BrowserContextOptions, type Locator, type Page } from "@playwright/test";
import { ADMIN_STATE, GATE_PARENT_STATE as PARENT_STATE, shot, signIn, unfold } from "./helpers";

// The parent screens' "add to home screen" step (src/components/InstallGate.tsx). Runs after
// parent-app.spec.ts (files run in name order), against the same server and sample club. These are the
// only tests that don't mark the gate dismissed for the session.

const BASE = "http://localhost:3100";
const IPHONE = devices["iPhone 15"];
const PIXEL = { ...devices["Pixel 7"], viewport: { width: 390, height: 844 } };
const INSTAGRAM_UA = `${IPHONE.userAgent} Instagram 350.0.0.0 (iPhone15,4; iOS 18_0; en_GB)`;
const ANDROID_INSTAGRAM_UA = `${PIXEL.userAgent} Instagram 350.0.0.0 Android (34/14; 420dpi; 1080x2400; Google; Pixel 7; panther; panther; en_GB)`;
/** iPhone SE: the part of the screen Safari leaves for the page, and a slightly taller phone. */
const SHORT_SCREENS = [
  { width: 375, height: 553 },
  { width: 393, height: 659 },
];
const GATE = { name: "Add Deen Squad to your home screen" };

let ip = 0;
async function context(browser: Browser, options: BrowserContextOptions) {
  return browser.newContext({ baseURL: BASE, extraHTTPHeaders: { "x-forwarded-for": `10.0.3.${++ip}` }, ...options });
}

/**
 * The whole gate, scrolled content included: it's a fixed overlay the height of the screen, so the
 * screen is made tall enough to hold all of it for the picture, then put back.
 */
async function gateShot(page: Page, path: string) {
  const size = page.viewportSize()!;
  const height = await page.getByRole("dialog", GATE).evaluate((el) => el.scrollHeight);
  await page.setViewportSize({ width: size.width, height: Math.max(size.height, height) });
  await page.screenshot({ path });
  await page.setViewportSize(size);
}

/** Android without the browser's own install prompt (Samsung Internet, an in-app browser): Chromium's is held back. */
async function noBrowserPrompt(ctx: BrowserContext) {
  await ctx.addInitScript(() => {
    addEventListener(
      "beforeinstallprompt",
      (e) => {
        if (e.isTrusted) e.stopImmediatePropagation();
      },
      true,
    );
  });
}

/** Hands the page a stand-in for Chrome's install prompt. */
async function offerPrompt(page: Page) {
  await page.evaluate(() => {
    const offer = Object.assign(new Event("beforeinstallprompt", { cancelable: true }), {
      prompt: async () => {},
      userChoice: Promise.resolve({ outcome: "accepted" }),
    });
    dispatchEvent(offer);
  });
}

/** The control is on screen as the gate opens (no scrolling) and nothing covers it. */
async function onScreenUnscrolled(page: Page, control: Locator) {
  const box = (await control.boundingBox())!;
  const { height } = page.viewportSize()!;
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(height);
  expect(await page.getByRole("dialog", GATE).evaluate((el) => el.scrollTop)).toBe(0);
  expect(await control.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return hit !== null && el.contains(hit);
  })).toBe(true);
}

/** Lets the page hydrate and the gate decide, so "no gate" isn't just "not yet". */
async function settled(page: Page) {
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(500);
}

test("an iPhone parent in Safari gets the steps; Not now twice, then only Continue in browser", async ({ browser }) => {
  const ctx = await context(browser, IPHONE);
  const page = await ctx.newPage();
  await signIn(page, "parent3@example.com");

  const gate = page.getByRole("dialog", GATE);
  await expect(gate).toBeVisible();
  await expect(gate.getByRole("heading", GATE)).toBeFocused();
  await expect(gate.getByText("Get club news notifications, and open it in one tap like an app.")).toBeVisible();
  await expect(gate.getByText(/Tap the Share icon/)).toBeVisible();
  await expect(gate.getByText(/Choose Add to Home Screen/)).toBeVisible();
  await expect(gate.getByText(/Tap Add, then open Deen Squad/)).toBeVisible();
  await expect(gate.getByText("You'll sign in once more in the app. We'll email you a 6-digit code, it takes 10 seconds.")).toBeVisible();
  await expect(gate.getByRole("button", { name: "Copy link" })).toHaveCount(0);
  // The page behind doesn't scroll, and neither it nor the tab bar can be reached, while the gate is up.
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).overflow)).toBe("hidden");
  const tabs = page.locator('nav[aria-label="Main"]');
  await expect(tabs).toHaveAttribute("inert", "");
  await expect(page.locator("main").first()).toHaveAttribute("inert", "");
  const notNow = gate.getByRole("button", { name: "Not now" });
  expect((await notNow.boundingBox())!.height).toBeGreaterThanOrEqual(48);

  // Focus stays inside: Tab from the last control comes back round.
  await notNow.focus();
  await page.keyboard.press("Tab");
  await expect(notNow).toBeFocused();

  // First "Not now": gone for this visit, including on other screens.
  await notNow.click();
  await expect(gate).toHaveCount(0);
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).overflow)).not.toBe("hidden");
  await expect(page.locator("[inert]")).toHaveCount(0);
  // Focus lands at the top of the screen behind, not lost on the page.
  await expect(page.getByRole("heading", { level: 1 })).toBeFocused();
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Friday" }).click();
  await expect(page).toHaveURL(/\/friday$/);
  await settled(page);
  await expect(page.getByRole("dialog", GATE)).toHaveCount(0);
  await ctx.storageState({ path: PARENT_STATE });

  // A new visit (a fresh tab: new session, same phone): back again, and Escape counts as "Not now".
  const second = await ctx.newPage();
  await second.goto("/news");
  await expect(second.getByRole("dialog", GATE)).toBeVisible();
  await expect(second.getByRole("button", { name: "Not now" })).toBeVisible();
  await second.keyboard.press("Escape");
  await expect(second.getByRole("dialog", GATE)).toHaveCount(0);

  // After two: no "Not now", Escape does nothing, and the small link is the only way past.
  const third = await ctx.newPage();
  await third.goto("/news");
  const firm = third.getByRole("dialog", GATE);
  await expect(firm).toBeVisible();
  await expect(firm.getByRole("button", { name: "Not now" })).toHaveCount(0);
  await third.keyboard.press("Escape");
  await expect(firm).toBeVisible();
  const carryOn = firm.getByRole("button", { name: "Continue in browser" });
  expect((await carryOn.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await gateShot(third, shot("install-gate-ios-firm"));
  await carryOn.click();
  await expect(firm).toHaveCount(0);
  expect(await third.evaluate(() => localStorage.getItem("ds-install-gate-count"))).toBe("3");
  await ctx.close();
});

for (const colorScheme of ["light", "dark"] as const) {
  test(`screens for review (${colorScheme}): iPhone, Instagram's in-app browser and Android`, async ({ browser }) => {
    test.skip(!existsSync(PARENT_STATE), "run with the first gate test: needs its sign-in");

    const ios = await context(browser, { ...IPHONE, colorScheme, storageState: PARENT_STATE });
    const iosPage = await ios.newPage();
    await iosPage.goto("/news");
    await expect(iosPage.getByRole("dialog", GATE)).toBeVisible();
    await gateShot(iosPage, shot(`install-gate-ios-${colorScheme}`));
    await ios.close();

    const inApp = await context(browser, {
      ...IPHONE,
      userAgent: INSTAGRAM_UA,
      colorScheme,
      storageState: PARENT_STATE,
      permissions: ["clipboard-read", "clipboard-write"],
    });
    const inAppPage = await inApp.newPage();
    await inAppPage.goto("/news");
    const gate = inAppPage.getByRole("dialog", GATE);
    await expect(gate.getByText(/Open this page in Safari/)).toBeVisible();
    await expect(gate.getByText(/Tap the Share icon/)).toBeVisible();
    await gateShot(inAppPage, shot(`install-gate-inapp-${colorScheme}`));
    await gate.getByRole("button", { name: "Copy link" }).click();
    await expect(gate.getByRole("button", { name: "Link copied" })).toBeVisible();
    expect(await inAppPage.evaluate(() => navigator.clipboard.readText())).toMatch(/\/news$/);
    await inApp.close();

    // Instagram's in-app browser on Android: Chrome first, then the menu steps.
    const androidInApp = await context(browser, { ...PIXEL, userAgent: ANDROID_INSTAGRAM_UA, colorScheme, storageState: PARENT_STATE });
    await noBrowserPrompt(androidInApp);
    const androidInAppPage = await androidInApp.newPage();
    await androidInAppPage.goto("/news");
    const chrome = androidInAppPage.getByRole("dialog", GATE);
    await expect(chrome.getByText(/Open this page in Chrome/)).toBeVisible();
    await expect(chrome.getByText(/Tap the menu \(three dots\)/)).toBeVisible();
    await expect(chrome.getByText(/Choose Add to Home screen or Install app/)).toBeVisible();
    await expect(chrome.getByText("You'll sign in once more in Chrome. We'll email you a 6-digit code, it takes 10 seconds.")).toBeVisible();
    await expect(chrome.getByRole("button", { name: "Copy link" })).toBeVisible();
    await gateShot(androidInAppPage, shot(`install-gate-android-inapp-${colorScheme}`));
    await androidInApp.close();

    // Android with no install prompt from the browser (Samsung Internet, say): the menu steps.
    const android = await context(browser, { ...PIXEL, colorScheme, storageState: PARENT_STATE });
    await noBrowserPrompt(android);
    const androidPage = await android.newPage();
    await androidPage.goto("/news");
    const manual = androidPage.getByRole("dialog", GATE);
    await expect(manual.getByText(/Tap the menu \(three dots\)/)).toBeVisible();
    await expect(manual.getByText(/Choose Add to Home screen or Install app/)).toBeVisible();
    await expect(manual.getByText(/You'll sign in once more/)).toHaveCount(0);
    await gateShot(androidPage, shot(`install-gate-android-manual-${colorScheme}`));

    // When the browser does offer its prompt (Chrome), one button installs, then says so.
    await offerPrompt(androidPage);
    await manual.getByRole("button", { name: "Install the app" }).click();
    await expect(manual.getByText("Done. Open Deen Squad from your home screen.")).toBeVisible();
    if (colorScheme === "light") await gateShot(androidPage, shot("install-gate-android-done"));
    await android.close();
  });
}

test("on a short screen (iPhone SE in Safari) the way past is on screen without scrolling, in every variant", async ({ browser }) => {
  test.skip(!existsSync(PARENT_STATE), "run with the first gate test: needs its sign-in");

  const variants: { name: string; options: BrowserContextOptions; android?: "manual" | "prompt" }[] = [
    { name: "ios", options: IPHONE },
    { name: "inapp", options: { ...IPHONE, userAgent: INSTAGRAM_UA } },
    { name: "android-manual", options: PIXEL, android: "manual" },
    { name: "android-inapp", options: { ...PIXEL, userAgent: ANDROID_INSTAGRAM_UA }, android: "manual" },
    { name: "android-prompt", options: PIXEL, android: "prompt" },
  ];
  for (const viewport of SHORT_SCREENS) {
    for (const { name, options, android } of variants) {
      for (const colorScheme of ["light", "dark"] as const) {
        // Every combination on the smallest screen; one colour is enough on the larger one.
        if (viewport.height !== 553 && colorScheme === "dark") continue;
        await test.step(`${name} at ${viewport.width}x${viewport.height} (${colorScheme})`, async () => {
          const ctx = await context(browser, { ...options, viewport, colorScheme, storageState: PARENT_STATE });
          if (android) await noBrowserPrompt(ctx);
          const page = await ctx.newPage();
          await page.goto("/news");
          const gate = page.getByRole("dialog", GATE);
          await expect(gate).toBeVisible();
          if (android === "prompt") {
            await offerPrompt(page);
            await onScreenUnscrolled(page, gate.getByRole("button", { name: "Install the app" }));
          }
          await onScreenUnscrolled(page, gate.getByRole("button", { name: "Not now" }));
          // The steps still scroll above the footer, and the page behind stays locked.
          if (["ios", "inapp", "android-inapp"].includes(name) && viewport.height === 553) {
            expect(await gate.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
          }
          expect(await page.evaluate(() => getComputedStyle(document.documentElement).overflow)).toBe("hidden");
          if (viewport.height === 553) await page.screenshot({ path: shot(`install-gate-${name}-375x553-${colorScheme}`) });
          await ctx.close();
        });
      }
    }
  }

  // Once only "Continue in browser" is left, it's on screen too.
  const firm = await context(browser, { ...IPHONE, viewport: SHORT_SCREENS[0], storageState: PARENT_STATE });
  await firm.addInitScript(() => {
    try {
      localStorage.setItem("ds-install-gate-count", "2");
    } catch {}
  });
  const page = await firm.newPage();
  await page.goto("/news");
  await onScreenUnscrolled(page, page.getByRole("dialog", GATE).getByRole("button", { name: "Continue in browser" }));
  await page.screenshot({ path: shot("install-gate-ios-firm-375x553-light") });
  await firm.close();
});

test("the attendance QR code is never covered; the gate waits for the next screen", async ({ browser }) => {
  test.skip(!existsSync(PARENT_STATE), "run with the first gate test: needs its sign-in");
  const ctx = await context(browser, { ...IPHONE, storageState: PARENT_STATE });
  const page = await ctx.newPage();
  await page.goto("/pass");
  await expect(page.getByRole("heading", { name: /Attendance QR code/ })).toBeVisible();
  await settled(page);
  await expect(page.getByRole("dialog", GATE)).toHaveCount(0);
  await expect(page.locator("[inert]")).toHaveCount(0);
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "News" }).click();
  await expect(page).toHaveURL(/\/news$/);
  await expect(page.getByRole("dialog", GATE)).toBeVisible();
  await ctx.close();
});

test("Copy link keeps focus on the button when the clipboard API is blocked", async ({ browser }) => {
  test.skip(!existsSync(PARENT_STATE), "run with the first gate test: needs its sign-in");
  const ctx = await context(browser, { ...PIXEL, userAgent: ANDROID_INSTAGRAM_UA, storageState: PARENT_STATE });
  await noBrowserPrompt(ctx);
  // A locked-down in-app browser: no clipboard API, only the old copy command.
  await ctx.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", { value: { writeText: () => Promise.reject(new Error("blocked")) } });
    document.execCommand = () => true;
  });
  const page = await ctx.newPage();
  await page.goto("/news");
  const gate = page.getByRole("dialog", GATE);
  await gate.getByRole("button", { name: "Copy link" }).click();
  const copied = gate.getByRole("button", { name: "Link copied" });
  await expect(copied).toBeVisible();
  await expect(copied).toBeFocused();
  await ctx.close();
});

test("no gate in the installed app (standalone) or on a computer", async ({ browser }) => {
  test.skip(!existsSync(PARENT_STATE), "run with the first gate test: needs its sign-in");

  const installed = await context(browser, { ...IPHONE, storageState: PARENT_STATE });
  await installed.addInitScript(() => {
    const real = window.matchMedia.bind(window);
    window.matchMedia = (query: string) =>
      /display-mode:\s*standalone/.test(query)
        ? ({ matches: true, media: query, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false } as MediaQueryList)
        : real(query);
  });
  const app = await installed.newPage();
  await app.goto("/news");
  await expect(app.getByRole("heading", { name: "Club news" })).toBeVisible();
  await settled(app);
  await expect(app.getByRole("dialog", GATE)).toHaveCount(0);
  await installed.close();

  const desktop = await context(browser, { viewport: { width: 1280, height: 800 }, storageState: PARENT_STATE });
  const computer = await desktop.newPage();
  await computer.goto("/news");
  await expect(computer.getByRole("heading", { name: "Club news" })).toBeVisible();
  await settled(computer);
  await expect(computer.getByRole("dialog", GATE)).toHaveCount(0);
  await desktop.close();
});

test("a parent who is also on the staff never gets the gate", async ({ browser }) => {
  test.skip(!existsSync(ADMIN_STATE), "run with parent-app.spec.ts: needs the admin's saved sign-in");
  const phone = await context(browser, IPHONE);
  const page = await phone.newPage();
  await signIn(page, "parent5@example.com");
  await expect(page.getByRole("dialog", GATE)).toBeVisible();
  // A parent only: no way into the club tools.
  await expect(page.getByRole("link", { name: "Coach tools" })).toHaveCount(0);

  // The club adds them as a coach.
  const adminContext = await context(browser, { ...PIXEL, storageState: ADMIN_STATE });
  const admin = await adminContext.newPage();
  await admin.goto("/admin/staff");
  await unfold(admin, "add-staff");
  await admin.getByLabel("Name parents see").fill("Coach Idris");
  await admin.getByLabel("Email", { exact: true }).fill("parent5@example.com");
  await admin.getByRole("button", { name: "Add", exact: true }).click();
  await expect(admin.getByText("Added. They can sign in with that email straight away.")).toBeVisible();
  await adminContext.close();

  // A new visit on the same phone: still a parent, now staff, and no gate.
  const later = await phone.newPage();
  await later.goto("/news");
  await expect(later.getByRole("heading", { name: "Club news" })).toBeVisible();
  await settled(later);
  await expect(later.getByRole("dialog", GATE)).toHaveCount(0);
  // The way to their coach tools is at the top of News (and Players), and the register leads back.
  await later.getByRole("link", { name: "Coach tools" }).click();
  await expect(later).toHaveURL(/\/coach$/);
  await later.getByRole("link", { name: "Parent view" }).click();
  await expect(later).toHaveURL(/\/news$/);
  await expect(later.getByRole("link", { name: "Coach tools" })).toBeVisible();
  await phone.close();
});
