import { readFileSync } from "node:fs";
import { expect, type Browser, type BrowserContext, type BrowserContextOptions, type Page } from "@playwright/test";

// Shared by the e2e specs. Screenshots land in e2e/.results/screens.

export const shot = (name: string) => `e2e/.results/screens/${name}.png`;
export const OUTBOX = "e2e/.results/outbox.jsonl";
/** The second server's (analytics on, port 3101; playwright.config.ts) emails. */
export const ANALYTICS_OUTBOX = "e2e/.results/outbox-analytics.jsonl";
// Signed-in browser state saved by earlier tests, so the desktop dashboard test doesn't use up more
// codes (each address may only ask for five an hour, and the admin has used all five by then).
export const ADMIN_STATE = "e2e/.results/admin-state.json";
export const COACH_STATE = "e2e/.results/coach-state.json";
/** The install gate tests' parent sign-in (e2e/parent-install-gate.spec.ts). */
export const GATE_PARENT_STATE = "e2e/.results/gate-parent-state.json";
/** The family that signs up in e2e/parent-your-data.spec.ts. */
export const YOUR_DATA_PARENT_STATE = "e2e/.results/your-data-parent-state.json";
/** The family with a daughter in Girls (e2e/parent-girls.spec.ts). */
export const GIRLS_PARENT_STATE = "e2e/.results/girls-parent-state.json";
// All five are deleted at the start of every run (e2e/global-setup.ts).

export function latestCode(email: string, outbox = OUTBOX): string {
  const lines = readFileSync(outbox, "utf8").trim().split("\n").map((l) => JSON.parse(l) as { to: string; subject: string; text: string });
  const mail = lines.filter((m) => m.to === email).at(-1);
  const code = mail?.subject.match(/^(\d{6})/)?.[1];
  if (!code) throw new Error(`No code emailed to ${email}`);
  return code;
}

/** Leaves the page first: an in-flight prefetch can otherwise re-set the session cookie after it's cleared. */
export async function switchUser(page: Page) {
  await page.goto("about:blank");
  await page.context().clearCookies();
}

export async function signIn(page: Page, email: string, outbox = OUTBOX) {
  await page.goto("/sign-in");
  await page.getByLabel("Email address").fill(email);
  await page.getByRole("button", { name: "Email me a code" }).click();
  await expect(page).toHaveURL(/\/sign-in\/code$/);
  await page.getByLabel("6-digit code").fill(latestCode(email, outbox));
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).not.toHaveURL(/\/sign-in/);
}

/**
 * The phone-sized test browser would otherwise get the parent screens' "add to home screen" step
 * (src/components/InstallGate.tsx) on every visit. Marks it dismissed for the session on every page, so
 * it stays out of the way. Only the install gate tests leave it out.
 */
export async function skipInstallGate(context: BrowserContext) {
  await context.addInitScript(() => {
    try {
      sessionStorage.setItem("ds-install-gate-dismissed", "1");
    } catch {}
  });
}

/** A new browser context with the install gate out of the way, like the default one. */
export async function newContext(browser: Browser, options?: BrowserContextOptions) {
  const context = await browser.newContext(options);
  await skipInstallGate(context);
  return context;
}
